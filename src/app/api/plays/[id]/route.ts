import { NextResponse } from "next/server";
import { loggedIn, isAdmin } from "@/lib/auth";
import { store } from "@/lib/store";
import { dataOf, parsePlayData, upgrade } from "@/lib/schema";

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });
const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });

export async function GET(_req: Request, ctx: RouteContext<"/api/plays/[id]">) {
  if (!(await loggedIn())) return unauthorized();
  const play = await store().get((await ctx.params).id);
  return play ? NextResponse.json(play) : NextResponse.json({ error: "not found" }, { status: 404 });
}

/** Request id for correlating log lines: Vercel's if present, else a random one. */
const requestId = (req: Request) => req.headers.get("x-vercel-id") ?? crypto.randomUUID();

export async function PUT(req: Request, ctx: RouteContext<"/api/plays/[id]">) {
  if (!(await isAdmin())) return forbidden();
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) || "Namnlöst" : null;
  // everything but the name and request fields is play data, fields this version doesn't know included
  const parsed = body && parsePlayData(dataOf(body));
  const { id } = await ctx.params;
  if (!name || !parsed) {
    console.error("[plays:save] PLAY_SAVE_REJECTED", { id, requestId: requestId(req) }); // never log the body: it is play content
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  // rev: the revision the editor built on. Tabs from before revisions don't send it and simply save.
  const rev = Number.isInteger(body.rev) ? (body.rev as number) : undefined;
  let play;
  try {
    play = await store().update(id, name, upgrade({ ...parsed, variants: parsed.variants ?? [] }), rev);
  } catch (err) {
    // stable code and error class only: raw driver messages can contain data
    console.error("[plays:save] PLAY_SAVE_FAILED", { id, requestId: requestId(req), errorClass: err instanceof Error ? err.constructor.name : "unknown" });
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
  if (play === "conflict") {
    console.error("[plays:conflict] PLAY_SAVE_CONFLICT", { id, requestId: requestId(req), rev });
    return NextResponse.json({ error: "conflict" }, { status: 409 });
  }
  return play ? NextResponse.json({ updatedAt: play.updatedAt, revision: play.revision ?? 0 }) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/plays/[id]">) {
  if (!(await isAdmin())) return forbidden();
  await store().remove((await ctx.params).id);
  return new NextResponse(null, { status: 204 });
}
