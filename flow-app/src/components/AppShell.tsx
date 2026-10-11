"use client";

import { useEffect } from "react";
import { initPersistence, useFlow } from "@/store";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import DesktopShell from "./DesktopShell";
import MobileShell from "./MobileShell";

export default function AppShell() {
  const isDesktop = useIsDesktop();

  // hydrate persisted state once; selection/ui state stays in the store
  // across the 1024px breakpoint since both shells share `useFlow`.
  useEffect(() => initPersistence(), []);

  // global keys: ESC closes sheets/inspector/selection; +/- zooms the grid.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing =
        t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
      if (e.key === "Escape") {
        const s = useFlow.getState();
        if (s.mobileSheet) s.setMobileSheet(null);
        else if (s.inspectorCardId) s.openInspector(null);
        else if (s.selectedIds.length) s.clearSelection();
        if (s.selectionMode) s.setSelectionMode(false);
        return;
      }
      if (typing) return;
      if (e.key === "+" || e.key === "=") useFlow.getState().zoomIn();
      if (e.key === "-" || e.key === "_") useFlow.getState().zoomOut();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return isDesktop ? <DesktopShell /> : <MobileShell />;
}
