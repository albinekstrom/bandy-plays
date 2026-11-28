"use client";
/* The coach's phone as a remote for a presentation screen. */
import Link from "next/link";
import { pollWhileVisible } from "@/lib/poll";
import { useEffect, useState } from "react";

export interface ScreenState {
  name: string;
  k: number;
  n: number;
  text: string;
  playing: boolean;
  line: string;
  choice: { id: string; label: string; badge: string | null }[] | null;
}

export default function RemoteControl({ code }: { code: string }) {
  const [state, setState] = useState<ScreenState | null>(null);
  const [lost, setLost] = useState(false);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState(false);

  useEffect(() => pollWhileVisible(async signal => {
    const res = await fetch(`/api/fjarr/${code}`, { cache: "no-store", signal });
    if (res.status === 404 || res.status === 401) { setLost(true); return; }
    if (!res.ok) return;
    const r = await res.json();
    if (signal.aborted) return;
    setLost(false);
    if (r.state) setState(r.state as ScreenState);
  }, 800), [code]);

  async function send(cmd: string) {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/fjarr/${code}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cmd }),
      });
      if (!res.ok) throw new Error();
      navigator.vibrate?.(15);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (lost) return (
    <main className="gate">
      <div className="title"><h1>Kopplingen bröts</h1></div>
      <p>Koden {code} finns inte längre. Öppna presentationen igen och använd den nya koden.</p>
      <Link className="btn" href="/fjarr">Ange ny kod</Link>
    </main>
  );

  return (
    <main className="remote">
      <header className="title">
        <span className="kicker">Fjärrkontroll · kod {code}</span>
        <h1>{state?.name ?? "Ansluter…"}</h1>
      </header>
      {error && <p className="msg" role="alert">Kunde inte skicka kommandot. Försök igen.</p>}
      {state && <>
        <p className="remote-step"><b>Steg {state.k + 1}/{state.n}</b>{state.line ? ` · ${state.line}` : ""}<br />{state.text}</p>
        {state.choice ? (
          <div className="remote-choice">
            <p>Vem får bollen?</p>
            {state.choice.map(o => (
              <button key={o.id} type="button" className="btn" disabled={busy} onClick={() => send("pick:" + o.id)}>
                {o.badge ? `${o.badge} · ` : ""}{o.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="remote-pad">
            <button type="button" className="btn ghost" disabled={busy} onClick={() => send("prev")} aria-label="Föregående steg">←</button>
            <button type="button" className="btn big" disabled={busy} onClick={() => send(state.playing ? "stop" : "next")}>{state.playing ? "Paus" : "Spela steg"}</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => send("first")}>Till början</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => send("all")}>Spela allt</button>
          </div>
        )}
      </>}
    </main>
  );
}
