# Monitoring and alerts

What the app logs, and what the owner switches on in Vercel and an uptime service.

## What the code logs (already in place)

Server-side, in `src/app/api/plays/[id]/route.ts`, one line per event via `console.error`, with a short tag. Play content, names and passwords are never logged, only the play id.

| Tag | Meaning |
|---|---|
| `[plays:save] failed` | the database threw while saving; the API answers 500 |
| `[plays:save] rejected` | the save body did not pass validation (400) |
| `[plays:conflict] 409` | someone saved a newer revision first (not an error as such, but a spike means trouble) |

Search for these in Vercel: Project > Logs, filter on the text `[plays:`.

The editor shows a banner ("Kunde inte spara ... Försök igen") when a save fails, and the conflict banner on 409.

## Owner: enable Vercel alerts (dashboard)

1. Vercel dashboard > the project > **Observability** > enable it (Observability Plus gives longer retention; the free tier is enough to start).
2. **Settings > Notifications** (or Team Settings > Notifications): turn on email/Slack for failed deployments and for **Error anomalies** / **Usage anomalies** (5xx spikes).
3. Observability > **Alerts** > Create alert:
   - Error rate: 5xx responses above, say, 5 in 5 minutes.
   - Function duration: p95 above 5 s over 10 minutes (slow functions).
   - Send to email and/or Slack.
4. Optional: **Log Drains** (Settings > Log Drains) to forward logs to an external store if you want history beyond Vercel's retention.

## Owner: external uptime check

`/api/version` is public and returns `{ "id": "<build id>" }` with status 200.

1. Create a free account at an uptime service (UptimeRobot, Better Stack, or similar).
2. New HTTP monitor: `https://bandy-plays.vercel.app/api/version`, every 5 minutes, expect status 200 (optionally keyword `id`).
3. Alerts to email/SMS.

Note that `/api/version` does not touch the database. To also catch a dead database, add a second monitor on a page that reads it, or ask for a `/api/health` route.

## Done when: forced 500 triggers an alert

1. On a preview deploy, temporarily make a route throw (for example, add `throw new Error("alert test")` at the top of `GET` in `src/app/api/version/route.ts`; do not merge it).
2. Hit the preview URL a handful of times.
3. Confirm the alert arrives and the log line shows up. Remove the throw.
