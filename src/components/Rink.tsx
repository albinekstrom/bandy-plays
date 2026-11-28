import { memo } from "react";
import { arcPath, isCircle, type Sport } from "@/lib/sports";

/* The sport's markings, in metres. Same drawing as the Uppspel page. `zone` is the
   substitution zone's half width, for sports that have one. */
export default memo(function Rink({ portrait, sport, zone }: { portrait: boolean; sport: Sport; zone: number | null }) {
  const L = sport.length, W = sport.width, MIDY = W / 2, g = sport.goal;
  const zx = 1.5, zy = zone === null ? 0 : MIDY - zone - 0.6;
  return (
    <g>
      <rect className="mk-goal" x={-g.depth} y={MIDY - g.width / 2} width={g.depth} height={g.width} />
      <rect className="mk-goal" x={L} y={MIDY - g.width / 2} width={g.depth} height={g.width} />
      <rect className="mk mk-ice" x={0} y={0} width={L} height={W} />
      {zone !== null && sport.zone && <>
        <rect className="zone" x={0} y={MIDY - zone} width={L} height={zone * 2} />
        <line className="lane-mid" x1={0} y1={MIDY} x2={L} y2={MIDY} />
        {[MIDY - zone, MIDY + zone].map(y => <line key={y} className="lane" x1={0} y1={y} x2={L} y2={y} />)}
        <text className="zone-t" x={zx} y={zy} transform={portrait ? `rotate(90 ${zx} ${zy})` : undefined}>{sport.zone.label(zone)}</text>
      </>}
      {sport.markings.map((m, i) =>
        m.kind === "line" ? <line key={i} className="mk" x1={m.from[0]} y1={m.from[1]} x2={m.to[0]} y2={m.to[1]} />
          : m.kind === "dot" ? <circle key={i} className="mk-fill" cx={m.at[0]} cy={m.at[1]} r={m.r} />
            : isCircle(m) ? <circle key={i} className="mk" cx={m.at[0]} cy={m.at[1]} r={m.r} />
              : <path key={i} className="mk" d={arcPath(m)} />)}
    </g>
  );
});
