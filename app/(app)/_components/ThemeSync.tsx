"use client";

import { useEffect } from "react";

/** Applies the persisted theme (liked.theme) to <html data-theme>. */
export default function ThemeSync() {
  useEffect(() => {
    const t = localStorage.getItem("liked.theme") === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
  }, []);
  return null;
}

export function setTheme(t: "light" | "dark") {
  localStorage.setItem("liked.theme", t);
  document.documentElement.setAttribute("data-theme", t);
}
