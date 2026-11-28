"use client";

import { RING_CIRCUMFERENCE, RING_RADIUS, RING_VIEWBOX, ringDash } from "./inbox-utils";
import { UI } from "./ui-constants";

export type RingTone = "friends" | "tmdb";

const FILL_NONE = "none";
const TRACK_COLOUR = "var(--v2-border)";
const FRIENDS_COLOUR = "var(--v2-ring-friends)";
const TMDB_COLOUR = "var(--v2-ring-tmdb)";
const ROUND = "round";
const CENTRE = RING_VIEWBOX / 2;
const VIEWBOX = `0 0 ${RING_VIEWBOX} ${RING_VIEWBOX}`;

/** Percentage ring. Friends (accent) and TMDB (neutral) are separate tones;
 *  nothing here blends the two values (PRD §6.5). */
export default function ScoreRing({
  percent,
  label,
  tone,
  size = 44,
  strokeWidth = 4,
}: {
  percent: number | null;
  label: string;
  tone: RingTone;
  size?: number;
  strokeWidth?: number;
}) {
  const dash = ringDash(percent);
  const colour = tone === "tmdb" ? TMDB_COLOUR : FRIENDS_COLOUR;
  const dashArray = `${dash.dasharray} ${RING_CIRCUMFERENCE}`;
  const transform = `rotate(-90 ${CENTRE} ${CENTRE})`;
  return (
    <svg
      viewBox={VIEWBOX}
      width={size}
      height={size}
      role={UI.img}
      aria-label={label}
      style={{ flexShrink: 0 }}
    >
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={RING_RADIUS}
        fill={FILL_NONE}
        stroke={TRACK_COLOUR}
        strokeWidth={strokeWidth}
      />
      {percent !== null && (
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={RING_RADIUS}
          fill={FILL_NONE}
          stroke={colour}
          strokeWidth={strokeWidth}
          strokeLinecap={ROUND}
          strokeDasharray={dashArray}
          strokeDashoffset={dash.dashoffset}
          transform={transform}
        />
      )}
    </svg>
  );
}
