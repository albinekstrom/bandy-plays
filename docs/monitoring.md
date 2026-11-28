# Monitoring and alerts

What the app logs, and what the owner switches on. Vercel's alert features depend on the plan, so check the current docs (https://vercel.com/docs/alerts) before relying on any of them.

## What the code logs (already in place)

Server-side, in `src/app/api/plays/[id]/route.ts`, one `console.error` line per event. Each carries a stable code, the play id and a request id (the `x-vercel-id` header, or a random UUID). Play content, names, passwords and raw database error messages are never logged; for unexpected errors only the error class name is logged.

| Code | Meaning |
|---|---|
| `PLAY_SAVE_FAILED` | the database or store threw while saving; the API answers 500 |
| `PLAY_SAVE_REJECTED` | the save body did not pass validation (400) |
| `PLAY_SAVE_CONFLICT` | someone saved a newer revision first (409; not an error as such, but a spike means trouble) |

Find them in Vercel: Project > Logs, search for the code (for example `PLAY_SAVE_FAILED`). The request id lets you match a line to a specific request.

The editor shows a banner ("Kunde inte spara ... Försök igen") when a save fails, and a separate banner on a conflict.

## What needs which plan

As documented by Vercel at the time of writing (verify, it changes):

- **Anomaly alerts** (unusual error or usage rates, sent by email/Slack/webhook) are documented for **Pro and Enterprise** plans and use **Observability Plus**. They are anomaly based: there is no fixed threshold you configure, so do not expect "N errors in M minutes" behaviour.
- On a **Hobby** plan, assume no Vercel-side alerting beyond failed-deployment notifications and use the fallback below.

## Option A: Vercel alerts (Pro/Enterprise)

1. Upgrade the project's team to a plan that includes alerts and enable **Observability Plus** (Vercel dashboard > project > Observability).
2. Turn on the alert/anomaly notifications and pick the email or Slack destination, following the current steps on the alerts docs page.
3. Settings > Notifications: also enable failed-deployment notifications.

## Option B: plan-independent fallback

1. **External uptime monitor.** `/api/version` is public and returns `{ "id": "<build id>" }` with 200. Create a free monitor (UptimeRobot, Better Stack or similar): `https://bandy-plays.vercel.app/api/version`, every 5 minutes, alert by email/SMS on non-200. It does not touch the database, so also add a monitor on a public page that does, or ask for a `/api/health` route that does a `SELECT 1`.
2. **Logs.** Either check Project > Logs for the codes above (for example weekly and after each deploy), or set up a **Log Drain** (a paid Vercel feature) to an external service that can alert on a text match such as `PLAY_SAVE_FAILED`.

## Testing that you would find out

Do this on a preview deploy, never production:

1. Temporarily make a route throw (for example `throw new Error("alert test")` at the top of `GET` in `src/app/api/version/route.ts`). Do not merge it.
2. Request it. Confirm the 500 appears in Logs, and that the uptime monitor (Option B) reports it if you point a monitor at the preview URL.
3. With Option A, do not expect a few errors to trigger an anomaly alert; anomaly detection needs a meaningful deviation from normal traffic. Treat the alert path as verified only if an alert actually arrives.
4. Remove the throw.
