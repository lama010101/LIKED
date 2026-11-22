"use client";

import { useEffect } from "react";

// Scroll reveal: elements marked data-reveal are fully visible by default
// (no JS = no hidden content). On mount, only those currently below the
// fold are marked hidden, then shown once when they enter the viewport.
// Skipped entirely under prefers-reduced-motion. CSS animates transform and
// opacity only.
export default function RevealObserver() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.revealState = "shown";
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    for (const el of els) {
      if (el.getBoundingClientRect().top > window.innerHeight * 0.92) {
        el.dataset.revealState = "hidden";
        io.observe(el);
      }
    }
    return () => io.disconnect();
  }, []);
  return null;
}
