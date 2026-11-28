"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* The ⋯ menu on a play in the list (button and menu sit straight in the row, so the button
   is sized like the Taggar button next to it): duplicate it, or delete it (two taps, no confirm() dialog). */
export default function PlayMenu({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !toggle.current?.contains(t)) close();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); toggle.current?.focus(); } };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  function close() { setOpen(false); setArmed(false); setErr(""); }

  async function duplicate() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/plays", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ copyOf: id }) });
      if (!res.ok) throw new Error();
      router.push(`/spel/${(await res.json()).id}`);
    } catch { setBusy(false); setErr("Kunde inte duplicera."); }
  }

  async function remove() {
    if (!armed) { setArmed(true); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/plays/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      close();
      router.refresh();
    } catch { setErr("Kunde inte ta bort."); }
    setBusy(false);
  }

  return (
    <>
      <button ref={toggle} className={"btn ghost sm pmenu-btn" + (open ? " on" : "")} type="button" aria-haspopup="menu" aria-expanded={open}
        aria-label={`Fler val för ${name}`} onClick={() => (open ? close() : setOpen(true))}>
        <svg width="20" height="4" viewBox="0 0 20 4" aria-hidden="true"><circle cx="2" cy="2" r="2" /><circle cx="10" cy="2" r="2" /><circle cx="18" cy="2" r="2" /></svg>
      </button>
      {open && (
        <div className="pmenu-list" role="menu" ref={menu}>
          <button type="button" role="menuitem" disabled={busy} onClick={duplicate}>
            <b>Duplicera</b>
          </button>
          <button type="button" role="menuitem" disabled={busy} className={"danger" + (armed ? " armed" : "")} onClick={remove}>
            <b>{armed ? "Säker? Tryck igen" : "Ta bort"}</b>
          </button>
          {err && <p className="msg" role="alert">{err}</p>}
        </div>
      )}
    </>
  );
}
