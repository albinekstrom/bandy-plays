import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RemoteControl from "@/components/RemoteControl";

export const metadata: Metadata = { title: "Fjärrkontroll · Bandyspel" };

export default async function RemotePage({ params }: PageProps<"/fjarr/[code]">) {
  const { code } = await params;
  if (!/^\d{4}$/.test(code)) notFound();
  return <RemoteControl code={code} />;
}
