"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Piece, Step } from "@/lib/types";
import { exportVideo, videoDuration, type VideoResult } from "@/lib/video";
import type { Sport } from "@/lib/sports";

type Format = "16:9" | "9:16";
const SPEEDS = [0.5, 1, 1.5, 2];

interface Props {
  name: string;
  pieces: Piece[];
  steps: Step[];
  sport: Sport;
  zone?: number;
  onClose: () => void;
  showThem?: boolean;
}

type State =
  | { phase: "idle" }
  | { phase: "recording"; progress: number }
  | { phase: "done"; file: File; url: string; ext: VideoResult["ext"] }
  | { phase: "error"; message: string };

const fileName = (name: string, ext: string) =>
  (name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").trim().slice(0, 80) || "bandyspel") + "." + ext;

/** Dialog: record the play's playback as a video, then download or share it. */
export default function VideoExport({ name, pieces, steps, sport, zone, onClose, showThem: themDefault = true }: Props) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [format, setFormat] = useState<Format>("16:9");
  const [speed, setSpeed] = useState(1);
  const [showText, setShowText] = useState(true);
  const [showThem, setShowThem] = useState(themDefault);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  const secs = useMemo(() => Math.round(videoDuration({ steps, speed })), [steps, speed]);
  const recording = state.phase === "recording";
  const canShare = state.phase === "done" && typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" && navigator.canShare({ files: [state.file] });

  const dropUrl = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };

  // stop recording and free the video when the dialog goes away
  useEffect(() => () => {
    abortRef.current?.abort();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  async function create() {
    const canvas = canvasRef.current;
    if (!canvas || recording) return;
    dropUrl();
    const ac = new AbortController();
    abortRef.current = ac;
    setState({ phase: "recording", progress: 0 });
    try {
      const { blob, ext } = await exportVideo({
        name, pieces, steps, sport, zone, format, speed, showText, showThem, canvas, signal: ac.signal,
        onProgress: progress => setState(s => (s.phase === "recording" ? { phase: "recording", progress } : s)),
      });
      if (ac.signal.aborted) return;
      const file = new File([blob], fileName(name, ext), { type: blob.type });
      const url = URL.createObjectURL(file);
      urlRef.current = url;
      setState({ phase: "done", file, url, ext });
    } catch (e) {
      if (ac.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
      setState({ phase: "error", message: e instanceof Error ? e.message : "Det gick inte att skapa videon." });
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ phase: "idle" });
  }

  function close() {
    abortRef.current?.abort();
    onClose();
  }

  async function share() {
    if (state.phase !== "done") return;
    try {
      await navigator.share({ files: [state.file], title: name || "Bandyspel" });
    } catch { /* closed the share sheet */ }
  }

  function reset() {
    dropUrl();
    setState({ phase: "idle" });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { abortRef.current?.abort(); onClose(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const pct = state.phase === "recording" ? Math.round(state.progress * 100) : 0;

  return (
    <div className="pop" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="pop-card vx" role="dialog" aria-modal="true" aria-labelledby="vx-title">
        <p className="pop-k">Video att skicka till laget</p>
        <h2 id="vx-title">Exportera video</h2>

        <div className={"vx-stage" + (format === "9:16" ? " tall" : "")} hidden={state.phase !== "recording" && state.phase !== "done"}>
          <canvas ref={canvasRef} className="vx-canvas" hidden={state.phase !== "recording"} />
          {state.phase === "done" && <video className="vx-video" src={state.url} controls playsInline muted />}
        </div>

        {state.phase === "idle" && (
          <>
            <p className="vx-note">Videon blir ca {secs} s lång. Den spelas in i realtid, så låt fliken vara öppen tills den är klar.</p>
            <button type="button" className="btn vx-big" onClick={create}>Skapa video</button>
          </>
        )}

        {state.phase === "recording" && (
          <>
            <div className="vx-bar" role="progressbar" aria-label="Skapar video" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <span style={{ width: pct + "%" }} />
            </div>
            <div className="vx-row">
              <span className="vx-pct">Spelar in… {pct} %</span>
              <button type="button" className="btn ghost" onClick={cancel}>Avbryt</button>
            </div>
          </>
        )}

        {state.phase === "done" && (
          <>
            <div className="vx-row">
              <a className="btn vx-link" href={state.url} download={state.file.name}>Ladda ner</a>
              {canShare && <button type="button" className="btn" onClick={share}>Dela</button>}
              <button type="button" className="btn ghost" onClick={reset}>Gör om</button>
            </div>
            <p className="vx-note">{state.file.name} · {(state.file.size / 1e6).toFixed(1)} MB</p>
          </>
        )}

        {state.phase === "error" && (
          <>
            <p className="vx-err" role="alert">{state.message}</p>
            <button type="button" className="btn ghost" onClick={reset}>Försök igen</button>
          </>
        )}

        {(state.phase === "idle" || state.phase === "error") && (
          <details className="vx-more">
            <summary>Fler inställningar</summary>
            <div className="vx-opts">
              <span className="vx-lbl">Format</span>
              <div className="vx-seg" role="group" aria-label="Format">
                {(["16:9", "9:16"] as const).map(f => (
                  <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}>
                    {f === "16:9" ? "Liggande 16:9" : "Stående 9:16"}
                  </button>
                ))}
              </div>
              <span className="vx-lbl">Hastighet</span>
              <div className="vx-seg" role="group" aria-label="Hastighet">
                {SPEEDS.map(s => (
                  <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                    {String(s).replace(".", ",")}×
                  </button>
                ))}
              </div>
              <span className="vx-lbl">Visa</span>
              <div className="bar small">
                <button type="button" className="tg" aria-pressed={showText} onClick={() => setShowText(v => !v)}>Stegtext</button>
                <button type="button" className="tg" aria-pressed={showThem} onClick={() => setShowThem(v => !v)}>Motståndare</button>
              </div>
            </div>
          </details>
        )}

        <button type="button" className="vx-close" onClick={close} aria-label="Stäng">✕</button>
      </div>
    </div>
  );
}
