"use client";

import { useMemo } from "react";
import { useFlow, visibleCards } from "@/store";
import { AssetCard, thumbGradient } from "@/lib/mock";

function dayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Vertical timeline ("batch") view with timestamps + prompt badges. */
export default function BatchView({ mobile = false }: { mobile?: boolean }) {
  const cards = useFlow((s) => s.cards);
  const activeCollection = useFlow((s) => s.activeCollection);
  const activeFriend = useFlow((s) => s.activeFriend);
  const sortBy = useFlow((s) => s.sortBy);
  const selectedIds = useFlow((s) => s.selectedIds);

  const items = useMemo(
    () => visibleCards({ cards, activeCollection, activeFriend, sortBy }),
    [cards, activeCollection, activeFriend, sortBy]
  );
  const orderedIds = useMemo(() => items.map((c) => c.id), [items]);

  const groups = useMemo(() => {
    const map = new Map<string, AssetCard[]>();
    for (const c of items) {
      const k = dayLabel(c.createdAt);
      const arr = map.get(k) ?? [];
      arr.push(c);
      map.set(k, arr);
    }
    return [...map.entries()];
  }, [items]);

  const onCardClick = (card: AssetCard) => (e: React.MouseEvent) => {
    const s = useFlow.getState();
    if (mobile) {
      if (s.selectionMode) s.toggleSelect(card.id);
      else {
        s.openInspector(card.id);
        s.setMobileSheet("inspector");
      }
      return;
    }
    if (e.shiftKey) s.rangeSelect(card.id, orderedIds);
    else if (e.metaKey || e.ctrlKey) s.toggleSelect(card.id);
    else s.selectOnly(card.id);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3" role="list" aria-label="Asset timeline">
      {groups.map(([day, list]) => (
        <section key={day} className="mb-5">
          <h3 className="sticky top-0 z-10 bg-ink/90 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 backdrop-blur">
            {day}
          </h3>
          <div className="relative ml-3 border-l border-edge pl-4">
            {list.map((card) => {
              const g = thumbGradient(card.seed);
              const selected = selectedIds.includes(card.id);
              return (
                <div key={card.id} role="listitem" className="relative mb-3">
                  <span className="absolute -left-[21px] top-4 h-2 w-2 rounded-full bg-faint" aria-hidden />
                  <button
                    type="button"
                    onClick={onCardClick(card)}
                    aria-pressed={selected}
                    className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                      selected
                        ? "border-accent bg-accent/10"
                        : "border-edge bg-panel hover:border-faint"
                    } ${mobile ? "min-h-[48px]" : ""}`}
                  >
                    <span
                      className="h-12 w-20 shrink-0 rounded"
                      style={{
                        background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`,
                      }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-zinc-200">
                        {card.prompt}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-raise px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">
                          {card.model}
                        </span>
                        <span className="rounded bg-raise px-1.5 py-0.5 text-[10px] text-zinc-500">
                          {card.kind === "video" ? `${card.durationSec}s` : "img"}
                        </span>
                        <span className="rounded bg-raise px-1.5 py-0.5 text-[10px] text-zinc-500">
                          {card.params.aspect}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-zinc-600">
                      {timeLabel(card.createdAt)}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {items.length === 0 && (
        <p className="py-10 text-center text-sm text-zinc-600">No assets.</p>
      )}
    </div>
  );
}
