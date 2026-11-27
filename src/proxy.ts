import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, validToken } from "@/lib/session";

export async function proxy(req: NextRequest) {
  if (await validToken(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!login|_next/|favicon.ico|icon|apple-icon|manifest).*)"],
};
