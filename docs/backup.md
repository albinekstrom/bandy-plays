# Backups and restore

The database is Neon Postgres (region Frankfurt, next to the Vercel functions in `fra1`). Plays live in the `plays` table as jsonb `data`.

## Layers of protection

1. **Neon point-in-time restore (PITR)**: Neon keeps WAL history for a restore window that depends on the plan. Check it: Neon console > project > Settings > Storage (history retention). Raise it if the plan allows. Free plans have a short window; a paid plan is advisable once customers depend on it.
2. **Backup branch before every deploy that touches stored data** (rule in `CLAUDE.md`).
3. **JSON export** with `scripts/export-plays.ts` (see below) for a copy that lives outside Neon.

## Backup branch before a deploy

Neon console > Branches > **Create branch** from `main` (production), current data, name `backup-YYYY-MM-DD-<what>`. Branches are copy-on-write, so this is instant and cheap. Delete old ones after a few days of stable production.

CLI alternative: `neonctl branches create --name backup-2026-01-01-schema --parent main`.

## Restore the whole database

Pick the fastest that fits:

- **From a backup branch**: Neon console > Branches > the backup branch > **Restore** (or Branch > Reset `main` from the backup). The connection string on `main` stays the same, so no env change is needed.
- **Point in time**: Neon console > Branches > `main` > **Restore** > choose a timestamp (or LSN). Neon also keeps a "pre-restore" branch automatically, so the restore itself can be undone.
Order of work for a whole-database restore:

1. **Pause writes first.** Take the app offline or into maintenance (for example a temporary deploy that answers 503, or ask all coaches to close the editor) so nobody saves during the restore.
2. Restore (branch or point in time, see above).
3. **Bump every play's revision past its pre-restore value**, so editors left open from before the restore get a 409 instead of silently overwriting restored data. Before restoring, note `SELECT max(revision) FROM plays;` on production (call it `M`). After restoring, run:
   `UPDATE plays SET revision = revision + <M + 1>;`
   (a large offset is fine; revisions only ever need to move forward).
4. Bring the app back, open the site, check the play list, open a play, check `/api/version`.
5. Tell all coaches to **reload** the editor before they continue, and that saves made after the restore point are lost.

## Restore a single play

Do not restore over production for one play. Instead:

1. Create a branch from the point in time (Neon console > Branches > Create branch > "Past data", pick a timestamp) or use the backup branch.
2. In the branch's SQL editor run:
   `SELECT name, data, tags FROM plays WHERE id = '<play id>';`
3. In production, restore name, data and tags together in one statement:
   ```sql
   UPDATE plays
   SET name = '<name>', data = '<json>'::jsonb, tags = '<tags>'::text[],
       updated_at = now(),
       revision = revision + 1,   -- always advance, never rewind: open editors get 409 instead of overwriting
       share_token = NULL         -- restored plays come back unshared; share them again from the editor
   WHERE id = '<play id>';
   ```
   If the play was deleted, `INSERT` it with the same columns (id, name, data, tags, revision 0, updated_at) and no share token.
4. Tell any coach with that play open to reload.
5. Delete the temporary branch.

Column names are defined in `src/lib/store.ts` (`plays`: id, name, data, updated_at, share_token, tags, revision); there is no `created_at`.

## JSON export

`scripts/export-plays.ts` dumps all plays to a JSON file. It reads `DATABASE_URL` from the environment (it is never stored in the repo):

```
DATABASE_URL='postgres://...' npx tsx scripts/export-plays.ts backup-plays.json
```

The export contains only recovery fields (id, name, data, tags, revision, updated_at). Share tokens are deliberately left out, so plays restored from an export come back unshared.

Keep the output private: it contains the club's plays. Never commit it (the repo is public). A nightly export to private storage (for example a scheduled GitHub Action writing to a private bucket) is optional and not set up.

## Restore drill checklist (owner does this once, then yearly)

- [ ] Note the start time.
- [ ] Create a backup branch of production in Neon.
- [ ] Create a second branch from a point in time about 1 hour ago.
- [ ] On the branch, run `SELECT count(*) FROM plays;` and compare with production.
- [ ] Point a local dev (`DATABASE_URL` in a throwaway `.env.local`, not production) at the branch, run `npm run dev` and open a few plays; check they render and play back.
- [ ] Practise restoring a single play with the steps above, into the branch.
- [ ] Practise restoring `main` from a backup branch on a scratch Neon project (not production).
- [ ] Note the total time taken and any surprises here: `Drill YYYY-MM-DD: __ minutes, notes: __`.
- [ ] Delete the temporary branches.
- [ ] Confirm the PITR window on the current plan and write it here: `__ hours/days`.
