"use client";

import { useEffect, useState } from "react";
import { getData } from "@/lib/api";
import { fmtNum } from "@/lib/format";

type Quote = { price: number; previousClose?: number };

export function LiveTicker() {
  const [rows, setRows] = useState<[string, Quote][] | null>(null);

  useEffect(() => {
    let alive = true;
    getData<{ success: boolean; data?: Record<string, Quote> }>("liveMarkets")
      .then((j) => alive && j.success && j.data && setRows(Object.entries(j.data)))
      .catch(() => {}); // non-critical
    return () => {
      alive = false;
    };
  }, []);

  if (!rows?.length) return null;
  return (
    <div aria-label="Live market prices" className="border-y border-[var(--line)] bg-[var(--surface)]">
      <div className="container-x flex gap-7 overflow-x-auto py-3 text-[13px] [scrollbar-width:none]">
        {rows.map(([name, d]) => {
          const chg = d.previousClose ? ((d.price - d.previousClose) / d.previousClose) * 100 : null;
          return (
            <div key={name} className="flex shrink-0 items-baseline gap-2">
              <span className="text-[var(--ink-3)]">{name}</span>
              <span className="num font-medium">{fmtNum(d.price)}</span>
              {chg !== null && (
                <span className={`num text-xs font-semibold ${chg >= 0 ? "up" : "down"}`}>
                  {chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
