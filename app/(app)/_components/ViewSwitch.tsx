"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export type ViewMode = "list" | "masonry" | "columns";

const KEY = "liked.view";
const MODES = ["list", "masonry", "columns"] as const;

/** Shared card-view mode — persisted in localStorage so the last
 *  selection applies on every page that renders cards. */
export function useCardView(): [ViewMode, (v: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>(() =>
    (typeof window !== "undefined" && (localStorage.getItem(KEY) as ViewMode)) || "list");
  const pick = (v: ViewMode) => {
    setView(v);
    localStorage.setItem(KEY, v);
  };
  return [view, pick];
}

/** Segmented List / Masonry / Columns control (same markup as feed). */
export default function ViewSwitch({ view, onPick }: { view: ViewMode; onPick: (v: ViewMode) => void }) {
  const t = useTranslations();
  return (
    <div className="seg view-seg" role="group" aria-label="view">
      {MODES.map((v) => (
        <button
          key={v}
          className={`seg-btn ${view === v ? "seg-on" : ""}`}
          onClick={() => onPick(v)}
        >
          {t(`feed.view${v[0].toUpperCase()}${v.slice(1)}` as "feed.viewList")}
        </button>
      ))}
    </div>
  );
}
