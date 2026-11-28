import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, tokenUser } from "@/lib/session";

export async function proxy(req: NextRequest) {
  if (await tokenUser(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!login|registrera|integritet|villkor|dela/|api/version|_next/|favicon.ico|icon|apple-icon|manifest).*)"],
};
