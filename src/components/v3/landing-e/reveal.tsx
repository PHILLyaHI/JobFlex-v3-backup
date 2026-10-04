"use client";

import { useEffect, useRef } from "react";

export function Reveal({
  children,
  delay = 0,
  className = "",
  shown = false,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  /** Already in its final state in the server's HTML (2026-10-04): for what
   *  is on the first screen. A reveal waits for this script to un-hide it,
   *  and on a phone that was seconds of an empty hero. */
  shown?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("lp-in");
          io.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      className={`lp-reveal${shown ? " lp-in" : ""} ${className}`}
      style={delay && !shown ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
