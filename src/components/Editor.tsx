"use client";
/* The play editor: draw on the rink step by step, then play it back. */
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Arrow, ArrowKind, Play, PlayData, Pt, Step } from "@/lib/types";
import { L, W, MIDY, NAMES } from "@/lib/rink";
import { clamp, dist, fitStroke, heading, pathD, spline, wavy } from "@/lib/geom";
import {
  arrowCurve, ballPoint, copyStep, frameAt, movePiece, nearestPiece, plan, stillFrame, uid, type Frame,
} from "@/lib/play";
import Rink from "./Rink";

// three.js is only loaded when someone opens the 3D view
const View3D = dynamic(() => import("./View3D"), { ssr: false });

type Tool = "move" | "run" | "drib" | "pass" | "dir" | "erase";
type Mode = "play" | "edit";
const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "move", label: "Flytta", hint: "Dra spelare eller boll. Släpp bollen vid en spelare så får hen den." },
  { id: "run", label: "Åkning", hint: "Dra från en spelare dit hen ska åka." },
  { id: "drib", label: "Driver", hint: "Dra från bollhållaren dit hen driver bollen." },
  { id: "pass", label: "Pass", hint: "Dra från bollen till mottagaren." },
  { id: "dir", label: "Riktning", hint: "Dra från en spelare åt det håll hen ska titta." },
  { id: "erase", label: "Sudda", hint: "Tryck på en pil eller en motståndare för att ta bort den." },
];
const REACH = 3.2; // metres: generous for fingers

type Drag =
  | { kind: "piece"; id: string }
  | { kind: "ball" }
  | { kind: "dir"; id: string }
  | { kind: "stroke"; arrow: ArrowKind; piece: string | null; pts: Pt[] };

type Save = "saved" | "saving" | "dirty" | "error";

export default function Editor({ initial }: { initial: Play }) {
  const [name, setName] = useState(initial.name);
  const [data, setData] = useState<PlayData>({ pieces: initial.pieces, steps: initial.steps });
  const [past, setPast] = useState<PlayData[]>([]);
  const [k, setK] = useState(0);
  const [tool, setTool] = useState<Tool>("move");
  const [showThem, setShowThem] = useState(true);
  const [draft, setDraft] = useState<Drag | null>(null);
  const [anim, setAnim] = useState<{ from: number; u: number } | null>(null);
  const [save, setSave] = useState<Save>("saved");
  const [portrait, setPortrait] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  // finished plays open for watching; a fresh one opens for drawing
  const [mode, setMode] = useState<Mode>(initial.steps.length > 1 ? "play" : "edit");
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const [show3d, setShow3d] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const dataRef = useRef(data);
  useLayoutEffect(() => { dataRef.current = data; }, [data]);

  const steps = data.steps;
  const step = steps[Math.min(k, steps.length - 1)];
  const next = steps[k + 1] as Step | undefined;
  const pieceById = useMemo(() => Object.fromEntries(data.pieces.map(p => [p.id, p])), [data.pieces]);
  const visible = useMemo(() => data.pieces.filter(p => showThem || p.side === "us"), [data.pieces, showThem]);

  /* ---------- history ---------- */
  const snapshot = useCallback(() => setPast(p => [...p.slice(-49), dataRef.current]), []);
  const commit = useCallback((fn: (d: PlayData) => PlayData) => {
    setPast(p => [...p.slice(-49), dataRef.current]);
    setData(fn);
  }, []);
  const undo = useCallback(() => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setData(prev);
    setPast(past.slice(0, -1));
    setK(kk => Math.min(kk, prev.steps.length - 1));
  }, [past]);
  const setSteps = (fn: (s: Step[]) => Step[]) => setData(d => ({ ...d, steps: fn(d.steps) }));

  /* ---------- autosave ---------- */
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSave("dirty");
    const t = setTimeout(async () => {
      setSave("saving");
      try {
        const res = await fetch(`/api/plays/${initial.id}`, {
          method: "PUT", headers: { "content-type": "application/json" }, keepalive: true,
          body: JSON.stringify({ name, ...data }),
        });
        setSave(res.ok ? "saved" : "error");
      } catch { setSave("error"); }
    }, 700);
    return () => clearTimeout(t);
  }, [name, data, initial.id]);

  /* ---------- standing rink on narrow portrait screens ---------- */
  useEffect(() => {
    const mq = matchMedia("(max-width: 700px) and (orientation: portrait)");
    const on = () => setPortrait(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  /* ---------- playback ---------- */
  const playing = anim !== null;
  const playRef = useRef<{ raf: number; all: boolean } | null>(null);

  const stepDuration = useCallback((s: Step, n: Step) => plan(s, n).T * 1000, []);

  const stop = useCallback(() => {
    if (playRef.current) cancelAnimationFrame(playRef.current.raf);
    playRef.current = null;
    setAnim(null);
  }, []);

  const play = useCallback((from: number, all: boolean) => {
    const st = dataRef.current.steps;
    if (from >= st.length - 1) return;
    if (playRef.current) cancelAnimationFrame(playRef.current.raf);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cur = from;
    let t0 = performance.now();
    let dur = still ? 1 : stepDuration(st[cur], st[cur + 1]);
    const tick = (now: number) => {
      const u = (now - t0) / dur;
      if (u < 1) {
        setAnim({ from: cur, u });
        playRef.current = { raf: requestAnimationFrame(tick), all };
        return;
      }
      cur++;
      setK(cur);
      if (all && cur < st.length - 1) {
        setAnim(null);
        t0 = now + 450; // short breath on each step
        dur = still ? 1 : stepDuration(st[cur], st[cur + 1]);
        const wait = (n: number) => {
          if (n < t0) { playRef.current = { raf: requestAnimationFrame(wait), all }; return; }
          tick(n);
        };
        playRef.current = { raf: requestAnimationFrame(wait), all };
        return;
      }
      playRef.current = null;
      setAnim(null);
    };
    setK(from);
    playRef.current = { raf: requestAnimationFrame(tick), all };
  }, [stepDuration]);

  useEffect(() => () => { if (playRef.current) cancelAnimationFrame(playRef.current.raf); }, []);

  /* ---------- what to draw ---------- */
  const shownStep = anim ? steps[anim.from] : step;
  const shownNext = anim ? steps[anim.from + 1] : next;
  const animFrom = anim ? anim.from : -1;
  const animPlan = useMemo(() => (animFrom >= 0 ? plan(steps[animFrom], steps[animFrom + 1]) : null), [animFrom, steps]);
  const frame: Frame = anim && animPlan ? frameAt(animPlan, anim.u * animPlan.T) : stillFrame(step);

  /* ---------- pointer → rink coordinates ---------- */
  const toWorld = (e: React.PointerEvent): Pt => {
    const g = worldRef.current!;
    const m = g.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [p.x, p.y];
  };

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button > 0) return;
    if (mode === "play") {
      // tap: show his field of view; tap again quickly: stand in his skates (3D)
      const id = nearestPiece(visible, frame.pos, toWorld(e), REACH);
      const now = e.timeStamp;
      if (id && lastTap.current?.id === id && now - lastTap.current.at < 400) {
        lastTap.current = null;
        open3d();
        return;
      }
      lastTap.current = id ? { id, at: now } : null;
      setViewer(id);
      return;
    }
    if (playing) return;
    const p = toWorld(e);
    const pos = step.pos;
    const ball = ballPoint(step.ball, pos);
    let d: Drag | null = null;

    if (tool === "move") {
      if (dist(p, ball) < 1.8) d = { kind: "ball" };
      else {
        const id = nearestPiece(visible, pos, p, REACH);
        if (id) d = { kind: "piece", id };
      }
    } else if (tool === "run" || tool === "drib") {
      const id = nearestPiece(visible, pos, p, REACH);
      if (id) d = { kind: "stroke", arrow: tool, piece: id, pts: [[pos[id].x, pos[id].y]] };
    } else if (tool === "pass") {
      const holderNear = step.ball.holder && nearestPiece(visible, pos, p, REACH) === step.ball.holder;
      if (dist(p, ball) < REACH || holderNear) d = { kind: "stroke", arrow: "pass", piece: null, pts: [ball] };
    } else if (tool === "dir") {
      const id = nearestPiece(visible, pos, p, REACH);
      if (id) d = { kind: "dir", id };
    } else if (tool === "erase") {
      erase(p);
      return;
    }
    if (!d) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
    if (d.kind !== "stroke") snapshot();
    dragRef.current = d;
    setDraft(d);
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const p: Pt = [clamp(toWorld(e)[0], -1, L + 1), clamp(toWorld(e)[1], 0, W)];
    if (d.kind === "piece") {
      setSteps(s => movePiece(s, k, d.id, { x: p[0], y: p[1] }));
    } else if (d.kind === "ball") {
      setSteps(s => s.map((st, i) => (i === k ? { ...st, ball: { holder: null, x: p[0], y: p[1] } } : st)));
    } else if (d.kind === "dir") {
      const q = dataRef.current.steps[k].pos[d.id];
      if (dist(p, [q.x, q.y]) < 0.8) return;
      const dir = Math.round((Math.atan2(p[1] - q.y, p[0] - q.x) * 180) / Math.PI);
      setSteps(s => movePiece(s, k, d.id, { dir }));
    } else {
      const last = d.pts[d.pts.length - 1];
      if (dist(last, p) < 0.4) return;
      const nd = { ...d, pts: [...d.pts, p] };
      dragRef.current = nd;
      setDraft(nd);
    }
  };

  const onUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDraft(null);
    if (!d) return;
    if (d.kind === "ball") {
      const st = dataRef.current.steps[k];
      const holder = nearestPiece(visible, st.pos, [st.ball.x, st.ball.y], 2.5);
      if (holder) setSteps(s => s.map((x, i) => (i === k ? { ...x, ball: { ...x.ball, holder } } : x)));
      return;
    }
    if (d.kind !== "stroke") return;
    let len = 0;
    for (let i = 1; i < d.pts.length; i++) len += dist(d.pts[i - 1], d.pts[i]);
    if (len < 2) return; // a tap, not a stroke
    finishStroke(d);
  };

  function finishStroke(d: Extract<Drag, { kind: "stroke" }>) {
    // passes fly straight; runs follow the drawn curve, smoothed
    const way = d.arrow === "pass" ? [d.pts[0], d.pts[d.pts.length - 1]] : fitStroke(d.pts);
    const curve = spline(way);
    const end = way[way.length - 1];
    const endDir = Math.round(heading(curve[Math.max(0, curve.length - 3)], end));
    commit(cur => {
      let s = cur.steps.slice();
      if (!s[k + 1]) s.splice(k + 1, 0, copyStep(s[k]));
      const arrow: Arrow = { id: uid(), kind: d.arrow, piece: d.piece, pts: way };
      // one movement per player (and one pass) per step: a new stroke replaces the old
      const keep = s[k].arrows.filter(a => (d.arrow === "pass" ? a.kind !== "pass" : a.piece !== d.piece));
      s[k] = { ...s[k], arrows: [...keep, arrow] };

      if (d.arrow === "pass") {
        const rec = nearestPiece(cur.pieces, s[k + 1].pos, end, REACH);
        s[k + 1] = { ...s[k + 1], ball: rec ? { holder: rec, x: end[0], y: end[1] } : { holder: null, x: end[0], y: end[1] } };
        if (s[k].ball.holder) {
          // the passer faces the pass
          s = movePiece(s, k, s[k].ball.holder, { dir: endDir });
        }
      } else if (d.piece) {
        s = movePiece(s, k + 1, d.piece, { x: end[0], y: end[1], dir: endDir });
        if (d.arrow === "drib" || s[k].ball.holder === d.piece) {
          s[k] = { ...s[k], ball: { ...s[k].ball, holder: d.piece } };
          if (!s[k].arrows.some(a => a.kind === "pass")) s[k + 1] = { ...s[k + 1], ball: { ...s[k + 1].ball, holder: d.piece } };
        }
      }
      return { ...cur, steps: s };
    });
  }

  function erase(p: Pt) {
    // nearest arrow first
    let best: string | null = null, bd = 1.8;
    for (const a of step.arrows) {
      for (const q of arrowCurve(a, step, next)) { const dd = dist(p, q); if (dd < bd) { bd = dd; best = a.id; } }
    }
    if (best) {
      commit(cur => ({ ...cur, steps: cur.steps.map((s, i) => (i === k ? { ...s, arrows: s.arrows.filter(a => a.id !== best) } : s)) }));
      return;
    }
    const id = nearestPiece(visible.filter(x => x.side === "them"), step.pos, p, 2.5);
    if (id) {
      commit(cur => ({
        pieces: cur.pieces.filter(x => x.id !== id),
        steps: cur.steps.map(s => {
          const pos = { ...s.pos };
          delete pos[id];
          return { ...s, pos, arrows: s.arrows.filter(a => a.piece !== id), ball: s.ball.holder === id ? { ...s.ball, holder: null } : s.ball };
        }),
      }));
    }
  }

  /* ---------- step and piece commands ---------- */
  const addStep = () => {
    commit(cur => {
      const s = cur.steps.slice();
      s.splice(k + 1, 0, copyStep(s[k]));
      return { ...cur, steps: s };
    });
    setK(k + 1);
  };
  const removeStep = () => {
    if (steps.length < 2) return;
    commit(cur => {
      const s = cur.steps.filter((_, i) => i !== k);
      if (k > 0 && k === cur.steps.length - 1) s[k - 1] = { ...s[k - 1], arrows: [] };
      return { ...cur, steps: s };
    });
    setK(Math.max(0, k - 1));
  };
  const addOpponent = () => {
    const id = uid();
    commit(cur => ({
      pieces: [...cur.pieces, { id, side: "them", label: "" }],
      steps: cur.steps.map(s => ({ ...s, pos: { ...s.pos, [id]: { x: L / 2 + 8, y: MIDY, dir: 180 } } })),
    }));
    setShowThem(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [undo]);

  function open3d() {
    if (anim) setK(anim.from);
    stop();
    setShow3d(true);
  }
  const switchMode = (m: Mode) => {
    stop();
    setDraft(null);
    dragRef.current = null;
    setMode(m);
  };

  /* ---------- render ---------- */
  const lbl = portrait ? "rotate(90)" : undefined;
  const hint = mode === "play"
    ? "Tryck på en spelare för att se hans synfält. Dubbeltryck eller Se i 3D för att stå i hans skor."
    : TOOLS.find(t => t.id === tool)!.hint;
  const holder = shownStep.ball.holder ? pieceById[shownStep.ball.holder] : null;
  const saveText = { saved: "Sparat", saving: "Sparar…", dirty: "Ändrat", error: "Kunde inte spara" }[save];

  return (
    <main className="wrap editor">
      <header className="top">
        <div className="title">
          <Link className="back" href="/">← Mina spel</Link>
          <input className="name" value={name} onChange={e => setName(e.target.value)} aria-label="Spelets namn" maxLength={80} readOnly={mode === "play"} />
        </div>
        <div className="bar">
          <div className="modes" role="group" aria-label="Läge">
            <button type="button" aria-pressed={mode === "play"} onClick={() => switchMode("play")}>Spela</button>
            <button type="button" aria-pressed={mode === "edit"} onClick={() => switchMode("edit")}>Redigera</button>
          </div>
          {mode === "edit" && <>
            <span className={"save " + save} role="status">{saveText}</span>
            <button className="btn ghost" type="button" onClick={undo} disabled={!past.length || playing}>Ångra</button>
          </>}
        </div>
      </header>

      {mode === "edit" ? (
        <nav className="tools" aria-label="Verktyg">
          {TOOLS.map(t => (
            <button key={t.id} type="button" aria-pressed={tool === t.id} className={"tool tool-" + t.id} onClick={() => setTool(t.id)} disabled={playing}>
              {t.label}
            </button>
          ))}
        </nav>
      ) : (
        <p className="hint play-hint">{hint}</p>
      )}

      <figure className="rink">
        <svg
          ref={svgRef}
          id="field"
          viewBox={portrait ? "-3 -4 71 113" : "-4 -3 113 71"}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          role="img"
          aria-label="Bandyplan sedd uppifrån. Vi anfaller åt höger."
        >
          <defs>
            <clipPath id="rink-clip"><rect x={0} y={0} width={L} height={W} /></clipPath>
            {(["run", "drib", "pass"] as const).map(kind => (
              <marker key={kind} id={"ah-" + kind} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="2.8" markerHeight="2.8" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0 0 L10 5 L0 10 Z" className={"ah ah-" + kind} />
              </marker>
            ))}
          </defs>
          <g ref={worldRef} transform={portrait ? `matrix(0 -1 1 0 0 ${L})` : undefined}>
            <Rink portrait={portrait} />

            {mode === "play" && viewer && frame.pos[viewer] && (() => {
              // what he sees: clear in front (±55°), out of the corner of the eye (±100°)
              const p = frame.pos[viewer];
              const wedge = (half: number) => {
                const a = ((p.dir - half) * Math.PI) / 180, b = ((p.dir + half) * Math.PI) / 180, r = 140;
                return `M${p.x} ${p.y} L${p.x + r * Math.cos(a)} ${p.y + r * Math.sin(a)} A${r} ${r} 0 ${half > 90 ? 1 : 0} 1 ${p.x + r * Math.cos(b)} ${p.y + r * Math.sin(b)} Z`;
              };
              return (
                <g clipPath="url(#rink-clip)" className="cone">
                  <path d={wedge(100)} className="cone-side" />
                  <path d={wedge(55)} className="cone-main" />
                </g>
              );
            })()}

            <g className={anim ? "trails playing" : "trails"}>
              {shownStep.arrows.map(a => {
                if (a.piece && !showThem && pieceById[a.piece]?.side === "them") return null;
                const pts = arrowCurve(a, shownStep, shownNext);
                const d = pathD(a.kind === "drib" ? wavy(pts) : pts);
                return <path key={a.id} d={d} className={"arrow arrow-" + a.kind} markerEnd={`url(#ah-${a.kind})`} />;
              })}
              {draft?.kind === "stroke" && draft.pts.length > 1 && (() => {
                // show the raw finger trace faintly and what it snaps to
                const way = draft.arrow === "pass" ? [draft.pts[0], draft.pts[draft.pts.length - 1]] : fitStroke(draft.pts);
                const snapped = spline(way);
                return (
                  <>
                    <path d={pathD(draft.pts)} className="arrow trace" />
                    <path d={pathD(draft.arrow === "drib" ? wavy(snapped) : snapped)} className={"arrow draft arrow-" + draft.arrow} markerEnd={`url(#ah-${draft.arrow})`} />
                  </>
                );
              })()}
            </g>

            <g className="players">
              {visible.map(pc => {
                const p = frame.pos[pc.id];
                if (!p) return null;
                const key = shownStep.ball.holder === pc.id;
                return (
                  <g key={pc.id} transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`}>
                    <path className={"nose nose-" + pc.side} d="M1.15 -0.75 L2.05 0 L1.15 0.75 Z" transform={`rotate(${p.dir.toFixed(1)})`} />
                    <circle className={(pc.side === "us" ? "p-us" : "p-them") + (key ? " key" : "") + (mode === "play" && viewer === pc.id ? " viewer" : "")} r={pc.side === "us" ? 1.4 : 1.2} />
                    {pc.label && <text className="p-lbl" y={0.05} transform={lbl} style={pc.label.length > 1 ? { fontSize: "1px" } : undefined}>{pc.label}</text>}
                  </g>
                );
              })}
            </g>
            <circle className="ball" cx={frame.ball[0]} cy={frame.ball[1]} r={0.6} />
          </g>
        </svg>
      </figure>

      <div className="foot">
        {mode === "edit" && <p className="hint">{playing ? "Spelar…" : hint}</p>}
        <div className="stepline">
          <span className="count">{(anim ? anim.from : k) + 1}/{steps.length}</span>
          {mode === "play" ? (
            <p className="step-text">{shownStep.text}</p>
          ) : <input
            className="step-text"
            placeholder={next ? "Beskriv vad som händer i steget" : "Rita en pil för att skapa nästa steg"}
            value={shownStep.text}
            onFocus={snapshot}
            onChange={e => setSteps(s => s.map((x, i) => (i === k ? { ...x, text: e.target.value.slice(0, 140) } : x)))}
            disabled={playing}
            aria-label="Beskrivning av steget"
          />}
        </div>
        <div className="bar">
          <button className="btn ghost" type="button" onClick={() => { stop(); setK(Math.max(0, k - 1)); }} disabled={k === 0 && !playing} aria-label="Föregående steg">←</button>
          <button className="btn" type="button" id="playstep" onClick={() => (playing ? stop() : play(k, false))} disabled={!playing && !next}>
            {playing ? "Paus" : "Spela steg"}
          </button>
          <button className="btn ghost" type="button" onClick={() => { stop(); setK(Math.min(steps.length - 1, k + 1)); }} disabled={!next && !playing} aria-label="Nästa steg">→</button>
          <div className="dots" role="group" aria-label="Steg">
            {steps.map((s, i) => (
              <button key={s.id} type="button" className={i === (anim ? anim.from : k) ? "cur" : i < k ? "done" : ""} onClick={() => { stop(); setK(i); }} aria-label={`Steg ${i + 1}`}>
                {i + 1}
              </button>
            ))}
          </div>
          <button className="btn ghost" type="button" onClick={() => play(0, true)} disabled={playing || steps.length < 2}>Spela allt</button>
        </div>
        <div className="bar small">
          {mode === "edit" && <>
            <button className="tg" type="button" onClick={addStep} disabled={playing}>+ Steg</button>
            <button className="tg" type="button" onClick={removeStep} disabled={playing || steps.length < 2}>Ta bort steg</button>
            <button className="tg" type="button" onClick={addOpponent} disabled={playing}>+ Motståndare</button>
          </>}
          <button className="tg" type="button" aria-pressed={showThem} onClick={() => setShowThem(v => !v)}>Visa motståndare</button>
          {mode === "play" && viewer && pieceById[viewer] && (
            <button className="btn" type="button" onClick={open3d}>Se i 3D</button>
          )}
          {holder && <span className="holder">Bollen: {holder.label ? NAMES[holder.label] ?? holder.label : "motståndare"}</span>}
        </div>
      </div>
      {show3d && viewer && pieceById[viewer] && (
        <View3D
          pieces={data.pieces}
          step={step}
          viewer={viewer}
          k={k}
          count={steps.length}
          onStep={i => setK(clamp(i, 0, steps.length - 1))}
          onClose={() => setShow3d(false)}
        />
      )}
    </main>
  );
}
