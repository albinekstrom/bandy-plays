import { NextResponse } from "next/server";
import { loggedIn } from "@/lib/auth";
import { remotes, CMDS } from "@/lib/remote";

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });
const notFound = () => NextResponse.json({ error: "not found" }, { status: 404 });
const valid = (code: string) => /^\d{4}$/.test(code);

/* Screen and phone both poll this: latest command (seq) and the screen's state. */
export async function GET(_req: Request, ctx: RouteContext<"/api/fjarr/[code]">) {
  if (!(await loggedIn())) return unauthorized();
  const { code } = await ctx.params;
  const r = valid(code) ? await remotes().get(code) : null;
  return r ? NextResponse.json(r, { headers: { "cache-control": "no-store" } }) : notFound();
}

/* The phone sends a command. */
export async function POST(req: Request, ctx: RouteContext<"/api/fjarr/[code]">) {
  if (!(await loggedIn())) return unauthorized();
  const { code } = await ctx.params;
  const cmd = (await req.json().catch(() => null))?.cmd;
  if (!valid(code) || typeof cmd !== "string" || !CMDS.test(cmd)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const seq = await remotes().command(code, cmd);
  return seq === null ? notFound() : NextResponse.json({ seq });
}

/* The screen reports what it shows. */
export async function PUT(req: Request, ctx: RouteContext<"/api/fjarr/[code]">) {
  if (!(await loggedIn())) return unauthorized();
  const { code } = await ctx.params;
  const text = await req.text();
  if (!valid(code) || text.length > 4000) return NextResponse.json({ error: "bad request" }, { status: 400 });
  let state: unknown;
  try { state = JSON.parse(text)?.state; } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  return (await remotes().setState(code, state)) ? new NextResponse(null, { status: 204 }) : notFound();
}
