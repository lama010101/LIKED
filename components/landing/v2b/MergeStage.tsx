"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Wraps the centerpiece. The FINAL composition is the default (no JS, or
// prefers-reduced-motion: nothing is armed, so the static end state shows).
// Otherwise: arm (chips offset, card dim) -> play when scrolled into view.
// CSS only animates transform/opacity/stroke on the elements inside.
export default function MergeStage({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.6 && rect.bottom > 0) return; // already in view: keep final state
    el.dataset.merge = "armed";
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          requestAnimationFrame(() => { el.dataset.merge = "play"; });
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}
