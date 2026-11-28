/* Dump all plays to a JSON file.
   Usage: DATABASE_URL='postgres://...' npx tsx scripts/export-plays.ts [out.json]
   Read-only: only SELECTs. The output contains the club's plays; keep it private and never commit it. */
import { writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }

const out = process.argv[2] ?? `plays-export-${new Date().toISOString().slice(0, 10)}.json`;
const sql = neon(url);
const rows = await sql`SELECT * FROM plays`;
writeFileSync(out, JSON.stringify({ exportedAt: new Date().toISOString(), count: rows.length, plays: rows }, null, 2));
console.log(`Wrote ${rows.length} plays to ${out}`);
