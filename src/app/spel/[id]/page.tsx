import { notFound } from "next/navigation";
import { store } from "@/lib/store";
import Editor from "@/components/Editor";

export default async function PlayPage({ params }: PageProps<"/spel/[id]">) {
  const play = await store().get((await params).id);
  if (!play) notFound();
  return <Editor initial={play} />;
}
