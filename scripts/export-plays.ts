/* Dump all plays to a JSON file (recovery fields only; share links are deliberately not exported).
   Usage: DATABASE_URL='postgres://...' npx tsx scripts/export-plays.ts [out.json]
   Read-only: only SELECTs. The output contains the club's plays; keep it private and never commit it. */
import { writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const out = process.argv[2] ?? `plays-export-${new Date().toISOString().slice(0, 10)}.json`;
  const sql = neon(url);
  const rows = await sql`SELECT id, name, data, tags, revision, updated_at FROM plays ORDER BY updated_at`;
  writeFileSync(out, JSON.stringify({ exportedAt: new Date().toISOString(), count: rows.length, plays: rows }, null, 2));
  console.log(`Wrote ${rows.length} plays to ${out}`);
}

main().catch(err => {
  console.error("Export failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
