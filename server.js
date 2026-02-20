const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const MAX_BODY_BYTES = 32 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    let raw = "";

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      total += Buffer.byteLength(chunk);
      if (total > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      raw += chunk;
    });

    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

async function parseJsonBody(req) {
  const raw = await parseBody(req);
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (_err) {
    const err = new Error("Request body must be valid JSON.");
    err.status = 400;
    throw err;
  }
}

function getRedirectUri(req) {
  if (process.env.STRAVA_REDIRECT_URI) {
    return process.env.STRAVA_REDIRECT_URI;
  }

  const host = req.headers.host || `localhost:${PORT}`;
  return `http://${host}/`;
}

function isRunActivity(activity) {
  return activity?.sport_type === "Run" || activity?.type === "Run" || activity?.type === "VirtualRun";
}

function formatRun(activity) {
  const distanceMeters = Number(activity.distance || 0);
  const movingSec = Number(activity.moving_time || 0);
  const distanceMi = distanceMeters / 1609.344;
  const paceMinPerMi = distanceMi > 0 && movingSec > 0 ? movingSec / 60 / distanceMi : null;

  return {
    id: activity.id,
    name: activity.name || "Run",
    start_date: activity.start_date,
    start_date_local: activity.start_date_local,
    distance_mi: distanceMi,
    moving_time_sec: movingSec,
    elapsed_time_sec: Number(activity.elapsed_time || 0),
    pace_min_per_mi: paceMinPerMi,
    type: activity.type,
    sport_type: activity.sport_type,
  };
}

function getStravaErrorMessage(status, body, fallback) {
  const details = Array.isArray(body?.errors)
    ? body.errors
        .map((entry) => `${entry.resource || "resource"}.${entry.field || "field"}.${entry.code || "code"}`)
        .join(", ")
    : "";
  const base = body?.message || fallback;
  return details ? `${base} (${details})` : `${base} (HTTP ${status})`;
}

async function exchangeCodeForToken(code, req) {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    const err = new Error("Server is missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET.");
    err.status = 500;
    throw err;
  }

  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: getRedirectUri(req),
  });

  let response;
  try {
    response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  } catch (_err) {
    const err = new Error("Could not reach Strava token endpoint.");
    err.status = 502;
    throw err;
  }

  let body = {};
  try {
    body = await response.json();
  } catch (_err) {}

  if (!response.ok || !body?.access_token) {
    const err = new Error(
      getStravaErrorMessage(response.status, body, "Strava token exchange failed.")
    );
    err.status = response.status || 500;
    throw err;
  }

  return body.access_token;
}

async function fetchLatestRun(token) {
  let response;
  try {
    response = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=30&page=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (_err) {
    const err = new Error("Could not reach Strava activities endpoint.");
    err.status = 502;
    throw err;
  }

  let body = [];
  try {
    body = await response.json();
  } catch (_err) {}

  if (!response.ok) {
    const err = new Error(
      getStravaErrorMessage(response.status, body, "Strava activities request failed.")
    );
    err.status = response.status || 500;
    throw err;
  }

  const activities = Array.isArray(body) ? body : [];
  const latestRun = activities.find(isRunActivity);
  return latestRun ? formatRun(latestRun) : null;
}

async function handleStravaConfig(req, res) {
  const clientId = process.env.STRAVA_CLIENT_ID || "";
  const redirectUri = getRedirectUri(req);
  const configured = Boolean(clientId && process.env.STRAVA_CLIENT_SECRET);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
  });

  sendJson(res, 200, {
    configured,
    clientId,
    redirectUri,
    authorizeUrl: clientId ? `https://www.strava.com/oauth/authorize?${params.toString()}` : "",
  });
}

async function handleLatestRun(req, res) {
  let body;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    sendJson(res, err.status || 400, { error: err.message });
    return;
  }

  const code = String(body.code || "").trim();
  if (!code) {
    sendJson(res, 400, { error: "Missing OAuth code in request body." });
    return;
  }

  try {
    const token = await exchangeCodeForToken(code, req);
    const run = await fetchLatestRun(token);

    if (!run) {
      sendJson(res, 200, {
        run: null,
        message: "Connected successfully, but no run activities were found in your recent Strava activities.",
      });
      return;
    }

    sendJson(res, 200, { run });
  } catch (err) {
    const status = Number(err.status || 500);
    sendJson(res, status, { error: err.message });
  }
}

function resolveFilePath(urlPathname) {
  const requestPath = decodeURIComponent(urlPathname.split("?")[0]);
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const relPath = safePath === "/" ? "/index.html" : safePath;
  return path.join(ROOT, relPath);
}

function serveStatic(req, res) {
  const filePath = resolveFilePath(req.url || "/");

  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request");
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/strava/config")) {
    await handleStravaConfig(req, res);
    return;
  }

  if (req.method === "POST" && req.url.startsWith("/api/strava/latest-run")) {
    await handleLatestRun(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  process.stdout.write(`Running Tracker server: http://localhost:${PORT}\n`);
});
