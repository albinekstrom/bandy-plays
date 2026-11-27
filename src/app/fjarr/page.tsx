import type { Metadata } from "next";
import CodeEntry from "@/components/CodeEntry";

export const metadata: Metadata = { title: "Fjärrkontroll · Bandyspel" };

export default function RemoteStart() {
  return (
    <main className="gate">
      <div className="title"><span className="kicker">Fjärrkontroll</span><h1>Styr skärmen</h1></div>
      <CodeEntry />
    </main>
  );
}
