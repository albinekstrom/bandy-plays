import { NextResponse } from "next/server";
import { loggedIn } from "@/lib/auth";
import { store } from "@/lib/store";
import { newPlayData } from "@/lib/play";

export async function GET() {
  if (!(await loggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await store().list());
}

export async function POST() {
  if (!(await loggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const play = await store().create("Nytt spel", newPlayData());
  return NextResponse.json(play, { status: 201 });
}
