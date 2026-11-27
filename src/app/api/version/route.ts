import { NextResponse } from "next/server";

/* Which build is live. Public: it says nothing but an id. */
export function GET() {
  return NextResponse.json({ id: process.env.BUILD_ID }, { headers: { "Cache-Control": "no-store" } });
}
