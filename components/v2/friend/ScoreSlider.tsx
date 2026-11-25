"use client";

// Score control (PRD §5.3, §13 item 5; task P0-14).
// Untouched = null, explicit 0 = 0, Clear = null. Steps of 5, word bands,
// and an aria-valuetext that reads the number and the band word.

import { useId } from "react";
import { useTranslations } from "next-intl";

export type BandKey = "skip" | "weak" | "mixed" | "good" | "great" | "unmissable";

export function bandKey(value: number): BandKey {
  if (value <= 19) return "skip";
  if (value <= 39) return "weak";
  if (value <= 59) return "mixed";
  if (value <= 74) return "good";
  if (value <= 89) return "great";
  return "unmissable";
}

interface ScoreSliderProps {
  value: number | null;
  label: string;
  onChange: (value: number | null) => void;
}

export default function ScoreSlider({ value, label, onChange }: ScoreSliderProps) {
  const t = useTranslations("ask");
  const id = useId();
  const numeric = value ?? 0;
  const band = t(`band.${bandKey(numeric)}`);
  const valueText = value === null ? t("scoreUntouched") : t("scoreValue", { value: numeric, band });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span aria-hidden="true" className="text-sm text-[var(--v2-text-muted)]">
          {value === null ? t("scoreUntouched") : `${numeric}%`}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={numeric}
        aria-valuetext={valueText}
        aria-valuemin={0}
        aria-valuemax={100}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer accent-[var(--v2-accent)]"
      />
      <div className="flex justify-between text-xs text-[var(--v2-text-muted)]">
        <span aria-hidden="true">{0}</span>
        <span aria-hidden="true">{50}</span>
        <span aria-hidden="true">{100}</span>
      </div>
      {value !== null ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="self-start rounded-full border border-[var(--v2-border)] px-3 py-1 text-xs"
        >
          {t("scoreClear")}
        </button>
      ) : null}
    </div>
  );
}
