import { NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/auth";
import { store } from "@/lib/store";
import { newPlayData } from "@/lib/play";
import { dataOf } from "@/lib/schema";

export async function GET() {
  if (!(await currentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await store().list());
}

/* A new empty play, or with { copyOf: id } a copy of an existing one
   (all its data and tags, but not its share link). */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const copyOf = typeof body?.copyOf === "string" ? body.copyOf : null;
  if (!copyOf) return NextResponse.json(await store().create("Nytt spel", newPlayData()), { status: 201 });
  const src = await store().get(copyOf);
  if (!src) return NextResponse.json({ error: "not found" }, { status: 404 });
  const play = await store().create(`${src.name} (kopia)`.slice(0, 80), dataOf({ ...src }), src.tags ?? []);
  return NextResponse.json({ id: play.id }, { status: 201 });
}
