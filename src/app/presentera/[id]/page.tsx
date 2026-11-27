import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { store } from "@/lib/store";
import Editor from "@/components/Editor";

export const metadata: Metadata = { title: "Presentation · Bandyspel" };

export default async function PresentPage({ params }: PageProps<"/presentera/[id]">) {
  const play = await store().get((await params).id);
  if (!play) notFound();
  return <Editor initial={play} readOnly present />;
}
