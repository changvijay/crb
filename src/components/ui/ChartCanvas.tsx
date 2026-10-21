"use client";

import type { Chart, ChartConfiguration } from "chart.js";
import { useEffect, useRef } from "react";

/** Mounts a Chart.js chart (bundled locally, no CDN) and destroys it on change/unmount. */
export function ChartCanvas({ config, label, className = "h-[260px]" }: { config: ChartConfiguration; label: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let chart: Chart | undefined;
    let cancelled = false;
    import("chart.js/auto").then(({ default: C }) => {
      if (cancelled || !canvas.current) return;
      chart = new C(canvas.current, config);
    });
    return () => {
      cancelled = true;
      chart?.destroy();
    };
  }, [config]);

  return (
    <div className={`relative w-full ${className}`}>
      <canvas ref={canvas} role="img" aria-label={label} />
    </div>
  );
}

export const CHART = {
  grid: "rgba(138,132,116,0.18)",
  tick: "#8a8474",
  gold: "#a9834a",
  up: "#2f7d5b",
  down: "#b04a3f",
  blue: "#3d5a80",
  font: { size: 10, family: "ui-monospace, SFMono-Regular, Menlo, monospace" },
} as const;
