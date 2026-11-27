import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { store } from "@/lib/store";
import Editor from "@/components/Editor";

/* A play shared with the team: anyone with the link can watch, nobody can edit. */
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SharedPlay({ params }: PageProps<"/dela/[token]">) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) notFound();
  const play = await store().byShare(token);
  if (!play) notFound();
  return <Editor initial={play} readOnly />;
}
