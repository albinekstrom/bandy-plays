import { L, W, MIDY } from "@/lib/rink";

/* Rink markings, in metres. Same drawing as the Uppspel page. */
export default function Rink({ portrait }: { portrait: boolean }) {
  const arcs = [
    `M0 ${MIDY - 17} A17 17 0 0 1 0 ${MIDY + 17}`,
    `M${L} ${MIDY - 17} A17 17 0 0 0 ${L} ${MIDY + 17}`,
    `M0 ${MIDY - 5} A5 5 0 0 1 0 ${MIDY + 5}`,
    `M${L} ${MIDY - 5} A5 5 0 0 0 ${L} ${MIDY + 5}`,
    "M1 0 A1 1 0 0 1 0 1", `M${L - 1} 0 A1 1 0 0 0 ${L} 1`,
    `M0 ${W - 1} A1 1 0 0 1 1 ${W}`, `M${L} ${W - 1} A1 1 0 0 0 ${L - 1} ${W}`,
  ];
  const zx = 1.5, zy = MIDY - 10.6;
  return (
    <g>
      <rect className="mk-goal" x={-2} y={MIDY - 1.75} width={2} height={3.5} />
      <rect className="mk-goal" x={L} y={MIDY - 1.75} width={2} height={3.5} />
      <rect className="mk mk-ice" x={0} y={0} width={L} height={W} />
      <rect className="zone" x={0} y={MIDY - 10} width={L} height={20} />
      <line className="lane-mid" x1={0} y1={MIDY} x2={L} y2={MIDY} />
      {[MIDY - 10, MIDY + 10].map(y => <line key={y} className="lane" x1={0} y1={y} x2={L} y2={y} />)}
      <text className="zone-t" x={zx} y={zy} transform={portrait ? `rotate(90 ${zx} ${zy})` : undefined}>VÄXLINGSZON ±10 M</text>
      <line className="mk" x1={L / 2} y1={0} x2={L / 2} y2={W} />
      <circle className="mk" cx={L / 2} cy={MIDY} r={5} />
      <circle className="mk-fill" cx={L / 2} cy={MIDY} r={0.3} />
      {arcs.map(d => <path key={d} className="mk" d={d} />)}
      {[12, L - 12].map(x => <circle key={x} className="mk-fill" cx={x} cy={MIDY} r={0.3} />)}
    </g>
  );
}
