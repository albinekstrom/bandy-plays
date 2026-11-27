import { NextResponse } from "next/server";
import { loggedIn } from "@/lib/auth";
import { store } from "@/lib/store";
import { cleanTags, MAX_TAGS, MAX_TAG_LEN } from "@/lib/tags";

export async function PUT(req: Request, ctx: RouteContext<"/api/plays/[id]/tags">) {
  if (!(await loggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const raw = body?.tags;
  if (!Array.isArray(raw) || raw.length > MAX_TAGS || !raw.every(t => typeof t === "string" && t.trim().length <= MAX_TAG_LEN)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const tags = cleanTags(raw);
  const ok = await store().setTags((await ctx.params).id, tags);
  return ok ? NextResponse.json({ tags }) : NextResponse.json({ error: "not found" }, { status: 404 });
}
