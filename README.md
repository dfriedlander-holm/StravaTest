# Running Tracker (Simple Strava Latest Run)

This project is a minimal local website that connects to Strava and shows your most recent run.

## What it does

- Starts a tiny Node server for static files + Strava API proxy routes.
- Uses Strava OAuth authorization code flow.
- Exchanges the OAuth `code` on the server (client secret never goes to the browser).
- Fetches and displays only one thing: your latest run.

## 1) Create/configure your Strava app

In Strava API settings for your app:

- Set **Authorization Callback Domain** to `localhost`.
- Use this redirect URI in your app + env vars: `http://localhost:8080/`

## 2) Set environment variables

```bash
export STRAVA_CLIENT_ID=your_client_id
export STRAVA_CLIENT_SECRET=your_client_secret
export STRAVA_REDIRECT_URI=http://localhost:8080/
```

## 3) Run locally

```bash
npm start
```

Open [http://localhost:8080](http://localhost:8080), click **Connect with Strava**, approve access, and you should see your latest run.

## API routes

- `GET /api/strava/config`: frontend-safe OAuth config and authorize URL.
- `POST /api/strava/latest-run`: exchanges OAuth code and returns latest run.

Request body for latest run:

```json
{
  "code": "strava_oauth_code"
}
```

## Troubleshooting

- `Server is missing Strava credentials`: set `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` in the same terminal where you run `npm start`.
- `Strava token exchange failed`: confirm `STRAVA_REDIRECT_URI` exactly matches your Strava app redirect URI.
- `Connected successfully, but no run activities were found`: your recent activities did not include a run, or app scopes need `activity:read_all`.
