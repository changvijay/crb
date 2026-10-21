/** Tiny dependency-free area sparkline. */
export function Spark({ values, up, height = 56, label }: { values: number[]; up: boolean; height?: number; label: string }) {
  const v = values.filter((n) => typeof n === "number" && !Number.isNaN(n));
  if (v.length < 2) return <div style={{ height }} className="muted grid place-items-center text-xs">No intraday data</div>;
  const w = 240;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((n, i) => [(i / (v.length - 1)) * w, height - 4 - ((n - min) / span) * (height - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const id = `sp${label.replace(/\W/g, "")}`;
  const color = up ? "var(--up)" : "var(--down)";
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${label} intraday trend`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
