import { notFound, redirect } from "next/navigation";
import { store } from "@/lib/store";
import { currentUser } from "@/lib/auth";
import Editor from "@/components/Editor";

export default async function PlayPage({ params }: PageProps<"/spel/[id]">) {
  const me = await currentUser();
  if (!me) redirect("/login");
  const admin = me.role === "admin";
  const play = await store().get((await params).id);
  if (!play) notFound();
  return <Editor initial={admin ? play : { ...play, shareToken: null }} readOnly={!admin} />;
}
