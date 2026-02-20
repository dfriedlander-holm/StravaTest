const statusEl = document.getElementById("status");
const connectLinkEl = document.getElementById("connectLink");
const resultPanelEl = document.getElementById("resultPanel");
const runNameEl = document.getElementById("runName");
const runDateEl = document.getElementById("runDate");
const runDistanceEl = document.getElementById("runDistance");
const runTimeEl = document.getElementById("runTime");
const runPaceEl = document.getElementById("runPace");
const apiBase = String(window.RUNNING_TRACKER_API_BASE || "").replace(/\/+$/, "");

function apiUrl(path) {
  return `${apiBase}${path}`;
}

function setStatus(message, kind = "") {
  statusEl.className = `status ${kind}`.trim();
  statusEl.textContent = message;
}

function formatDuration(totalSeconds) {
  const seconds = Number(totalSeconds || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(remSeconds).padStart(2, "0")}s`;
  }

  return `${minutes}m ${String(remSeconds).padStart(2, "0")}s`;
}

function formatPace(paceMinPerMi) {
  const pace = Number(paceMinPerMi);
  if (!Number.isFinite(pace) || pace <= 0) return "-";

  const mins = Math.floor(pace);
  const secs = Math.round((pace - mins) * 60)
    .toString()
    .padStart(2, "0");

  return `${mins}:${secs} /mi`;
}

function renderRun(run) {
  runNameEl.textContent = run.name || "Run";

  const timestamp = run.start_date_local || run.start_date;
  runDateEl.textContent = timestamp ? new Date(timestamp).toLocaleString() : "-";
  runDistanceEl.textContent = `${Number(run.distance_mi || 0).toFixed(2)} mi`;
  runTimeEl.textContent = formatDuration(run.moving_time_sec);
  runPaceEl.textContent = formatPace(run.pace_min_per_mi);

  resultPanelEl.hidden = false;
}

async function fetchConfig() {
  const response = await fetch(apiUrl("/api/strava/config"));
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || `Config request failed (${response.status})`);
  }

  return body;
}

async function fetchLatestRun(code) {
  const response = await fetch(apiUrl("/api/strava/latest-run"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  let body = {};
  try {
    body = await response.json();
  } catch (_err) {}

  if (!response.ok) {
    throw new Error(body.error || `Latest run request failed (${response.status})`);
  }

  return body;
}

async function init() {
  try {
    const config = await fetchConfig();

    if (!config.configured) {
      setStatus("Server is missing Strava credentials. Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET.", "error");
      return;
    }

    connectLinkEl.href = config.authorizeUrl;
    connectLinkEl.hidden = false;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const authError = params.get("error");

    if (authError) {
      setStatus(`Strava authorization failed: ${authError}. Click Connect with Strava to try again.`, "error");
      return;
    }

    if (!code) {
      setStatus("Click Connect with Strava to load your most recent run.");
      return;
    }

    setStatus("Connected to Strava. Loading your most recent run...");
    const payload = await fetchLatestRun(code);

    if (!payload.run) {
      setStatus(payload.message || "Connected, but no recent run was found.", "warning");
      return;
    }

    renderRun(payload.run);
    setStatus("Latest run loaded. Click Connect with Strava again to refresh.", "success");

    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, document.title, cleanUrl);
  } catch (err) {
    const likelyNetworkFailure = /failed to fetch|networkerror|load failed/i.test(String(err.message || ""));
    if (likelyNetworkFailure) {
      if (window.location.hostname.endsWith("github.io") && !apiBase) {
        setStatus(
          "This GitHub Pages site needs a backend URL. Set window.RUNNING_TRACKER_API_BASE in config.js.",
          "error"
        );
        return;
      }
      setStatus("Could not reach the backend API. Check RUNNING_TRACKER_API_BASE and backend deployment.", "error");
      return;
    }

    setStatus(err.message, "error");
  }
}

init();
