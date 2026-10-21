"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { IconArrow, IconMoon, IconSearch } from "@/components/ui/icons";
import { useAuth } from "@/components/site/AuthProvider";
import { NAV } from "./nav";

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("crb-theme", next); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event("crb-theme"));
}
// /login and /logout are server route handlers (Auth0 redirects), so a full navigation is correct.
function signIn() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`);
}
function signOut() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/logout");
}

type Item = { id: string; label: string; hint: string; run: () => void };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const me = useAuth();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => router.push(href);
    const base: Item[] = NAV.map((n) => ({ id: n.href, label: n.label, hint: "Go to", run: go(n.href) }));
    base.push({ id: "theme", label: "Toggle light / dark theme", hint: "Action", run: toggleTheme });
    base.push(me?.isAuthenticated
      ? { id: "out", label: "Sign out", hint: "Account", run: signOut }
      : { id: "in", label: "Sign in", hint: "Account", run: signIn });
    return base;
  }, [router, me]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((i) => i.label.toLowerCase().includes(t)) : items;
  }, [items, q]);

  if (!open) return null;
  const choose = (i?: Item) => {
    if (!i) return;
    onClose();
    i.run();
  };
  const reset = () => { setQ(""); setSel(0); onClose(); };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-start bg-black/60 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && reset()}>
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="card rise mx-auto w-full max-w-xl !p-0 overflow-hidden"
        onKeyDown={(e) => {
          if (e.key === "Escape") reset();
          else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); choose(shown[sel]); setQ(""); setSel(0); }
        }}>
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4">
          <IconSearch className="shrink-0 text-[var(--ink-3)]" />
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder="Jump to a page or run an action…" aria-label="Command search" className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-[var(--ink-3)]" />
          <kbd className="num rounded-md border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--ink-3)]">ESC</kbd>
        </div>
        <ul role="listbox" className="max-h-[50vh] overflow-auto p-2">
          {shown.length === 0 && <li className="muted px-3 py-6 text-center text-sm">No results</li>}
          {shown.map((i, n) => (
            <li key={i.id} role="option" aria-selected={n === sel}>
              <button onMouseEnter={() => setSel(n)} onClick={() => { choose(i); setQ(""); setSel(0); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${n === sel ? "bg-[var(--accent-soft)] text-[var(--accent)]" : ""}`}>
                <span className="flex items-center gap-3">
                  {i.id === "theme" ? <IconMoon width={16} height={16} /> : <IconArrow width={16} height={16} />}
                  {i.label}
                </span>
                <span className="muted text-[11px] uppercase tracking-wider">{i.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
