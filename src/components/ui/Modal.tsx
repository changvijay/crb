"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Portal to <body>: an ancestor with a transform/filter (e.g. scroll-reveal wrappers) would otherwise trap `fixed` positioning.
  const client = useSyncExternalStore(noop, () => true, () => false);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open || !client) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card rise flex max-h-[88vh] w-full flex-col !p-0 outline-none ${wide ? "max-w-5xl" : "max-w-xl"}`}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
          <h3 className="display text-2xl">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full border border-[var(--line)] hover:border-[var(--gold)] hover:text-[var(--gold)]">
            ✕
          </button>
        </div>
        <div className="overflow-auto p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
