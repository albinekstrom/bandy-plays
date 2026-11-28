"use client";
/* The play editor: draw on the rink step by step, then play it back.
   Play mode also has branch choices, a quiz, passing lanes and the 3D view;
   readOnly (a shared link) is play mode only, without saving. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { pollWhileVisible } from "@/lib/poll";
import { onFlush } from "@/lib/unsaved";
import { dataOf } from "@/lib/schema";
import dynamic from "next/dynamic";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Arrow, ArrowKind, Play, PlayData, Pt, Step } from "@/lib/types";
import { L, W, MIDY, NAMES, ZONE_MIN, ZONE_MAX, zoneOf } from "@/lib/rink";
import { clamp, dist, fitStroke, heading, pathD, spline } from "@/lib/geom";
import {
  arrowCurve, arrowKind, ballPoint, endState, holderRun, lobArc, passOrigin, runHandles, frameAt, movePiece, nearestPiece, placeFromStart, plan, runEndDir, skatedBefore, stepAfter, stillFrame, uid, type Frame, type Plan,
} from "@/lib/play";
import { choicesAt, everyStep, lineName, lineSteps, ownFrom, receiverAt, writeLine, type Line } from "@/lib/lines";
import { laneStatus, type Lane } from "@/lib/lanes";
import { autoPlace } from "@/lib/auto";
import { spaceControl, CELL } from "@/lib/space";
import { taskFor } from "@/lib/tasks";
import Rink from "./Rink";
import type { ScreenState } from "./RemoteControl";

// three.js is only loaded when someone opens the 3D view
const View3D = dynamic(() => import("./View3D"), { ssr: false });
const VideoExport = dynamic(() => import("./VideoExport"), { ssr: false });

type Tool = "move" | "run" | "pass" | "lob" | "dir" | "erase";
type Mode = "play" | "edit";
const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "move", label: "Flytta", hint: "Dra en spelare. Bollen följer bollföraren och flyttas bara med Pass." },
  { id: "run", label: "Åkning", hint: "Dra från en spelare dit hen ska åka. Bollföraren driver bollen (rosa linje). Dra i punkten på linjen för att böja den." },
  { id: "pass", label: "Pass", hint: "Dra från bollen till en medspelare. Passet går i rak linje längs isen, efter stegets åkningar." },
  { id: "lob", label: "Lyra", hint: "Dra från bollen till en medspelare. Bollen lyfts i en båge över spelarna, efter stegets åkningar." },
  { id: "dir", label: "Riktning", hint: "Dra från en spelare åt det håll hen ska titta." },
  { id: "erase", label: "Sudda", hint: "Tryck på en pil eller en motståndare för att ta bort den." },
];
const REACH = 3.2; // metres: generous for fingers

type Drag =
  | { kind: "piece"; id: string }
  | { kind: "dir"; id: string }
  | { kind: "bend"; arrow: string; piece: string; index: number; handles: Pt[] }
  | { kind: "stroke"; arrow: ArrowKind; piece: string | null; pts: Pt[]; lob?: boolean };

type Save = "saved" | "saving" | "dirty" | "error" | "conflict";
type PlayOpts = { line?: Line; skipAsk?: number; onDone?: () => void };
interface Choice { k: number; sub: string; options: { line: Line; name: string; badge: string | null }[]; pick: (l: Line) => void }
interface Quiz {
  k: number; score: number; asked: number; done: boolean;
  q: { passer: string | null; answers: { line: Line; receiver: string }[] } | null;
  feedback: { ok: boolean; tapped: string; right: string[] } | null;
}

export default function Editor({ initial, readOnly = false, shared = false, role, present = false }: {
  initial: Play;
  readOnly?: boolean;
  shared?: boolean;  // opened from a share link (no login): no way back to the list
  role?: string;     // a shared "Min uppgift" link: the label of the player it is for
  present?: boolean; // presentation mode: big screen, keyboard/clicker and phone remote
}) {
  const [name, setName] = useState(initial.name);
  // all of the play's data, fields this version doesn't know included, so saving never drops them
  const [data, setData] = useState<PlayData>(() => ({ ...dataOf(initial as unknown as Record<string, unknown>), variants: initial.variants ?? [] }));
  const [past, setPast] = useState<PlayData[]>([]);
  const [line, setLine] = useState<Line>(null);
  const [k, setK] = useState(0);
  const [tool, setTool] = useState<Tool>("move");
  const [showThem, setShowThem] = useState(true);
  const [draft, setDraft] = useState<Drag | null>(null);
  const [anim, setAnim] = useState<{ from: number; u: number; plan: Plan } | null>(null);
  const [save, setSave] = useState<Save>("saved");
  const [portrait, setPortrait] = useState(false);
  const [viewer, setViewer] = useState<string | null>(() =>
    role ? initial.pieces.find(p => p.side === "us" && p.label === role)?.id ?? null : null);
  // finished plays open for watching; a fresh one opens for drawing
  const [mode, setMode] = useState<Mode>(readOnly || initial.steps.length > 1 ? "play" : "edit");
  const [show3d, setShow3d] = useState(false);
  const [lanes, setLanes] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [share, setShare] = useState<{ open: boolean; token: string | null; copied: boolean; busy: boolean; copiedRole?: string }>(
    { open: false, token: initial.shareToken ?? null, copied: false, busy: false });
  const [speed, setSpeed] = useState(1);
  const [space, setSpace] = useState(false);
  const [more, setMore] = useState(false);
  const [video, setVideo] = useState(false);
  const [autoOpts, setAutoOpts] = useState({ us: true, them: true });
  const [sel, setSel] = useState<string | null>(null);
  const [selArrow, setSelArrow] = useState<string | null>(null); // run tapped to reshape
  const [notice, setNotice] = useState<string | null>(null); // why something can't be done // player picked in edit mode (for his task)
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const quizTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const dataRef = useRef(data);
  const lineRef = useRef(line);
  const speedRef = useRef(speed);
  useLayoutEffect(() => { dataRef.current = data; lineRef.current = line; speedRef.current = speed; }, [data, line, speed]);

  const steps = useMemo(() => lineSteps(data, line), [data, line]);
  const kk = Math.min(k, steps.length - 1);
  const step = steps[kk];
  const next = steps[kk + 1] as Step | undefined;
  const pieceById = useMemo(() => Object.fromEntries(data.pieces.map(p => [p.id, p])), [data.pieces]);
  const visible = useMemo(() => data.pieces.filter(p => showThem || p.side === "us"), [data.pieces, showThem]);
  const variants = data.variants ?? [];
  const own = ownFrom(data, line);
  const roleId = role ? data.pieces.find(p => p.side === "us" && p.label === role)?.id ?? null : null;
  const labelOf = (id: string | null | undefined) => {
    const p = id ? pieceById[id] : undefined;
    return p ? p.label || "M" : "";
  };
  const nameOf = (id: string | null | undefined) => {
    const p = id ? pieceById[id] : undefined;
    return p ? (p.label ? NAMES[p.label] ?? p.label : "Motståndaren") : "Bollhållaren";
  };

  /* ---------- history ---------- */
  const snapshot = useCallback(() => setPast(p => [...p.slice(-49), dataRef.current]), []);
  const commit = useCallback((fn: (d: PlayData) => PlayData) => {
    setPast(p => [...p.slice(-49), dataRef.current]);
    setData(fn);
  }, []);
  /** Change the steps of the line being edited (shared steps land in the main line). */
  const commitLine = (fn: (s: Step[], d: PlayData) => Step[]) => commit(d => writeLine(d, line, fn(lineSteps(d, line), d)));
  const setSteps = (fn: (s: Step[]) => Step[]) => setData(d => writeLine(d, line, fn(lineSteps(d, line))));
  const undo = useCallback(() => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setData(prev);
    setPast(past.slice(0, -1));
    const ln = prev.variants?.some(v => v.id === lineRef.current) ? lineRef.current : null;
    setLine(ln);
    setK(x => Math.min(x, lineSteps(prev, ln).length - 1));
  }, [past]);

  /* ---------- autosave ----------
     One request at a time. `acked` is what the server has confirmed and `shown` is what
     the editor shows; after every response they are compared again, so a change made while
     a save was in flight (an undo back to the saved state included) is always saved too.
     Each save names the revision it builds on: if someone else saved in between, the
     server answers 409, nothing is overwritten and the coach picks a version. */
  const shown = useRef("");
  const acked = useRef<string | null>(null); // set to the play as loaded: what the server has, so opening never writes
  const revRef = useRef(initial.revision ?? 0);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflict = useRef(false);
  const failed = useRef(false);
  const unsaved = useCallback(() => acked.current !== null && (shown.current !== acked.current || inFlight.current !== null), []);
  const status = useCallback((): Save => (conflict.current ? "conflict" : failed.current ? "error"
    : inFlight.current ? "saving" : shown.current !== acked.current ? "dirty" : "saved"), []);

  /** Save until the server has what the editor shows; resolves when idle. force: overwrite after a conflict. */
  const saveNow = useCallback((force = false): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (inFlight.current) return inFlight.current; // it checks the draft again when it's done
    if ((conflict.current && !force) || shown.current === acked.current) { setSave(status()); return Promise.resolve(); }
    const run = (async () => {
      let overwrite = force;
      while (shown.current !== acked.current && (!conflict.current || overwrite)) {
        const sent = shown.current;
        setSave("saving");
        try {
          const res = await fetch(`/api/plays/${initial.id}`, {
            method: "PUT", headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...JSON.parse(sent), rev: overwrite ? undefined : revRef.current }),
          });
          if (res.status === 409) { conflict.current = true; break; }
          if (!res.ok) { failed.current = true; break; }
          revRef.current = ((await res.json()) as { revision: number }).revision;
          acked.current = sent;
          conflict.current = failed.current = overwrite = false;
        } catch { failed.current = true; break; }
      }
      inFlight.current = null;
      setSave(status());
    })();
    inFlight.current = run;
    return run;
  }, [initial.id, status]);

  useEffect(() => {
    if (readOnly) return;
    shown.current = JSON.stringify({ name, ...data });
    acked.current ??= shown.current;
    failed.current = false;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (conflict.current) return; // wait for the coach's choice
    // back to what the server has (an undo): nothing to save, unless a save is under way (it rechecks)
    timer.current = setTimeout(() => { void saveNow(); }, shown.current === acked.current ? 0 : 700);
  }, [name, data, readOnly, saveNow]);

  // every way out saves first: "Ladda om" and links in the app wait for the save loop, closing
  // the tab asks. The browser's back button stays in the app, so the same save loop simply keeps
  // running after the editor is gone and finishes with what the coach last saw.
  const flush = useCallback(async () => { await saveNow(); return !unsaved() && !conflict.current; }, [saveNow, unsaved]);
  const router = useRouter();
  const leave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (readOnly || !unsaved()) return;
    e.preventDefault();
    const href = e.currentTarget.getAttribute("href")!;
    void flush().then(ok => { if (ok) router.push(href); });
  };
  useEffect(() => {
    if (readOnly) return;
    const off = onFlush(flush);
    const warn = (e: BeforeUnloadEvent) => { if (unsaved()) e.preventDefault(); };
    addEventListener("beforeunload", warn);
    return () => {
      off();
      removeEventListener("beforeunload", warn);
      if (unsaved() || timer.current) void saveNow(); // the one save loop, no second write path
    };
  }, [readOnly, flush, unsaved, saveNow]);

  /* ---------- phones are view-only for now: no edit mode ---------- */
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(max-width: 700px), (pointer: coarse) and (max-height: 500px)");
    const on = () => {
      setPhone(mq.matches);
      if (mq.matches) setMode("play");
    };
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

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
  const playRef = useRef<{ raf: number } | null>(null);

  const stop = useCallback(() => {
    if (playRef.current) cancelAnimationFrame(playRef.current.raf);
    playRef.current = null;
    setAnim(null);
  }, []);

  /** Pop the "who gets the ball?" choice for a branch at step k. */
  function askBranch(at: number, ln: Line, then: (l: Line) => void) {
    const d = dataRef.current;
    const lines = choicesAt(d, ln, at);
    setChoice({
      k: at,
      sub: `${nameOf(lineSteps(d, ln)[at]?.ball.holder)} har bollen · ${lines.length} alternativ`,
      options: lines.map(l => ({ line: l, name: lineName(d, l), badge: labelOf(receiverAt(d, l, at)) || null })),
      pick: l => { setChoice(null); setLine(l); then(l); },
    });
  }

  function play(from: number, all: boolean, o: PlayOpts = {}) {
    const ln = o.line !== undefined ? o.line : lineRef.current;
    const d = dataRef.current;
    if (playRef.current) cancelAnimationFrame(playRef.current.raf);
    playRef.current = null;
    if (o.skipAsk !== from && choicesAt(d, ln, from).length > 1) {
      setAnim(null);
      setK(from);
      askBranch(from, ln, l => play(from, all, { ...o, line: l, skipAsk: from }));
      return;
    }
    const st = lineSteps(d, ln);
    if (from >= st.length - 1) { setAnim(null); o.onDone?.(); return; }
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cur = from;
    let t0 = -1; // set on the first frame
    let motion = plan(st[cur], st[cur + 1]);
    let dur = still ? 1 : (motion.T * 1000) / speedRef.current;
    const tick = (now: number) => {
      if (t0 < 0) t0 = now;
      const u = (now - t0) / dur;
      if (u < 1) {
        setAnim({ from: cur, u, plan: motion });
        playRef.current = { raf: requestAnimationFrame(tick) };
        return;
      }
      cur++;
      setK(cur);
      setAnim(null);
      if (all && choicesAt(dataRef.current, ln, cur).length > 1) {
        playRef.current = null;
        const at = cur;
        askBranch(at, ln, l => play(at, true, { ...o, line: l, skipAsk: at }));
        return;
      }
      if (all && cur < st.length - 1) {
        t0 = now + 450; // short breath on each step
        motion = plan(st[cur], st[cur + 1]);
        dur = still ? 1 : (motion.T * 1000) / speedRef.current;
        const wait = (n: number) => {
          if (n < t0) { playRef.current = { raf: requestAnimationFrame(wait) }; return; }
          tick(n);
        };
        playRef.current = { raf: requestAnimationFrame(wait) };
        return;
      }
      playRef.current = null;
      o.onDone?.();
    };
    setK(from);
    playRef.current = { raf: requestAnimationFrame(tick) };
  }

  useEffect(() => () => {
    if (playRef.current) cancelAnimationFrame(playRef.current.raf);
    if (quizTimer.current) clearTimeout(quizTimer.current);
  }, []);

  /* ---------- quiz: who should the ball go to? ---------- */
  function quizAt(at: number, ln: Line, score: number, asked: number) {
    const d = dataRef.current;
    const st = lineSteps(d, ln);
    const lines = choicesAt(d, ln, at);
    if (at >= st.length - 1 && lines.length <= 1) {
      setQuiz({ k: at, score, asked, done: true, q: null, feedback: null });
      return;
    }
    const answers = lines.map(l => ({ line: l, receiver: receiverAt(d, l, at) })).filter((a): a is { line: Line; receiver: string } => !!a.receiver);
    setLine(ln);
    setK(at);
    if (!answers.length) {
      // nothing to ask here: play on along the first line
      const l = lines[0];
      setQuiz({ k: at, score, asked, done: false, q: null, feedback: null });
      play(at, false, { line: l, skipAsk: at, onDone: () => quizAt(at + 1, l, score, asked) });
      return;
    }
    setQuiz({ k: at, score, asked, done: false, q: { passer: st[at].ball.holder, answers }, feedback: null });
  }
  function answer(id: string) {
    if (!quiz?.q || quiz.feedback) return;
    const hit = quiz.q.answers.find(a => a.receiver === id);
    const score = quiz.score + (hit ? 1 : 0), asked = quiz.asked + 1, at = quiz.k;
    const l = hit ? hit.line : quiz.q.answers[0].line;
    setQuiz({ ...quiz, score, asked, feedback: { ok: !!hit, tapped: id, right: quiz.q.answers.map(a => a.receiver) } });
    quizTimer.current = setTimeout(() => {
      setQuiz(q => (q ? { ...q, q: null, feedback: null } : q));
      setLine(l);
      play(at, false, { line: l, skipAsk: at, onDone: () => quizAt(at + 1, l, score, asked) });
    }, 1600);
  }
  function startQuiz() {
    stop();
    setChoice(null);
    setViewer(null);
    if (quizTimer.current) clearTimeout(quizTimer.current);
    quizAt(0, null, 0, 0);
  }
  function endQuiz() {
    if (quizTimer.current) clearTimeout(quizTimer.current);
    stop();
    setQuiz(null);
  }
  const quizAsking = !!quiz?.q && !quiz.feedback;

  /* ---------- what to draw ---------- */
  const shownStep = anim ? steps[anim.from] : step;
  // in edit mode, a faint ball where the dribble takes it: at the end of the run, or where the pass leaves
  const stepEnd = useMemo(() => (next ? { pos: next.pos, ball: next.ball } : endState(step, data.pieces)), [next, step, data.pieces]);
  const ghostBall: Pt | null = mode === "edit" && !anim && holderRun(step)
    ? (next && step.arrows.some(a => a.kind === "pass") ? passOrigin(step, next) : ballPoint({ ...stepEnd.ball, holder: step.ball.holder }, stepEnd.pos))
    : null;
  // a run tapped in edit mode shows points along it to reshape it
  const bendArrow = mode === "edit" && !playing && selArrow && (tool === "move" || tool === "run")
    ? step.arrows.find(a => a.id === selArrow && a.kind !== "pass") : undefined;
  const handles: Pt[] = draft?.kind === "bend" ? draft.handles : bendArrow ? runHandles(bendArrow, step, next) : [];
  const shownNext = anim ? steps[anim.from + 1] : next;
  const screenStep = anim ? anim.from : kk;
  const frame: Frame = anim ? frameAt(anim.plan, anim.u * anim.plan.T) : stillFrame(step);

  // open, risky and closed passes from the ball carrier, when standing still
  const laneList = useMemo(() => {
    if (!lanes || mode !== "play" || anim) return [];
    const h = step.ball.holder, side = h ? pieceById[h]?.side : undefined;
    if (!h || !side) return [];
    const from = ballPoint(step.ball, step.pos);
    const opps = data.pieces.filter(p => p.side !== side && step.pos[p.id]).map(p => step.pos[p.id]);
    return data.pieces
      .filter(p => p.side === side && p.id !== h && step.pos[p.id])
      .map(p => ({ id: p.id, to: [step.pos[p.id].x, step.pos[p.id].y] as Pt, ...laneStatus(from, [step.pos[p.id].x, step.pos[p.id].y], opps) }));
  }, [lanes, mode, anim, step, data.pieces, pieceById]);
  const laneCount = (s: Lane) => laneList.filter(l => l.status === s).length;

  // who gets there first: a soft blue (ours) / grey (theirs) map, drawn once per still step
  const spaceImg = useMemo(() => {
    if (!space || mode !== "play" || anim || typeof document === "undefined") return null;
    const { cols, rows, grid } = spaceControl(data.pieces, step.pos);
    const c = document.createElement("canvas");
    c.width = cols; c.height = rows;
    const g = c.getContext("2d");
    if (!g) return null;
    const img = g.createImageData(cols, rows);
    let ours = 0;
    for (let i = 0; i < grid.length; i++) {
      const m = grid[i], a = Math.min(1, Math.abs(m) / 1.2);
      const j = i * 4;
      if (m > 0) ours++;
      img.data[j] = m > 0 ? 0 : 107;
      img.data[j + 1] = m > 0 ? 87 : 119;
      img.data[j + 2] = m > 0 ? 168 : 133;
      img.data[j + 3] = Math.round(40 + 120 * a);
    }
    g.putImageData(img, 0, 0);
    return { href: c.toDataURL(), w: cols * CELL, h: rows * CELL, ourShare: Math.round(100 * ours / grid.length) };
  }, [space, mode, anim, data.pieces, step.pos]);
  const ourShare = spaceImg?.ourShare ?? 0;

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
      const id = nearestPiece(visible, frame.pos, toWorld(e), REACH);
      if (quiz) { if (id && quizAsking) answer(id); return; }
      // tap: show his field of view; tap again quickly: stand in his skates (3D)
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
    let d: Drag | null = null;

    const hi = handles.findIndex(h => dist(p, h) < 1.4);
    const tapped = (tool === "move" || tool === "run") && !(nearestPiece(visible, pos, p, 1.8))
      ? step.arrows.find(a => a.kind !== "pass" && arrowCurve(a, step, next).some(q => dist(p, q) < 1.2)) : undefined;
    if (bendArrow?.piece && hi >= 0) {
      d = { kind: "bend", arrow: bendArrow.id, piece: bendArrow.piece, index: hi, handles };
    } else if (tapped) {
      setSelArrow(tapped.id); // tap a run: show its points
      return;
    } else if (tool === "move") {
      // the ball can't be dragged: it follows its holder and only moves with a pass
      const id = nearestPiece(visible, pos, p, REACH);
      setSelArrow(null);
      if (id && kk > 0 && skatedBefore(steps, kk, id)) {
        setSel(id);
        setNotice(`${labelOf(id)} har åkt i ett tidigare steg och står där åkningen slutade. Flytta hen med Åkning.`);
      } else if (id) { d = { kind: "piece", id }; setSel(id); setNotice(null); }
      else setSel(null);
    } else if (tool === "run") {
      const id = nearestPiece(visible, pos, p, REACH);
      if (id) d = { kind: "stroke", arrow: id === step.ball.holder ? "drib" : "run", piece: id, pts: [[pos[id].x, pos[id].y]] };
    } else if (tool === "pass" || tool === "lob") {
      // a pass is its own phase after the step's runs: from where the ball is when they are done
      const holder = step.ball.holder;
      const from = ballPoint(step.ball, stepEnd.pos);
      const holderNear = holder && nearestPiece(visible, stepEnd.pos, p, REACH) === holder;
      if (dist(p, from) < REACH || holderNear) d = { kind: "stroke", arrow: "pass", piece: null, pts: [from], lob: tool === "lob" };
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
      // placed from step 1, so he never jumps between steps
      setSteps(s => placeFromStart(s, d.id, { x: p[0], y: p[1] }));
    } else if (d.kind === "bend") {
      // the run goes through all its points; only the dragged one moves
      const hs = d.handles.map((h, j) => (j === d.index ? p : h));
      const nd = { ...d, handles: hs };
      dragRef.current = nd;
      setDraft(nd);
      setSteps(s => s.map((st, i) => (i !== kk ? st : {
        ...st,
        arrows: st.arrows.map(a => (a.id !== d.arrow ? a : { id: a.id, kind: a.kind, piece: a.piece, pts: [a.pts[0], ...hs, a.pts[a.pts.length - 1]] })),
      })));
    } else if (d.kind === "dir") {
      const q = lineSteps(dataRef.current, line)[kk].pos[d.id];
      if (dist(p, [q.x, q.y]) < 0.8) return;
      const dir = Math.round((Math.atan2(p[1] - q.y, p[0] - q.x) * 180) / Math.PI);
      setSteps(s => movePiece(s, kk, d.id, { dir }));
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
    if (d.kind === "bend") {
      // he faces the way the bent run now ends
      setSteps(s => {
        const dir = runEndDir(s, kk + 1, d.piece);
        return dir === null || !s[kk + 1] ? s : movePiece(s, kk + 1, d.piece, { dir });
      });
      return;
    }
    if (d.kind === "piece") return;
    if (d.kind !== "stroke") return;
    let len = 0;
    for (let i = 1; i < d.pts.length; i++) len += dist(d.pts[i - 1], d.pts[i]);
    if (len < 2) return; // a tap, not a stroke
    finishStroke(d);
  };

  function finishStroke(d: Extract<Drag, { kind: "stroke" }>) {
    // a pass always reaches a teammate, in a straight line to where he is when it's played
    let rec: string | null = null;
    if (d.arrow === "pass") {
      const holder = step.ball.holder;
      rec = nearestPiece(visible.filter(x => x.side === "us" && x.id !== holder), stepEnd.pos, d.pts[d.pts.length - 1], REACH);
      if (!rec) { setNotice("En passning måste gå fram till en medspelare. Släpp den på spelaren."); return; }
      setNotice(null);
    }
    // passes fly straight; runs follow the drawn curve, smoothed
    const way: Pt[] = d.arrow === "pass" && rec ? [d.pts[0], [stepEnd.pos[rec].x, stepEnd.pos[rec].y]] : fitStroke(d.pts);
    const curve = spline(way);
    const end = way[way.length - 1];
    const endDir = Math.round(heading(curve[Math.max(0, curve.length - 3)], end));
    commitLine((cur, doc) => {
      // runs in the last step wait for "+ Steg"; a pass makes the step it lands in
      let s = cur.slice();
      const arrow: Arrow = { id: uid(), kind: d.arrow, piece: d.piece, pts: way, ...(d.lob ? { lob: true } : {}) };
      // one movement per player (and one pass) per step: a new stroke replaces the old
      const keep = s[kk].arrows.filter(a => (d.arrow === "pass" ? a.kind !== "pass" : a.piece !== d.piece));
      s[kk] = { ...s[kk], arrows: [...keep, arrow] };

      if (d.arrow === "pass") {
        // the pass is an in-between phase: after the runs of this step, then the next step starts
        if (!s[kk + 1]) s.splice(kk + 1, 0, stepAfter(s, kk, doc.pieces));
        s[kk + 1] = { ...s[kk + 1], ball: { holder: rec, x: end[0], y: end[1] } };
        const passer = s[kk].ball.holder;
        if (passer && !s[kk].arrows.some(a => a.kind !== "pass" && a.piece === passer)) {
          // a passer standing still faces the pass
          s = movePiece(s, kk, passer, { dir: endDir });
        }
      } else if (d.piece) {
        if (s[kk + 1]) s = movePiece(s, kk + 1, d.piece, { x: end[0], y: end[1], dir: endDir }, true);
        if (s[kk + 1] && s[kk].ball.holder === d.piece) {
          // the ball holder dribbles: he still has it next step unless he passes
          if (!s[kk].arrows.some(a => a.kind === "pass")) s[kk + 1] = { ...s[kk + 1], ball: { ...s[kk + 1].ball, holder: d.piece } };
        }
      }
      return s;
    });
  }

  function erase(p: Pt) {
    // nearest arrow first
    let best: string | null = null, bd = 1.8;
    for (const a of step.arrows) {
      for (const q of arrowCurve(a, step, next)) { const dd = dist(p, q); if (dd < bd) { bd = dd; best = a.id; } }
    }
    if (best) {
      commitLine(s => {
        const gone = s[kk].arrows.find(a => a.id === best)!;
        let c = s.map((x, i) => (i === kk ? { ...x, arrows: x.arrows.filter(a => a.id !== best) } : x));
        const nx = c[kk + 1];
        if (nx && gone.kind !== "pass" && gone.piece && c[kk].pos[gone.piece]) {
          // without his run he stands still: back where he was in this step, in the next step and
          // the ones after that were made from it (where he stood still)
          const { x, y, dir } = c[kk].pos[gone.piece];
          c = movePiece(c, kk + 1, gone.piece, { x, y, dir }, true);
        }
        if (nx && gone.kind === "pass") {
          // without the pass the ball stays with the one who had it
          c[kk + 1] = { ...c[kk + 1], ball: { ...c[kk].ball } };
          c[kk] = { ...c[kk], passAt: undefined };
        }
        return c;
      });
      return;
    }
    const id = nearestPiece(visible.filter(x => x.side === "them"), step.pos, p, 2.5);
    if (id) {
      commit(cur => everyStep({ ...cur, pieces: cur.pieces.filter(x => x.id !== id) }, s => {
        const pos = { ...s.pos };
        delete pos[id];
        return { ...s, pos, arrows: s.arrows.filter(a => a.piece !== id), ball: s.ball.holder === id ? { ...s.ball, holder: null } : s.ball };
      }));
    }
  }

  /* ---------- step, piece and variant commands ---------- */
  const addStep = () => {
    // drawing a run already made the next step with everyone at the end of their runs: go there
    if (step.arrows.length && next && !next.arrows.length && !next.text) { setK(kk + 1); return; }
    commitLine((s, doc) => { const c = s.slice(); c.splice(kk + 1, 0, stepAfter(c, kk, doc.pieces)); return c; });
    setK(kk + 1);
  };
  const removeStep = () => {
    if (steps.length < 2) return;
    commitLine(s => {
      return s.filter((_, i) => i !== kk);
    });
    setK(Math.max(0, kk - 1));
  };
  const addOpponent = () => {
    const id = uid();
    commit(cur => everyStep({ ...cur, pieces: [...cur.pieces, { id, side: "them", label: "" }] },
      s => ({ ...s, pos: { ...s.pos, [id]: { x: L / 2 + 8, y: MIDY, dir: 180 } } })));
    setShowThem(true);
  };
  const runAuto = () => {
    commitLine((s, d) => autoPlace(s, d.pieces, autoOpts));
    setMore(false);
  };
  const setNote = (id: string, text: string) =>
    setSteps(s => s.map((x, i) => (i === kk ? { ...x, notes: { ...x.notes, [id]: text.slice(0, 120) } } : x)));

  const onSpeed = (e: React.MouseEvent<HTMLButtonElement>) => setSpeed(Number(e.currentTarget.dataset.speed));

  /* ---------- share link ---------- */
  const shareUrl = share.token && typeof window !== "undefined" ? `${location.origin}/dela/${share.token}` : "";
  async function openShare() {
    if (share.open) { setShare(s => ({ ...s, open: false })); return; }
    if (share.token) { setShare(s => ({ ...s, open: true, copied: false })); return; }
    setShare(s => ({ ...s, busy: true }));
    const res = await fetch(`/api/plays/${initial.id}/share`, { method: "POST" });
    const token = res.ok ? (await res.json()).token as string : null;
    setShare({ open: true, token, copied: false, busy: false });
  }
  async function stopSharing() {
    setShare(s => ({ ...s, busy: true }));
    const res = await fetch(`/api/plays/${initial.id}/share`, { method: "DELETE" });
    setShare(s => (res.ok ? { open: false, token: null, copied: false, busy: false } : { ...s, busy: false }));
  }
  async function copyRoleLink(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.dataset.role!;
    try { await navigator.clipboard.writeText(`${shareUrl}?roll=${encodeURIComponent(r)}`); setShare(s => ({ ...s, copiedRole: r })); } catch { /* ignore */ }
  }
  async function copyShare() {
    try { await navigator.clipboard.writeText(shareUrl); setShare(s => ({ ...s, copied: true })); } catch { /* select it by hand */ }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // text fields keep their own undo; everywhere else Cmd/Ctrl+Z undoes the last change on the board
      const t = e.target as HTMLInputElement | null;
      if (t?.closest?.("input:not([readonly]), textarea")) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.code === "KeyZ" || e.key.toLowerCase() === "z")) { e.preventDefault(); undo(); }
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
    endQuiz();
    setDraft(null);
    dragRef.current = null;
    setMode(m);
  };

  /* ---------- presentation: keyboard, clicker and the phone remote ---------- */
  const [remoteCode, setRemoteCode] = useState<string | null>(null);
  const cmds = useRef<Record<string, (arg?: string) => void>>({});
  useLayoutEffect(() => {
    cmds.current = {
      next: () => { if (!playing && !choice) play(kk, false); },
      prev: () => { stop(); setChoice(null); setK(Math.max(0, kk - 1)); },
      first: () => { stop(); setChoice(null); setLine(null); setK(0); },
      all: () => { setChoice(null); setLine(null); play(0, true, { line: null }); },
      stop: () => stop(),
      pick: (id?: string) => choice?.pick(id === "main" ? null : id ?? null),
    };
  });
  useEffect(() => {
    if (!present) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element | null)?.closest?.("input, textarea, select")) return;
      const c = cmds.current;
      if (["ArrowRight", " ", "PageDown", "Enter"].includes(e.key)) { e.preventDefault(); c.next(); }
      else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); c.prev(); }
      else if (e.key === "Home") c.first();
      else if (e.key === "a") c.all();
      else if (e.key === "f") document.documentElement.requestFullscreen?.().catch(() => {});
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [present]);
  // open a remote session, then poll it for commands from the phone
  useEffect(() => {
    if (!present) return;
    const controller = new AbortController();
    let stopPoll: (() => void) | undefined;
    let seq = 0;
    void (async () => {
      const res = await fetch("/api/fjarr", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ playId: initial.id }), signal: controller.signal,
      });
      if (!res.ok) return;
      const { code } = await res.json();
      if (controller.signal.aborted) return;
      setRemoteCode(code);
      stopPoll = pollWhileVisible(async signal => {
        const response = await fetch(`/api/fjarr/${code}`, { cache: "no-store", signal });
        if (!response.ok) return;
        const r = await response.json();
        if (signal.aborted || !(r.seq > seq)) return;
        seq = r.seq;
        if (r.cmd) {
          const [command, arg] = String(r.cmd).split(":");
          cmds.current[command]?.(arg);
        }
      }, 600);
    })().catch(() => {});
    return () => { controller.abort(); stopPoll?.(); };
  }, [present, initial.id]);
  // tell the phone what the screen shows
  useEffect(() => {
    if (!present || !remoteCode) return;
    const state: ScreenState = {
      name, k: screenStep, n: steps.length, text: shownStep.text, playing,
      line: variants.length ? lineName(data, line) : "",
      choice: choice ? choice.options.map(o => ({ id: o.line ?? "main", label: o.badge ? (NAMES[o.badge] ?? o.badge) : o.name, badge: o.badge })) : null,
    };
    const t = setTimeout(() => {
      fetch(`/api/fjarr/${remoteCode}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ state }) }).catch(() => {});
    }, 150);
    return () => clearTimeout(t);
  }, [present, remoteCode, name, screenStep, steps.length, shownStep.text, playing, choice, line, variants.length, data]);

  /* ---------- render ---------- */
  const lbl = portrait ? "rotate(90)" : undefined;
  const holder = shownStep.ball.holder ? pieceById[shownStep.ball.holder] : null;
  const saveText = { saved: "Sparat", saving: "Sparar…", dirty: "Ändrat", error: "Kunde inte spara", conflict: "Inte sparat" }[save];
  const hideArrows = quizAsking; // the arrows would give the answer away
  const trails = useMemo(() => {
    if (hideArrows) return null;
    return shownStep.arrows.map(a => {
      if (a.piece && !showThem && pieceById[a.piece]?.side === "them") return null;
      const pts = arrowCurve(a, shownStep, shownNext);
      const kind = arrowKind(a, shownStep);
      const d = pathD(pts);
      const mine = !roleId || a.piece === roleId || (a.kind === "pass" && (shownStep.ball.holder === roleId || shownNext?.ball.holder === roleId));
      return <path key={a.id} d={d} className={"arrow arrow-" + kind + (a.lob ? " lob" : "") + (mine ? "" : " other")} markerEnd={`url(#ah-${kind})`} />;
    });
  }, [hideArrows, shownStep, shownNext, showThem, pieceById, roleId]);

  let hint: React.ReactNode = present
    ? "Styr med → / mellanslag, ← tillbaka, A spelar allt, F helskärm. Eller med mobilen."
    : mode === "play"
    ? "Tryck på en spelare för att se hans synfält. Dubbeltryck eller Se i 3D för att stå i hans skor."
    : TOOLS.find(t => t.id === tool)!.hint;
  if (mode === "edit" && line && kk < own) hint = "Steg före förgreningen är gemensamma: ändringar här gäller alla spår.";
  if (mode === "play" && space && !anim) hint = <>Ytor: <b className="lg-us">blått hinner vi först till ({ourShare} %)</b>, grått hinner motståndarna först till.</>;
  if (mode === "play" && lanes && !anim) {
    hint = step.ball.holder
      ? <>Passningsvägar: <b className="lg-open">{laneCount("open")} öppna</b> · <b className="lg-risky">{laneCount("risky")} riskabla</b> · <b className="lg-closed">{laneCount("closed")} stängda</b></>
      : "Ingen har bollen i det här steget.";
  }

  return (
    <main className={"wrap editor" + (present ? " present" : "")}>
      {save === "conflict" && (
        <div className="update conflict" role="alert">
          <span>Spelet har sparats från en annan enhet. Dina senaste ändringar är inte sparade.</span>
          <button type="button" className="update-go" onClick={() => { void saveNow(true); }}>Spara min version</button>
          <button type="button" className="update-alt" onClick={() => { acked.current = shown.current; location.reload(); }}>Hämta den andra</button>
        </div>
      )}
      <header className="top">
        <div className="title">
          {present ? <Link className="back" href={`/spel/${initial.id}`} onClick={leave}>← Avsluta presentation</Link>
            : shared ? <span className="kicker">{roleId ? `Din roll: ${NAMES[role!] ?? role}` : "Delat spel"}</span>
            : <Link className="back" href="/" onClick={leave}>← Mina spel</Link>}
          <input className="name" value={name} onChange={e => setName(e.target.value)} aria-label="Spelets namn" maxLength={80} readOnly={readOnly || mode === "play"} />
        </div>
        {present && (
          <div className="present-bar">
            <span className="present-code">
              {remoteCode ? <>Mobil: öppna {typeof window !== "undefined" ? location.host : ""}/fjarr · kod <b>{remoteCode}</b></> : "Ansluter fjärrkontroll…"}
            </span>
            <button className="btn ghost" type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>Helskärm</button>
          </div>
        )}
        {!readOnly && (
          <div className="bar">
            {!phone && (
              <div className="modes" role="group" aria-label="Läge">
                <button type="button" aria-pressed={mode === "play"} onClick={() => switchMode("play")}>Spela</button>
                <button type="button" aria-pressed={mode === "edit"} onClick={() => switchMode("edit")}>Redigera</button>
              </div>
            )}
            <button className="btn ghost" type="button" onClick={openShare} disabled={share.busy} aria-expanded={share.open}>Dela</button>
            {mode === "edit" && <>
              <span className={"save " + save} role="status">{saveText}</span>
              <button className="btn ghost" type="button" onClick={undo} disabled={!past.length || playing}>Ångra</button>
            </>}
          </div>
        )}
        {share.open && (
          <div className="share" role="dialog" aria-label="Dela spelet">
            {share.token ? <>
              <p>Alla med länken kan titta på spelet, köra quiz och se 3D. De kan inte ändra något.</p>
              <div className="share-row">
                <input readOnly value={shareUrl} onFocus={e => e.currentTarget.select()} aria-label="Delningslänk" />
                <button className="btn" type="button" onClick={copyShare}>{share.copied ? "Kopierad" : "Kopiera"}</button>
              </div>
              <details className="adv">
                <summary>Länk för en spelare (Min uppgift)</summary>
                <p>Spelaren ser sin egen roll markerad, sitt synfält och sin uppgift i varje steg.</p>
                <div className="role-links">
                  {data.pieces.filter(p => p.side === "us" && p.label).map(p => (
                    <button key={p.id} type="button" className="tg" data-role={p.label} onClick={copyRoleLink}>
                      {share.copiedRole === p.label ? "Kopierad" : p.label}
                    </button>
                  ))}
                </div>
              </details>
              <button className="tg" type="button" onClick={stopSharing} disabled={share.busy}>Sluta dela (länken slutar fungera)</button>
            </> : <p>Kunde inte skapa en länk. Försök igen.</p>}
          </div>
        )}
      </header>

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
            <Rink portrait={portrait} zone={zoneOf(data)} />

            {mode === "play" && !quiz && viewer && frame.pos[viewer] && (() => {
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

            {spaceImg && (
              <image href={spaceImg.href} x={0} y={0} width={spaceImg.w} height={spaceImg.h} preserveAspectRatio="none" className="space-map" clipPath="url(#rink-clip)" />
            )}

            {laneList.length > 0 && (
              <g className="lanes">
                {laneList.map(l => {
                  const b = ballPoint(step.ball, step.pos);
                  return <line key={l.id} x1={b[0]} y1={b[1]} x2={l.to[0]} y2={l.to[1]} className={"lane-" + l.status} />;
                })}
              </g>
            )}

            {!hideArrows && (
              <g className={anim ? "trails playing" : "trails"}>
                {trails}
                {draft?.kind === "stroke" && draft.pts.length > 1 && (() => {
                  // show the raw finger trace faintly and what it snaps to
                  const way = draft.arrow === "pass" ? [draft.pts[0], draft.pts[draft.pts.length - 1]] : fitStroke(draft.pts);
                  const snapped = draft.lob ? lobArc(way[0], way[1]) : spline(way);
                  return (
                    <>
                      <path d={pathD(draft.pts)} className="arrow trace" />
                      <path d={pathD(snapped)} className={"arrow draft arrow-" + draft.arrow + (draft.lob ? " lob" : "")} markerEnd={`url(#ah-${draft.arrow})`} />
                    </>
                  );
                })()}
              </g>
            )}

            <g className="players">
              {visible.map(pc => {
                const p = frame.pos[pc.id];
                if (!p) return null;
                const key = shownStep.ball.holder === pc.id;
                const fb = quiz?.feedback;
                const mark = fb ? (fb.right.includes(pc.id) ? " quiz-right" : fb.tapped === pc.id ? " quiz-wrong" : "") : "";
                return (
                  <g key={pc.id} transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`}>
                    <path className={"nose nose-" + pc.side} d="M1.15 -0.75 L2.05 0 L1.15 0.75 Z" transform={`rotate(${p.dir.toFixed(1)})`} />
                    <circle className={(pc.side === "us" ? "p-us" : "p-them") + (key ? " key" : "") + (mode === "play" && !quiz && viewer === pc.id ? " viewer" : "") + (roleId === pc.id ? " role" : "") + (mode === "edit" && sel === pc.id ? " selected" : "") + mark} r={pc.side === "us" ? 1.4 : 1.2} />
                    {pc.label && <text className="p-lbl" y={0.05} transform={lbl} style={pc.label.length > 1 ? { fontSize: "1px" } : undefined}>{pc.label}</text>}
                  </g>
                );
              })}
            </g>
            {!!frame.lift && <circle className="ball-shadow" cx={frame.ball[0]} cy={frame.ball[1]} r={0.5} />}
            <circle className="ball" cx={frame.ball[0]} cy={frame.ball[1] - (frame.arc ?? 0)} r={0.6 * (1 + 0.8 * (frame.lift ?? 0))} />
            {ghostBall && !hideArrows && <circle className="ball ghost" cx={ghostBall[0]} cy={ghostBall[1]} r={0.6} />}
            {!hideArrows && handles.map((h, i) => <circle key={i} className="bend" cx={h[0]} cy={h[1]} r={0.7} />)}
          </g>
        </svg>
      </figure>

      <aside className="side" aria-label="Kontroller">
        <section className="sec">
          <h2 className="sec-h">Uppspelning</h2>
          <div className="bar play-bar">
            <button className="btn ghost" type="button" onClick={() => { stop(); setK(Math.max(0, kk - 1)); }} disabled={(kk === 0 && !playing) || !!quiz} aria-label="Föregående steg">←</button>
            <button className="btn" type="button" id="playstep" onClick={() => (playing ? stop() : play(kk, false))} disabled={(!playing && !next && choicesAt(data, line, kk).length < 2) || !!quiz}>
              {playing ? "Paus" : "Spela steg"}
            </button>
            <button className="btn ghost" type="button" onClick={() => { stop(); setK(Math.min(steps.length - 1, kk + 1)); }} disabled={(!next && !playing) || !!quiz} aria-label="Nästa steg">→</button>
            <button className="btn ghost" type="button" onClick={() => { setLine(null); play(0, true, { line: null }); }} disabled={playing || !!quiz || data.steps.length < 2}>Spela allt</button>
          </div>
          {quiz && (
            <div className={"quiz" + (quiz.feedback ? (quiz.feedback.ok ? " ok" : " wrong") : "")} role="status" aria-live="polite">
              {quiz.done ? <>
                <b>Klart! {quiz.score} av {quiz.asked} rätt.</b>
                <button className="btn" type="button" onClick={startQuiz}>Gör om</button>
                <button className="btn ghost" type="button" onClick={endQuiz}>Avsluta</button>
              </> : quiz.feedback ? (
                <b>{quiz.feedback.ok ? "Rätt!" : `Fel. Rätt svar: ${quiz.feedback.right.map(labelOf).join(" eller ")}`}</b>
              ) : quiz.q ? (
                <span><b>Fråga {quiz.asked + 1}:</b> {nameOf(quiz.q.passer)} har bollen. Vem ska bollen till? Tryck på spelaren.</span>
              ) : <span>Spelar…</span>}
              {!quiz.done && <><span className="quiz-score">{quiz.score}/{quiz.asked}</span>
                <button className="btn ghost" type="button" onClick={endQuiz}>Avsluta</button></>}
            </div>
          )}
          {mode === "play" && !quiz && hint && <p className="hint">{hint}</p>}
        </section>

        {mode === "edit" && (
          <section className="sec">
            <h2 className="sec-h">Verktyg</h2>
            <nav className="tools" aria-label="Verktyg">
              {TOOLS.map(t => (
                <button key={t.id} type="button" aria-pressed={tool === t.id} className={"tool tool-" + t.id} title={t.hint} onClick={() => { setTool(t.id); setNotice(null); }} disabled={playing}>
                  {t.label}
                </button>
              ))}
            </nav>
            {notice && <p className="hint notice" role="status">{notice}</p>}
          </section>
        )}

        <section className="sec">
          <h2 className="sec-h">Steg {(anim ? anim.from : kk) + 1} av {steps.length}</h2>
          {mode === "play" ? (
            <p className="step-text">{hideArrows ? "" : shownStep.text}</p>
          ) : <input
            className="step-text"
            placeholder="Beskriv vad som händer i steget"
            value={shownStep.text}
            onFocus={snapshot}
            onChange={e => setSteps(s => s.map((x, i) => (i === kk ? { ...x, text: e.target.value.slice(0, 140) } : x)))}
            disabled={playing}
            aria-label="Beskrivning av steget"
          />}
          {mode === "play" && !quiz && viewer && pieceById[viewer]?.side === "us" && (() => {
            const t = taskFor(viewer, shownStep, shownNext, data.pieces);
            return (
              <p className={"task" + (roleId === viewer ? " mine" : "")}>
                <b>{roleId === viewer ? "Din uppgift" : `Uppgift för ${labelOf(viewer)}`}:</b> {t.text}
              </p>
            );
          })()}
          {mode === "edit" && sel && pieceById[sel]?.side === "us" && (
            <label className="task-edit">
              <span>Uppgift för {labelOf(sel)}:</span>
              <input
                value={step.notes?.[sel] ?? ""}
                placeholder={taskFor(sel, { ...step, notes: {} }, next, data.pieces).text}
                onFocus={snapshot}
                onChange={e => setNote(sel, e.target.value)}
                disabled={playing}
              />
            </label>
          )}
          {mode === "edit" && (
            <div className="bar small">
              <button className="tg" type="button" onClick={addStep} disabled={playing || (line !== null && kk < own)}>+ Steg</button>
              <button className="tg" type="button" onClick={removeStep} disabled={playing || steps.length < 2 || kk !== steps.length - 1 || (line !== null && kk <= own)} title="Bara det sista steget kan tas bort, eftersom varje steg bygger på det före.">Ta bort sista steget</button>
            </div>
          )}
          {holder && !hideArrows && <span className="holder">Bollen: {holder.label ? NAMES[holder.label] ?? holder.label : "motståndare"}</span>}
        </section>

        {mode === "play" && (
          <section className="sec">
            <h2 className="sec-h">Analys</h2>
            <div className="bar small">
              <button className="tg" type="button" aria-pressed={lanes} onClick={() => setLanes(v => !v)}>Passningsvägar</button>
              <button className="tg" type="button" aria-pressed={space} onClick={() => setSpace(v => !v)}>Ytor</button>
              {!quiz && <button className="tg" type="button" onClick={startQuiz} disabled={data.steps.length < 2}>Quiz</button>}
              {!quiz && viewer && pieceById[viewer] && <button className="btn" type="button" onClick={open3d}>Se i 3D</button>}
            </div>
          </section>
        )}

        <section className="sec more-sec">
          <button className="tg more-btn" type="button" aria-expanded={more} onClick={() => setMore(v => !v)}>Fler inställningar {more ? "▴" : "▾"}</button>
          {more && (
            <div className="more" role="dialog" aria-label="Fler inställningar">
              <div className="more-head">
                <span>Fler inställningar</span>
                <button type="button" className="more-x" aria-label="Stäng" onClick={() => setMore(false)}>✕</button>
              </div>
              <div className="more-row">
                <span className="more-lbl">Tempo</span>
                <div className="seg-mini" role="group" aria-label="Uppspelningstempo">
                  {[0.5, 0.75, 1, 1.5, 2].map(v => (
                    <button key={v} type="button" aria-pressed={speed === v} data-speed={v} onClick={onSpeed}>{String(v).replace(".", ",")}×</button>
                  ))}
                </div>
              </div>
              {mode === "play" && !present && (
                <div className="more-row">
                  <button className="btn" type="button" onClick={() => { stop(); setVideo(true); setMore(false); }}>Exportera video</button>
                  <span className="more-note">Spelet som video att skicka till laget{variants.length ? ` (spåret ${lineName(data, line)})` : ""}.</span>
                </div>
              )}
              {!readOnly && mode === "play" && (
                <div className="more-row">
                  <Link className="btn" href={`/presentera/${initial.id}`} onClick={leave}>Presentera på tv</Link>
                  <span className="more-note">Helskärm för tv/projektor, styrs med tangentbord, klickare eller mobilen.</span>
                </div>
              )}
              {mode === "edit" && (
                <div className="more-row">
                  <span className="more-lbl">Växlingszon</span>
                  <input type="range" min={ZONE_MIN} max={ZONE_MAX} step={0.5} value={zoneOf(data)} disabled={playing}
                    onPointerDown={snapshot} onKeyDown={snapshot} onChange={e => setData(d => ({ ...d, zone: Number(e.target.value) }))}
                    aria-label="Växlingszonens bredd från mittlinjen" />
                  <span className="more-note">±{String(zoneOf(data)).replace(".", ",")} m från mittlinjen</span>
                </div>
              )}
              <div className="more-row">
                <button className="tg" type="button" aria-pressed={showThem} onClick={() => setShowThem(v => !v)}>Visa motståndare</button>
                {mode === "edit" && <button className="tg" type="button" onClick={addOpponent} disabled={playing}>+ Motståndare</button>}
              </div>
              {mode === "edit" && <>
                <div className="more-row">
                  <span className="more-lbl">Övriga spelare</span>
                  <button className="tg" type="button" aria-pressed={autoOpts.us} onClick={() => setAutoOpts(o => ({ ...o, us: !o.us }))}>Egna</button>
                  <button className="tg" type="button" aria-pressed={autoOpts.them} onClick={() => setAutoOpts(o => ({ ...o, them: !o.them }))}>Motståndare</button>
                  <button className="btn" type="button" onClick={runAuto} disabled={playing || steps.length < 2 || (!autoOpts.us && !autoOpts.them)}>Placera övriga automatiskt</button>
                </div>
                <p className="more-note">Spelare utan egna pilar följer bollen i alla steg. Går att ångra och justera för hand.</p>
              </>}
            </div>
          )}
        </section>
      </aside>

      <nav className="steps-bar" aria-label="Steg">
        <span className="steps-lbl">Steg</span>
        <div className="dots">
          {steps.map((s, i) => {
            const pass = s.arrows.find(a => a.kind === "pass");
            return (
              <Fragment key={s.id}>
                <button type="button" className={i === (anim ? anim.from : kk) ? "cur" : i < kk ? "done" : ""} onClick={() => { stop(); setK(i); }} aria-label={`Steg ${i + 1}${pass ? `, sedan ${pass.lob ? "lyra" : "passning"}` : ""}`} aria-current={i === kk ? "step" : undefined} disabled={!!quiz}>
                  {i + 1}
                </button>
                {/* the pass is an in-between step: a small pink ball between the steps (a marker only;
                    the step's own button says it) */}
                {pass && <span className={"pass-dot" + (pass.lob ? " lob" : "")} aria-hidden="true" title={pass.lob ? "Lyra" : "Passning"} />}
              </Fragment>
            );
          })}
        </div>
      </nav>

      {choice && (
        <div className="pop" role="dialog" aria-modal="true" aria-labelledby="pop-h">
          <div className="pop-card">
            <p className="pop-k">{choice.sub}</p>
            <h2 id="pop-h">Vem får bollen?</h2>
            <div className="pop-opts">
              {choice.options.map(o => (
                <button key={o.line ?? "main"} type="button" onClick={() => choice.pick(o.line)} autoFocus={o === choice.options[0]}>
                  {o.badge && <span className="badge">{o.badge}</span>}
                  {o.badge ? (NAMES[o.badge] ?? o.badge) : o.name}
                  {o.badge && <span className="pop-line">{o.name}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {video && <VideoExport name={name} pieces={data.pieces} steps={steps} zone={zoneOf(data)} showThem={showThem} onClose={() => setVideo(false)} />}

      {show3d && viewer && pieceById[viewer] && (
        <View3D
          pieces={data.pieces}
          step={step}
          viewer={viewer}
          k={kk}
          count={steps.length}
          steps={steps}
          speed={speed}
          onStep={i => setK(clamp(i, 0, steps.length - 1))}
          onViewer={setViewer}
          onClose={() => setShow3d(false)}
        />
      )}
    </main>
  );
}
