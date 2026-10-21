"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";

export function AuthMenu({ placement = "top" }: { placement?: "rail" | "top" }) {
  const me = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!me) return <div className="skeleton h-10 w-10 !rounded-xl" aria-hidden />;

  if (!me.isAuthenticated || !me.user) {
    return (
      <a href={`/login?returnTo=${encodeURIComponent(pathname || "/")}`} className="btn btn-primary !px-4 !py-2.5" title="Sign in">
        <span className={placement === "rail" ? "hidden" : ""}>Sign in</span>
        {placement === "rail" && <span aria-label="Sign in">→</span>}
      </a>
    );
  }

  const initial = (me.user.name || me.user.email || "U").charAt(0).toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {me.user.picture ? <img src={me.user.picture} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : initial}
      </button>
      {open && (
        <div role="menu" className={`card absolute z-[70] w-64 !p-4 ${placement === "rail" ? "bottom-0 left-12" : "right-0 top-12"}`}>
          <p className="truncate text-sm font-semibold">{me.user.name}</p>
          <p className="muted truncate text-xs">{me.user.email}</p>
          <div className="my-3 h-px bg-[var(--line)]" />
          <a href="/logout" role="menuitem" className="text-sm font-medium text-[var(--down)] hover:underline">
            Sign out
          </a>
        </div>
      )}
    </div>
  );
}
