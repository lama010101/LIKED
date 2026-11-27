"use client";

// Inline v2 icons. Every SVG attribute that would be a string literal lives in
// a module constant: the repo's react/jsx-no-literals (noStrings) rule bans
// string attributes in the v2 directories. stroke = currentColor (REPO-17).

const BASE = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const GEAR_BODY =
  "M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.38.5.72 1 .88H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.12Z";
const BELL_BODY = "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9";
const BELL_CLAPPER = "M13.7 21a2 2 0 0 1-3.4 0";
const SHARE_BOX = "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7";
const SHARE_ARROW = "M12 3v13";
const SHARE_HEAD = "m7 8 5-5 5 5";
const COPY_FRONT = "M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1";
const CLOSE_A = "M18 6 6 18";
const CLOSE_B = "m6 6 12 12";
const PLAY = "m8 5 11 7-11 7V5Z";

export function GearIcon() {
  return (
    <svg {...BASE}>
      <circle cx={12} cy={12} r={3} />
      <path d={GEAR_BODY} />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg {...BASE}>
      <path d={BELL_BODY} />
      <path d={BELL_CLAPPER} />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg {...BASE}>
      <path d={SHARE_BOX} />
      <path d={SHARE_ARROW} />
      <path d={SHARE_HEAD} />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg {...BASE}>
      <rect x={9} y={9} width={12} height={12} rx={2} />
      <path d={COPY_FRONT} />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...BASE}>
      <path d={CLOSE_A} />
      <path d={CLOSE_B} />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg {...BASE}>
      <path d={PLAY} />
    </svg>
  );
}
