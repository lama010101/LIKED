"use client";

import { useRef, useState } from "react";
import { AssetCard, thumbGradient } from "@/lib/mock";
import { useFlow } from "@/store";

export interface CardThumbProps {
  card: AssetCard;
  selected: boolean;
  selectionMode?: boolean;
  mobile?: boolean;
  onSelect?: (e: React.MouseEvent<HTMLElement>) => void;
  onOpen?: () => void;
  onLongPress?: () => void;
  onDropIds?: (dragged: string[]) => void;
  registerRef?: (id: string, el: HTMLElement | null) => void;
}

const LONG_PRESS_MS = 500;

/** Shared asset tile used by desktop grid and mobile feed. */
export default function CardThumb({
  card,
  selected,
  selectionMode = false,
  mobile = false,
  onSelect,
  onOpen,
  onLongPress,
  onDropIds,
  registerRef,
}: CardThumbProps) {
  const [scrub, setScrub] = useState<number | null>(null);
  const [muted, setMuted] = useState(true);
  const [dropHover, setDropHover] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);

  const g = thumbGradient(card.seed);
  const isVideo = card.kind === "video";

  const startPress = () => {
    if (!onLongPress) return;
    pressed.current = false;
    pressTimer.current = setTimeout(() => {
      pressed.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    if (pressed.current) {
      pressed.current = false;
      return;
    }
    onSelect?.(e);
  };

  return (
    <div
      ref={(el) => registerRef?.(card.id, el)}
      data-card-id={card.id}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${card.kind} asset: ${card.prompt}`}
      draggable={!mobile && !selectionMode}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        const st = useFlow.getState();
        const ids =
          selected && st.selectedIds.includes(card.id)
            ? st.selectedIds
            : [card.id];
        e.dataTransfer.setData("application/x-flow-ids", JSON.stringify(ids));
        e.dataTransfer.setData("text/plain", card.id);
        st.setDragActive(true);
      }}
      onDragEnd={() => useFlow.getState().setDragActive(false)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-flow-ids")) {
          e.preventDefault();
          setDropHover(true);
        }
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropHover(false);
        const raw = e.dataTransfer.getData("application/x-flow-ids");
        if (!raw || !onDropIds) return;
        try {
          const parsed = JSON.parse(raw) as string[];
          if (Array.isArray(parsed)) onDropIds(parsed.filter((id) => id !== card.id));
        } catch {
          onDropIds([raw]);
        }
      }}
      onPointerMove={(e) => {
        if (!isVideo) return;
        const r = e.currentTarget.getBoundingClientRect();
        setScrub(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
      }}
      onPointerLeave={() => setScrub(null)}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      onClick={handleClick}
      onDoubleClick={() => onOpen?.()}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen?.();
      }}
      className={[
        "group relative select-none overflow-hidden rounded-lg border text-left outline-none transition-shadow",
        mobile ? "min-h-[48px]" : "",
        selected
          ? "border-accent ring-2 ring-accent/70"
          : dropHover
            ? "border-accent2 ring-2 ring-accent2/60"
            : "border-edge hover:border-faint",
      ].join(" ")}
      style={{
        background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`,
        aspectRatio: "16 / 9",
      }}
    >
      {/* faux preview content */}
      <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_30%_20%,rgba(255,255,255,.25),transparent_50%)]" />

      {/* scrub bar for videos */}
      {isVideo && scrub !== null && (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-white/70"
            style={{ left: `${scrub * 100}%` }}
          />
          <div className="absolute inset-x-2 bottom-1 h-1 rounded bg-black/50">
            <div
              className="h-full rounded bg-accent"
              style={{ width: `${scrub * 100}%` }}
            />
          </div>
        </>
      )}

      {/* badges */}
      <div className="absolute left-1.5 top-1.5 flex gap-1">
        <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-200">
          {card.model}
        </span>
        {isVideo && (
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-300">
            {card.durationSec}s
          </span>
        )}
      </div>

      {/* sound toggle (video) */}
      {isVideo && !selectionMode && (
        <button
          type="button"
          aria-label={muted ? "Unmute preview" : "Mute preview"}
          onClick={(e) => {
            e.stopPropagation();
            setMuted((m) => !m);
          }}
          className={`absolute bottom-1.5 right-1.5 rounded-full bg-black/60 p-1.5 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 ${mobile ? "min-h-[48px] min-w-[48px] opacity-100" : ""}`}
        >
          {muted ? <MuteIcon /> : <SoundIcon />}
        </button>
      )}

      {/* play icon */}
      {isVideo && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-black/50 p-2 opacity-60">
            <PlayIcon />
          </div>
        </div>
      )}

      {/* selection check */}
      {(selectionMode || selected) && (
        <div
          className={`absolute right-1.5 top-1.5 flex ${mobile ? "h-7 w-7" : "h-5 w-5"} items-center justify-center rounded-full border ${
            selected ? "border-accent bg-accent" : "border-white/40 bg-black/50"
          }`}
          aria-hidden
        >
          {selected && (
            <svg viewBox="0 0 12 12" className="h-3 w-3 fill-none stroke-white stroke-2">
              <path d="M2 6.5 4.8 9 10 3" />
            </svg>
          )}
        </div>
      )}

      {/* prompt line */}
      <div className="absolute inset-x-0 bottom-0 line-clamp-1 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1 pt-4 text-[11px] text-zinc-200">
        {card.prompt}
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white/80" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function MuteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.5-2.5-1.4-1.4-2.5 2.5-2.5-2.5-1.4 1.4L13.9 12l-2.5 2.5 1.4 1.4 2.5-2.5 2.5 2.5 1.4-1.4L17.6 12z" />
    </svg>
  );
}
function SoundIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" />
    </svg>
  );
}
