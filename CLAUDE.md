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
- Accounts: name (stored lowercase, shown in capitals) + scrypt password. Session cookie `<name>.<exp>.<hmac>` signed with `AUTH_SECRET` (`src/lib/session.ts`).
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
