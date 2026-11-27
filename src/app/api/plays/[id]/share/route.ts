import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { isAdmin } from "@/lib/auth";
import { store } from "@/lib/store";

/* Turn a play's read-only share link on (POST) or off (DELETE). */
export async function POST(_req: Request, ctx: RouteContext<"/api/plays/[id]/share">) {
  if (!(await isAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const play = await store().get(id);
  if (!play) return NextResponse.json({ error: "not found" }, { status: 404 });
  const token = play.shareToken || randomBytes(18).toString("base64url");
  if (!play.shareToken) await store().share(id, token);
  return NextResponse.json({ token });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/plays/[id]/share">) {
  if (!(await isAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await store().share((await ctx.params).id, null);
  return new NextResponse(null, { status: 204 });
}
