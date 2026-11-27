"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import DeleteButton from "./DeleteButton";
import { SUGGESTED_TAGS, MAX_TAGS, MAX_TAG_LEN, cleanTags } from "@/lib/tags";

interface Item { id: string; name: string; date: string; tags?: string[] }
const lc = (s: string) => s.toLocaleLowerCase("sv");

export default function PlayList({ plays }: { plays: Item[] }) {
  const [over, setOver] = useState<Record<string, string[]>>({});
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]); // lower-cased
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");

  const tagsOf = (p: Item) => over[p.id] ?? p.tags ?? [];

  const inUse = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of plays) for (const t of over[p.id] ?? p.tags ?? []) if (!m.has(lc(t))) m.set(lc(t), t);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "sv"));
  }, [plays, over]);

  const needle = lc(q.trim());
  const shown = plays.filter(p => {
    if (needle && !lc(p.name).includes(needle)) return false;
    const mine = tagsOf(p).map(lc);
    return sel.every(s => mine.includes(s));
  });
  const activeSel = sel.filter(s => inUse.some(([k]) => k === s));

  async function save(id: string, next: string[]) {
    const prev = over[id];
    const clean = cleanTags(next);
    setOver(o => ({ ...o, [id]: clean }));
    setErr("");
    try {
      const r = await fetch(`/api/plays/${id}/tags`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ tags: clean }) });
      if (!r.ok) throw new Error();
    } catch {
      setOver(o => { const n = { ...o }; if (prev) n[id] = prev; else delete n[id]; return n; });
      setErr("Kunde inte spara taggar.");
    }
  }

  function toggle(p: Item, t: string) {
    const cur = tagsOf(p);
    const has = cur.some(x => lc(x) === lc(t));
    if (!has && cur.length >= MAX_TAGS) { setErr(`Högst ${MAX_TAGS} taggar.`); return; }
    save(p.id, has ? cur.filter(x => lc(x) !== lc(t)) : [...cur, t]);
  }
  function add(p: Item) {
    const t = draft.trim();
    if (!t) return;
    const cur = tagsOf(p);
    if (cur.length < MAX_TAGS || cur.some(x => lc(x) === lc(t))) save(p.id, [...cur, t]);
    else setErr(`Högst ${MAX_TAGS} taggar.`);
    setDraft("");
  }

  return (
    <>
      <div className="find">
        <input className="search" type="search" placeholder="Sök spel" aria-label="Sök spel" value={q} onChange={e => setQ(e.target.value)} />
        {inUse.length > 0 && (
          <div className="chips" role="group" aria-label="Filtrera på tagg">
            <button className="tg" type="button" aria-pressed={activeSel.length === 0} onClick={() => setSel([])}>Alla</button>
            {inUse.map(([k, label]) => (
              <button key={k} className="tg" type="button" aria-pressed={sel.includes(k)}
                onClick={() => setSel(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k])}>{label}</button>
            ))}
          </div>
        )}
      </div>
      {err && <p className="msg" role="alert">{err}</p>}
      {shown.length === 0 ? (
        <p className="nomatch">Inga spel matchar.</p>
      ) : (
        <ul className="plays">
          {shown.map(p => {
            const tags = tagsOf(p);
            const isOpen = open === p.id;
            return (
              <li key={p.id}>
                <Link href={`/spel/${p.id}`} className="play-main">
                  <span className="play-top">
                    <span className="play-name">{p.name}</span>
                    <span className="play-date">{p.date}</span>
                  </span>
                  {tags.length > 0 && <span className="tagrow">{tags.map(t => <span key={t} className="tagpill">{t}</span>)}</span>}
                </Link>
                <button className={"btn ghost sm" + (isOpen ? " on" : "")} type="button" aria-expanded={isOpen}
                  onClick={() => { setOpen(isOpen ? null : p.id); setDraft(""); setErr(""); }}>Taggar</button>
                <DeleteButton id={p.id} />
                {isOpen && (
                  <div className="tagedit">
                    <div className="chips">
                      {SUGGESTED_TAGS.map(t => (
                        <button key={t} className="tg sm" type="button" aria-pressed={tags.some(x => lc(x) === lc(t))} onClick={() => toggle(p, t)}>{t}</button>
                      ))}
                      {tags.filter(t => !SUGGESTED_TAGS.some(s => lc(s) === lc(t))).map(t => (
                        <button key={t} className="tg sm" type="button" aria-label={`Ta bort ${t}`} onClick={() => toggle(p, t)}>{t} ×</button>
                      ))}
                    </div>
                    <form className="tagadd" onSubmit={e => { e.preventDefault(); add(p); }}>
                      <input value={draft} maxLength={MAX_TAG_LEN} placeholder="Egen tagg" aria-label="Egen tagg" onChange={e => setDraft(e.target.value)} />
                      <button className="btn ghost sm" type="submit">Lägg till</button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
