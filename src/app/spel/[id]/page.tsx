import { notFound } from "next/navigation";
import { store } from "@/lib/store";
import { isAdmin } from "@/lib/auth";
import Editor from "@/components/Editor";

export default async function PlayPage({ params }: PageProps<"/spel/[id]">) {
  const [play, admin] = await Promise.all([store().get((await params).id), isAdmin()]);
  if (!play) notFound();
  return <Editor initial={admin ? play : { ...play, shareToken: null }} readOnly={!admin} />;
}
