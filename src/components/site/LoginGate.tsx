"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./AuthProvider";

// Pages that prompt visitors to sign in. The page HTML stays fully rendered for crawlers;
// the prompt is injected client-side only (same behaviour as the previous auth widget).
const GATED = ["/recommendations", "/news", "/nse-data", "/crypto", "/learning", "/us-market"];

export function LoginGate() {
  const me = useAuth();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);

  const gated = GATED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!gated || dismissed || !me || me.isAuthenticated) return null;

  return (
    <aside role="complementary" aria-label="Sign in prompt" className="card rise fixed bottom-5 right-5 z-50 w-[min(340px,calc(100vw-40px))] !p-5">
      <button onClick={() => setDismissed(true)} aria-label="Dismiss sign-in prompt" className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full text-[var(--ink-3)] hover:bg-[var(--surface-2)]">
        ✕
      </button>
      <p className="eyebrow">Chang Research Base</p>
      <p className="display mt-2 text-2xl">Please sign in</p>
      <p className="muted mt-1.5 text-sm">Sign in to get notifications. It&apos;s free — takes just 30 seconds.</p>
      <a href={`/login?returnTo=${encodeURIComponent(pathname)}`} className="btn btn-primary mt-4 w-full justify-center">
        Sign in →
      </a>
    </aside>
  );
}
