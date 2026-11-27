import { NextResponse } from "next/server";
import { loggedIn, isAdmin } from "@/lib/auth";
import { store } from "@/lib/store";
import { isPlayData } from "@/lib/play";

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });
const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });

export async function GET(_req: Request, ctx: RouteContext<"/api/plays/[id]">) {
  if (!(await loggedIn())) return unauthorized();
  const play = await store().get((await ctx.params).id);
  return play ? NextResponse.json(play) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function PUT(req: Request, ctx: RouteContext<"/api/plays/[id]">) {
  if (!(await isAdmin())) return forbidden();
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) || "Namnlöst" : null;
  if (!name || !isPlayData(body)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const play = await store().update((await ctx.params).id, name, { pieces: body.pieces, steps: body.steps, variants: body.variants ?? [] });
  return play ? NextResponse.json({ updatedAt: play.updatedAt }) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/plays/[id]">) {
  if (!(await isAdmin())) return forbidden();
  await store().remove((await ctx.params).id);
  return new NextResponse(null, { status: 204 });
}
