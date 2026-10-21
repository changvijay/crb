"use client";

import type { Chart, ChartConfiguration } from "chart.js";
import { useEffect } from "react";

/**
 * The Technical Analysis guide's illustrative charts, ported 1:1 from the original page.
 * They are teaching illustrations: every series is synthetic by design (random walks), not market data.
 * Data is generated once per page view; theme changes only re-colour the charts.
 */
// Seeded PRNG (mulberry32): fresh random series per page view, identical across theme re-builds.
let state = 1;
const rnd = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const priceData = (start: number, days: number, vol: number, bias: number) => {
  const p = [start];
  for (let i = 1; i < days; i++) p.push(Math.round((p[i - 1] + (rnd() - 0.5 + bias) * vol) * 100) / 100);
  return p;
};
const dates = (n: number) => Array.from({ length: n }, (_, i) => { const d = new Date("2026-01-05"); d.setDate(d.getDate() + i); return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); });
const sma = (data: number[], period: number) => data.map((_, i) => (i < period - 1 ? null : Math.round(data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period)));

function build(theme: { grid: string; tick: string; text: string; accent: string }, seed: number): Record<string, ChartConfiguration> {
  state = seed;
  const DAYS = 60;
  const labels = dates(DAYS);
  const font = { family: "ui-monospace, SFMono-Regular, Menlo, monospace", size: 10 };
  const grid = theme.grid, tick = theme.tick, text = theme.text;
  const xAxis = { ticks: { font, color: tick, maxTicksLimit: 10 }, grid: { display: false } };
  const legend = { labels: { font, color: text } };
  const out: Record<string, ChartConfiguration> = {};

  // 1. Price action (simulated OHLC as range bars)
  {
    const open: number[] = [], high: number[] = [], low: number[] = [], close: number[] = [];
    let price = 22000;
    for (let i = 0; i < 30; i++) {
      const o = price, c = o + (rnd() - 0.45) * 200;
      high.push(Math.round(Math.max(o, c) + rnd() * 100)); low.push(Math.round(Math.min(o, c) - rnd() * 100));
      open.push(Math.round(o)); close.push(Math.round(c)); price = c;
    }
    out.priceActionChart = {
      type: "bar",
      data: { labels: dates(30), datasets: [{ label: "Candle Body (Open→Close)", data: close.map((c, i) => ({ x: i, y: [Math.min(open[i], c), Math.max(open[i], c)] })) as never, backgroundColor: close.map((c, i) => (c >= open[i] ? "rgba(22,163,74,0.7)" : "rgba(220,38,38,0.7)")), borderColor: close.map((c, i) => (c >= open[i] ? "#16a34a" : "#dc2626")), borderWidth: 1, barPercentage: 0.6 }] },
      options: { responsive: true, maintainAspectRatio: true, parsing: { xAxisKey: "x", yAxisKey: "y" }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `O: ${open[c.dataIndex]}  H: ${high[c.dataIndex]}  L: ${low[c.dataIndex]}  C: ${close[c.dataIndex]}` } } }, scales: { x: { ticks: { font, color: tick, maxRotation: 45 }, grid: { display: false } }, y: { ticks: { font, color: tick, callback: (v) => Number(v).toLocaleString() }, grid: { color: grid } } } },
    };
  }

  // 2. Trend
  out.trendChart = {
    type: "line",
    data: { labels, datasets: [
      { label: "Uptrend (Stock A)", data: priceData(100, DAYS, 3, 0.15), borderColor: "#16a34a", backgroundColor: "rgba(22,163,74,0.06)", fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2.5 },
      { label: "Downtrend (Stock B)", data: priceData(200, DAYS, 3, -0.15), borderColor: "#dc2626", backgroundColor: "rgba(220,38,38,0.06)", fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2.5 },
    ] },
    options: { responsive: true, plugins: { legend }, scales: { x: xAxis, y: { ticks: { font, color: tick }, grid: { color: grid } } } },
  };

  // 3. Support & resistance
  {
    const price: number[] = [];
    let p = 480;
    for (let i = 0; i < DAYS; i++) {
      if (p > 540) p -= rnd() * 12 + 2; else if (p < 450) p += rnd() * 12 + 2; else p += (rnd() - 0.5) * 16;
      price.push(Math.round(p * 100) / 100);
    }
    out.supportResistanceChart = {
      type: "line",
      data: { labels, datasets: [
        { label: "Price", data: price, borderColor: theme.accent, backgroundColor: "rgba(37,99,235,0.04)", fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
        { label: "Resistance (~₹540)", data: Array(DAYS).fill(540), borderColor: "#dc2626", borderDash: [8, 4], borderWidth: 2, pointRadius: 0, fill: false },
        { label: "Support (~₹450)", data: Array(DAYS).fill(450), borderColor: "#16a34a", borderDash: [8, 4], borderWidth: 2, pointRadius: 0, fill: false },
      ] },
      options: { responsive: true, plugins: { legend }, scales: { x: xAxis, y: { ticks: { font, color: tick, callback: (v) => "₹" + v }, grid: { color: grid }, min: 420, max: 570 } } },
    };
  }

  // 4. Volume
  {
    const prices = priceData(500, DAYS, 6, 0.08);
    const volume = prices.map((_, i) => { const base = 100000 + rnd() * 80000; return i > 0 && Math.abs(prices[i] - prices[i - 1]) > 8 ? Math.round(base * 2.5) : Math.round(base); });
    const vc = prices.map((p, i) => (i === 0 ? "rgba(37,99,235,0.3)" : p >= prices[i - 1] ? "rgba(22,163,74,0.4)" : "rgba(220,38,38,0.4)"));
    out.volumeChart = {
      type: "bar",
      data: { labels, datasets: [
        { type: "line", label: "Price (₹)", data: prices, borderColor: theme.accent, borderWidth: 2, pointRadius: 0, tension: 0.3, yAxisID: "yPrice", order: 1 },
        { type: "bar", label: "Volume", data: volume, backgroundColor: vc, yAxisID: "yVol", order: 2 },
      ] },
      options: { responsive: true, plugins: { legend }, scales: { x: xAxis, yPrice: { position: "left", ticks: { font, color: theme.accent, callback: (v) => "₹" + v }, grid: { color: grid } }, yVol: { position: "right", ticks: { font, color: tick, callback: (v) => (Number(v) / 1000).toFixed(0) + "K" }, grid: { display: false } } } },
    };
  }

  // 5. Moving averages
  {
    const N = 120;
    const prices = priceData(21500, N, 80, 0.06);
    out.maChart = {
      type: "line",
      data: { labels: dates(N), datasets: [
        { label: "Price", data: prices, borderColor: "#94a3b8", borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
        { label: "50-Day SMA", data: sma(prices, 15), borderColor: theme.accent, borderWidth: 2.5, pointRadius: 0, tension: 0.4 },
        { label: "200-Day SMA", data: sma(prices, 40), borderColor: "#d97706", borderWidth: 2.5, pointRadius: 0, tension: 0.4 },
      ] },
      options: { responsive: true, plugins: { legend }, scales: { x: xAxis, y: { ticks: { font, color: tick, callback: (v) => Number(v).toLocaleString() }, grid: { color: grid } } } },
    };
  }

  // 6. RSI
  {
    const rsi: number[] = [];
    let r = 50;
    for (let i = 0; i < DAYS; i++) { r += (rnd() - 0.5) * 12; r = Math.max(15, Math.min(88, r)); rsi.push(Math.round(r * 10) / 10); }
    out.rsiChart = {
      type: "line",
      data: { labels, datasets: [
        { label: "RSI (14)", data: rsi, borderColor: "#7c3aed", borderWidth: 2.5, pointRadius: 0, tension: 0.3, fill: false },
        { label: "Overbought (70)", data: Array(DAYS).fill(70), borderColor: "#dc2626", borderDash: [6, 3], borderWidth: 1.5, pointRadius: 0, fill: false },
        { label: "Oversold (30)", data: Array(DAYS).fill(30), borderColor: "#16a34a", borderDash: [6, 3], borderWidth: 1.5, pointRadius: 0, fill: false },
        { label: "", data: Array(DAYS).fill(50), borderColor: "#cbd5e1", borderDash: [3, 3], borderWidth: 1, pointRadius: 0, fill: false },
      ] },
      options: { responsive: true, plugins: { legend: { labels: { font, color: text, filter: (item) => item.text !== "" } } }, scales: { x: xAxis, y: { min: 0, max: 100, ticks: { font, color: tick, stepSize: 10 }, grid: { color: grid } } } },
    };
  }

  // 7. MACD
  {
    const macd: number[] = [], sig: number[] = [], hist: number[] = [];
    let m = 0, s = 0;
    for (let i = 0; i < DAYS; i++) { m += (rnd() - 0.48) * 8; m = Math.max(-60, Math.min(60, m)); s += (m - s) * 0.15; macd.push(Math.round(m * 10) / 10); sig.push(Math.round(s * 10) / 10); hist.push(Math.round((m - s) * 10) / 10); }
    out.macdChart = {
      type: "bar",
      data: { labels, datasets: [
        { type: "bar", label: "Histogram", data: hist, backgroundColor: hist.map((h) => (h >= 0 ? "rgba(22,163,74,0.5)" : "rgba(220,38,38,0.5)")), order: 2 },
        { type: "line", label: "MACD Line", data: macd, borderColor: theme.accent, borderWidth: 2, pointRadius: 0, tension: 0.3, order: 1 },
        { type: "line", label: "Signal Line", data: sig, borderColor: "#d97706", borderWidth: 2, pointRadius: 0, tension: 0.3, order: 1 },
      ] },
      options: { responsive: true, plugins: { legend }, scales: { x: xAxis, y: { ticks: { font, color: tick }, grid: { color: grid } } } },
    };
  }
  return out;
}

const themeColors = () => {
  const dark = document.documentElement.dataset.theme !== "light";
  return dark ? { grid: "rgba(138,152,180,0.16)", tick: "#8a94a8", text: "#a8b2c7", accent: "#60a5fa" } : { grid: "#e2e8f0", tick: "#94a3b8", text: "#475569", accent: "#2563eb" };
};

export function TaCharts() {
  useEffect(() => {
    let charts: Chart[] = [];
    let cancelled = false;
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const mount = async () => {
      const { default: C } = await import("chart.js/auto");
      if (cancelled) return;
      charts.forEach((c) => c.destroy());
      charts = [];
      for (const [id, conf] of Object.entries(build(themeColors(), seed))) {
        const el = document.getElementById(id) as HTMLCanvasElement | null;
        if (el) charts.push(new C(el, conf));
      }
    };
    mount();
    const mo = new MutationObserver(mount);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      cancelled = true;
      mo.disconnect();
      charts.forEach((c) => c.destroy());
    };
  }, []);
  return null;
}
