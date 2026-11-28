# bandy-plays

A tactics board for a bandy coach: draw plays step by step on a rink, play them back, view them in 3D. Live at https://bandy-plays.vercel.app. **All UI text is Swedish**; code and comments are English.

Read `AGENTS.md` first: this is Next.js 16 (App Router, `proxy.ts` instead of middleware, async `params`). Docs ship in `node_modules/next/dist/docs/`.

## Commands
- `npm run dev` — local server (http://localhost:3000)
- `npm run check` — typecheck + lint; run before every commit
- `npm run build` — production build
- After adding a route: `npx next typegen` (route types for `RouteContext` / `PageProps`)

## Stack and data
- Next.js 16 + React 19, plain CSS in `src/app/globals.css` (tokens on `:root`, Barlow Condensed + Inter), three.js for 3D.
- Storage picks itself (`src/lib/store.ts`, `users.ts`, `remote.ts`): **Neon Postgres when `DATABASE_URL` is set, else local files in `.data/`** (git-ignored). Tables are created on first use (`init()` with `CREATE/ALTER ... IF NOT EXISTS`); there are no migration files.
- A play = `pieces` + `steps` (+ `variants`) stored as jsonb `data`; tags and share token are separate columns so the editor's autosave (PUT of `data`) never wipes them.
- Units are metres: x 0–105 along the rink (we attack towards +x), y 0–65 across; directions in degrees, 0 = +x.

## Auth
- Accounts: name (stored lowercase, shown in capitals) + scrypt password. Session cookie `<name>.<exp>.<version>.<hmac>` signed with `AUTH_SECRET` (`src/lib/session.ts`); `currentUser()` refuses it when `users.session_version` has moved on (password change, role change, "Logga ut överallt"); old 3-part cookies count as version 0. Failed logins, team codes and password checks are rate-limited in `src/lib/ratelimit.ts`; new passwords go through `passwordProblem` (`src/lib/password.ts`).
- Roles: **admin** (edit plays, accounts, team code) and **player** (watch, quiz, 3D). Enforce in the API/server actions with `isAdmin()` / `currentUser()` from `src/lib/auth.ts`, not only in the UI.
- First start: `APP_PASSWORD` seeds the account `daniel` (admin) and the team code for sign-up.
- Public without login: `/login`, `/registrera`, `/dela/<token>` (read-only shared play). See the matcher in `src/proxy.ts`.

## Map
- `src/components/Editor.tsx` — the board: play/edit modes, branches, quiz, passing lanes, space map, tasks, share, presentation + phone remote. Big file; the pure logic lives in `src/lib/`.
- `src/lib/play.ts` (motion: `plan`/`frameAt`), `geom.ts`, `lines.ts` (variants), `lanes.ts`, `space.ts`, `auto.ts`, `tasks.ts`, `video.ts` (canvas + MediaRecorder export).
- `src/components/View3D.tsx` + `three/` — first-person 3D, environments (hall/outdoor/arena), skaters.

## Rules
- Never commit plays copied from the owner's encrypted page (albinekstrom.github.io/bandy): the repo is public. Import them into the database instead.
- Never point local dev at the production database to experiment; use the file store or a Neon branch.
- Test motion/geometry with small `npx tsx` scripts against `src/lib/*`; check UI in a browser at desktop and 390 px phone width.
- Pushing to `main` deploys to Vercel (functions pinned to `fra1`, next to the Neon database).
- Changes that touch stored data (play format, tables, columns) must be safe for the live database:
  - additive only (new optional fields, `ADD COLUMN IF NOT EXISTS`), never rename or drop;
  - old open tabs keep saving after a deploy, so the server must accept the old format and new code must read old plays;
  - test against a Neon branch first, and make a backup branch of production in Neon right before deploying.
  - the play format is versioned in `src/lib/schema.ts` (like a pydantic model): bump `SCHEMA_VERSION` and add one migration from the previous version; never edit or remove old migrations. Plays are upgraded when read and only rewritten when someone saves.
  - unknown fields are kept everywhere (editor state, PUT, and `data || new` in SQL), so an older app version never drops what a newer one wrote.
  - opening or watching a play must never write to it: the editor only saves real changes.
- Saves carry `rev` (the play's `revision` the editor built on; the column is bumped on every save); the API answers 409 instead of overwriting a newer save. Tabs from before revisions send no `rev` and simply save. Keep that.
- The editor saves one request at a time and compares what it shows with what the server confirmed after each response; every way out (app links, "Ladda om", closing the tab) saves first.
- Saves are validated at every level by `parsePlayData` (`src/lib/schema.ts`), which accepts older optional fields and keeps unknown ones.
- Plays are built in order from step 1 and nobody teleports: a player stands where his runs took him. Only a player who hasn't skated yet can be dragged, and then from step 1 up to his first run (`placeFromStart`). New steps come only from "+ Steg" (`stepAfter`), and only the last step can be removed.
- Local dev without login: `DEV_NO_LOGIN=1` in `.env.local` (`src/lib/session.ts`). Only works in `npm run dev` with the file store; never add it on Vercel.
