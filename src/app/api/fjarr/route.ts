import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { store } from "@/lib/store";
import { remotes } from "@/lib/remote";

/* The presentation screen opens a remote-control session for a play. */
export async function POST(req: Request) {
  if (!(await currentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const playId = typeof body?.playId === "string" ? body.playId : "";
  if (!playId || !(await store().get(playId))) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ code: await remotes().create(playId) }, { status: 201 });
}
