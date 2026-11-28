import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, tokenOk } from "@/lib/session";

/* A quick first gate: only the cookie's signature and expiry, no database. Whether the
   session is still valid (version, account exists) is checked by currentUser() in every
   page, route handler and server action that touches data. */
export async function proxy(req: NextRequest) {
  if (await tokenOk(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!login|registrera|dela/|api/version|_next/|favicon.ico|icon|apple-icon|manifest).*)"],
};
