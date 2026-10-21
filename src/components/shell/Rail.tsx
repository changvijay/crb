"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthMenu } from "@/components/site/AuthMenu";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { IconMore, IconSearch } from "@/components/ui/icons";
import { CommandPalette } from "./CommandPalette";
import { isActive, NAV } from "./nav";

export function Rail() {
  const pathname = usePathname();
  const [palette, setPalette] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((o) => !o);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const primary = NAV.slice(0, 4);
  const overflow = NAV.slice(4);

  return (
    <>
      {/* ── Desktop rail ───────────────────────────────────────────── */}
      <aside className="group/rail fixed inset-y-0 left-0 z-50 hidden w-[var(--rail)] flex-col overflow-hidden border-r border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] backdrop-blur-xl transition-[width] duration-300 hover:w-[236px] focus-within:w-[236px] lg:flex" aria-label="Primary">
        <Link href="/" aria-label="Chang Research Base home" className="flex h-[68px] shrink-0 items-center gap-3 px-[18px]">
          <Image src="/logo.png" alt="" width={40} height={40} priority className="h-10 w-10 shrink-0 rounded-xl object-cover" />
          <span className="display whitespace-nowrap text-[17px] opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">
            Chang <span className="grad-text">Research</span>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1 px-3 pt-2" aria-label="Main navigation">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(href, pathname);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} title={label} className={`relative flex h-11 items-center gap-4 rounded-xl px-[14px] text-[13.5px] font-medium transition ${active ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"}`}>
                {active && <span className="absolute -left-3 top-2.5 h-6 w-[3px] rounded-r-full bg-[var(--accent)]" />}
                <Icon className="shrink-0" />
                <span className="whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-2 p-3">
          <button onClick={() => setPalette(true)} className="flex h-11 items-center gap-4 rounded-xl border border-[var(--line)] px-[14px] text-[13px] text-[var(--ink-3)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]" aria-label="Open command palette">
            <IconSearch className="shrink-0" />
            <span className="flex flex-1 items-center justify-between whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">Search <kbd className="num rounded border border-[var(--line)] px-1.5 text-[10px]">⌘K</kbd></span>
          </button>
          <div className="flex items-center gap-2 pl-[2px]">
            <AuthMenu placement="rail" />
            <div className="opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100"><ThemeToggle /></div>
          </div>
        </div>
      </aside>

      {/* ── Mobile / tablet top bar ────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] px-4 backdrop-blur-xl lg:hidden">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Chang Research Base home">
          <Image src="/logo.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg object-cover" />
          <span className="display text-[16px]">Chang <span className="grad-text">Research</span></span>
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={() => setPalette(true)} aria-label="Search" className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] text-[var(--ink-2)]"><IconSearch /></button>
          <ThemeToggle />
          <AuthMenu placement="top" />
        </div>
      </header>

      {/* ── Mobile bottom tab bar ──────────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Primary">
        {primary.map(({ href, short, Icon }) => {
          const active = isActive(href, pathname);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium ${active ? "text-[var(--accent)]" : "text-[var(--ink-3)]"}`}>
              <Icon width={22} height={22} />
              {short}
            </Link>
          );
        })}
        <button onClick={() => setMore((o) => !o)} aria-expanded={more} className={`flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium ${more || overflow.some((n) => isActive(n.href, pathname)) ? "text-[var(--accent)]" : "text-[var(--ink-3)]"}`}>
          <IconMore width={22} height={22} />
          More
        </button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-[55] lg:hidden" onClick={() => setMore(false)}>
          <div className="card rise absolute inset-x-3 bottom-[72px] !p-2" onClick={(e) => e.stopPropagation()}>
            {overflow.map(({ href, label, Icon }) => (
              <Link key={href} href={href} onClick={() => setMore(false)} className="flex items-center gap-4 rounded-xl px-4 py-3.5 text-[15px] hover:bg-[var(--surface-2)]"><Icon />{label}</Link>
            ))}
          </div>
        </div>
      )}

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </>
  );
}
