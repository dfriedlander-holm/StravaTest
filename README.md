# Running Tracker (Latest Strava Run)

This project shows one thing: your most recent Strava run.

## Why GitHub upload alone did not work

GitHub Pages serves static files only. It cannot run `server.js`, so the `/api/strava/*` routes do not exist there.

You have two working setups:

## Option 1: Local only (simplest)

1. In your Strava app settings:
- Authorization Callback Domain: `localhost`

2. Set env vars:

```bash
export STRAVA_CLIENT_ID=your_client_id
export STRAVA_CLIENT_SECRET=your_client_secret
export STRAVA_REDIRECT_URI=http://localhost:8080/
```

3. Start server:

```bash
npm start
```

4. Open [http://localhost:8080](http://localhost:8080)

## Option 2: GitHub Pages frontend + separate backend

1. Deploy this Node app (`server.js`) to a backend host (Render/Railway/Fly/etc.).

2. On backend env vars set:

```bash
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
STRAVA_REDIRECT_URI=https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO/
ALLOWED_ORIGINS=https://YOUR_GITHUB_USERNAME.github.io
```

`STRAVA_REDIRECT_URI` must exactly match the URL where the frontend page receives the Strava callback.

3. In Strava app settings:
- Authorization Callback Domain: `YOUR_GITHUB_USERNAME.github.io`

4. In `/config.js`, set your backend URL:

```js
window.RUNNING_TRACKER_API_BASE = "https://your-backend-host.example.com";
```

5. Push to GitHub and enable GitHub Pages for your repo (Settings -> Pages).

## API routes

- `GET /api/strava/config`
- `POST /api/strava/latest-run`

`POST /api/strava/latest-run` body:

```json
{
  "code": "strava_oauth_code"
}
```

## Troubleshooting

- `Server is missing Strava credentials`: backend env vars are missing.
- `Strava token exchange failed`: `STRAVA_REDIRECT_URI` does not exactly match callback URL.
- `Could not reach the backend API`: `RUNNING_TRACKER_API_BASE` is wrong or backend is down.
- `Connected successfully, but no run activities were found`: no recent run in returned activities, or scopes are insufficient.
