import { NextResponse } from "next/server";

/* CSRF guard for state-changing API routes. Browsers always send Origin on
   POST/PUT/DELETE; if it names another host than the one being asked, refuse.
   A missing Origin (curl, old tools) is let through: there is no browser
   session to ride on then, and the session cookie is still required.
   Server actions get the same check from Next.js itself (Origin vs Host). */
export function foreignOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let ok = false;
  try { ok = !!host && new URL(origin).host === host; } catch { /* "null" or malformed */ }
  return ok ? null : NextResponse.json({ error: "forbidden" }, { status: 403 });
}
