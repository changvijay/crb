"use client";

export function ToTop() {
  return (
    <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="chip hover:!border-[var(--accent)] hover:!text-[var(--accent)]" aria-label="Back to top">
      ↑ Back to top
    </button>
  );
}
