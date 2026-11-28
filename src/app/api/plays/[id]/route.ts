import { NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/auth";
import { store } from "@/lib/store";
import { dataOf, parsePlayData, upgrade } from "@/lib/schema";

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });
const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });

export async function GET(_req: Request, ctx: RouteContext<"/api/plays/[id]">) {
  if (!(await currentUser())) return unauthorized();
  const play = await store().get((await ctx.params).id);
  return play ? NextResponse.json(play) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function PUT(req: Request, ctx: RouteContext<"/api/plays/[id]">) {
  if (!(await isAdmin())) return forbidden();
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) || "Namnlöst" : null;
  // everything but the name and request fields is play data, fields this version doesn't know included
  const parsed = body && parsePlayData(dataOf(body));
  if (!name || !parsed) return NextResponse.json({ error: "bad request" }, { status: 400 });
  // rev: the revision the editor built on. Tabs from before revisions don't send it and simply save.
  const rev = Number.isInteger(body.rev) ? (body.rev as number) : undefined;
  const play = await store().update((await ctx.params).id, name, upgrade({ ...parsed, variants: parsed.variants ?? [] }), rev);
  if (play === "conflict") return NextResponse.json({ error: "conflict" }, { status: 409 });
  return play ? NextResponse.json({ updatedAt: play.updatedAt, revision: play.revision ?? 0 }) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/plays/[id]">) {
  if (!(await isAdmin())) return forbidden();
  await store().remove((await ctx.params).id);
  return new NextResponse(null, { status: 204 });
}
