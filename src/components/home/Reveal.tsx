"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Fades/slides its children in the first time they scroll into view. */
export function Reveal({ children, delay = 0, className = "", ...rest }: { children: ReactNode; delay?: number; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const t = setTimeout(() => setSeen(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-seen={seen} className={`reveal ${className}`} style={{ "--d": `${delay}ms` } as CSSProperties} {...rest}>
      {children}
    </div>
  );
}
