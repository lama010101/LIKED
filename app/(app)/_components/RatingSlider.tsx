"use client";

import { useState } from "react";
import { toast } from "@/lib/store/toastStore";

/** 0–100 rating slider (Q5) — used for both cards and folders. */
export default function RatingSlider({
  initial, onRate, label,
}: {
  initial: number | null;
  onRate: (score: number) => Promise<void>;
  label: string;
}) {
  const [val, setVal] = useState<number>(initial ?? 50);
  const [dirty, setDirty] = useState(false);

  return (
    <div className="rating">
      <label className="muted">{label}</label>
      <input
        type="range"
        min={0}
        max={100}
        value={val}
        onChange={(e) => { setVal(Number(e.target.value)); setDirty(true); }}
        onMouseUp={async () => { if (dirty) await onRate(val).catch((e) => toast.error(e.message)); }}
        onTouchEnd={async () => { if (dirty) await onRate(val).catch((e) => toast.error(e.message)); }}
        aria-label={label}
      />
      <span className="rating-val">{val}</span>
    </div>
  );
}
