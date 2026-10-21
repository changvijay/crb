/** Semicircle gauge. `value` 0-100 positions the needle over three coloured zones. */
const pol = (cx: number, cy: number, r: number, deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)] as const;
const arc = (from: number, to: number, r = 44) => {
  const [x1, y1] = pol(60, 58, r, 180 - from * 1.8);
  const [x2, y2] = pol(60, 58, r, 180 - to * 1.8);
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
};

export function Gauge({ value, zones, label, display }: { value: number; zones: [number, string][]; label: string; display?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const [nx, ny] = pol(60, 58, 36, 180 - v * 1.8);
  return (
    <svg viewBox="0 0 120 70" role="img" aria-label={`${label}: ${display ?? Math.round(v)}`} className="w-full">
      {zones.map(([end, color], i) => (
        <path key={i} d={arc(i ? zones[i - 1][0] : 0, end)} fill="none" stroke={color} strokeOpacity="0.85" strokeWidth="8" strokeLinecap="round" />
      ))}
      <line x1="60" y1="58" x2={nx} y2={ny} stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="60" cy="58" r="4" fill="var(--ink)" />
      <text x="60" y="69" textAnchor="middle" fontSize="9" fontFamily="var(--f-mono)" fill="var(--ink)">{display ?? Math.round(v)}</text>
    </svg>
  );
}
