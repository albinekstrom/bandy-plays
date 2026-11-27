import { NextResponse } from "next/server";
import { loggedIn, isAdmin } from "@/lib/auth";
import { store } from "@/lib/store";
import { isPlayData } from "@/lib/play";
import { dataOf, upgrade } from "@/lib/schema";

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
  // base: the version the editor built on; older clients don't send it and simply save
  const id = (await ctx.params).id;
  const given = (body as { base?: unknown }).base;
  const base = typeof given === "string" && !Number.isNaN(Date.parse(given)) ? given : undefined;
  // everything but the name and request fields is play data, fields this version doesn't know included
  const data = upgrade({ ...dataOf(body as unknown as Record<string, unknown>), variants: body.variants ?? [] });
  const play = await store().update(id, name, data, base);
  if (play === "conflict") return NextResponse.json({ error: "conflict" }, { status: 409 });
  return play ? NextResponse.json({ updatedAt: play.updatedAt }) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/plays/[id]">) {
  if (!(await isAdmin())) return forbidden();
  await store().remove((await ctx.params).id);
  return new NextResponse(null, { status: 204 });
}
