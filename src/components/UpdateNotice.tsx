"use client";
/* Shows a small notice when a newer version of the site has been deployed. */
import { useEffect, useState } from "react";
import { flushAll } from "@/lib/unsaved";

const MINE = process.env.BUILD_ID;
const EVERY = 5 * 60 * 1000;

export default function UpdateNotice() {
  const [stale, setStale] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // save any unsaved work before reloading; never reload over something unsaved
  const reload = async () => {
    setBusy(true);
    setFailed(false);
    if (await flushAll()) location.reload();
    else { setBusy(false); setFailed(true); }
  };

  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id?: string };
        if (alive && id && MINE && id !== MINE) setStale(true);
      } catch { /* offline: try again later */ }
    };
    const timer = setInterval(check, EVERY);
    document.addEventListener("visibilitychange", check);
    check();
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, []);

  if (!stale || hidden) return null;
  return (
    <div className="update" role="status">
      <span>{failed ? "Kunde inte spara dina ändringar. Försök igen om en stund." : "Ny version av sidan finns."}</span>
      <button type="button" className="update-go" onClick={reload} disabled={busy}>{busy ? "Sparar…" : "Ladda om"}</button>
      <button type="button" className="update-x" aria-label="Stäng" onClick={() => setHidden(true)}>×</button>
    </div>
  );
}
