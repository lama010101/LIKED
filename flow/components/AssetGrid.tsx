"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useFlow, visibleCards } from "@/flow/store";
import { AssetCard } from "@/flow/lib/mock";
import CardThumb from "./CardThumb";

const PAGE = 48;
const GAP = 12;
const META = 0; // thumb is self-contained

interface Marquee {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  additive: boolean;
}

export default function AssetGrid() {
  const cards = useFlow((s) => s.cards);
  const activeCollection = useFlow((s) => s.activeCollection);
  const activeFriend = useFlow((s) => s.activeFriend);
  const sortBy = useFlow((s) => s.sortBy);
  const cols = useFlow((s) => s.cols);
  const selectedIds = useFlow((s) => s.selectedIds);
  const dragActive = useFlow((s) => s.dragActive);

  const items = useMemo(
    () => visibleCards({ cards, activeCollection, activeFriend, sortBy }),
    [cards, activeCollection, activeFriend, sortBy]
  );
  const orderedIds = useMemo(() => items.map((c) => c.id), [items]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1024);
  const [shown, setShown] = useState(PAGE);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [marqueeIds, setMarqueeIds] = useState<string[]>([]);
  const cardRefs = useRef(new Map<string, HTMLElement>());

  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  // track container width for virtualizer row height
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // reset pagination when the visible set changes
  useEffect(() => setShown(PAGE), [activeCollection, activeFriend, sortBy]);

  const virtualize = items.length > 100;
  const colW = (width - GAP * (cols - 1)) / cols;
  const rowH = Math.max(80, (colW * 9) / 16 + META + GAP);
  const rowCount = Math.ceil(items.length / cols);

  const virtualizer = useVirtualizer({
    count: virtualize ? rowCount : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 4,
  });

  // infinite scroll sentinel (non-virtualized path)
  useEffect(() => {
    if (virtualize) return;
    const root = scrollRef.current;
    const sentinel = root?.querySelector("[data-sentinel]");
    if (!root || !sentinel) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown((n) => Math.min(n + PAGE, items.length));
        }
      },
      { root, rootMargin: "400px" }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [virtualize, items.length, shown]);

  // ----- marquee selection -----
  const hitTest = useCallback((m: Marquee): string[] => {
    const left = Math.min(m.x0, m.x1);
    const right = Math.max(m.x0, m.x1);
    const top = Math.min(m.y0, m.y1);
    const bottom = Math.max(m.y0, m.y1);
    const ids: string[] = [];
    cardRefs.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      if (
        r.right > left &&
        r.left < right &&
        r.bottom > top &&
        r.top < bottom
      ) {
        ids.push(id);
      }
    });
    return ids;
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // only start marquee on empty canvas area
    const t = e.target as HTMLElement;
    if (t.closest("[data-card-id]") || t.closest("button") || e.button !== 0) {
      return; // only start marquee from empty canvas area, left button
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setMarquee({
      x0: e.clientX,
      y0: e.clientY,
      x1: e.clientX,
      y1: e.clientY,
      additive: e.shiftKey,
    });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    setMarquee((m) => {
      if (!m) return m;
      const next = { ...m, x1: e.clientX, y1: e.clientY };
      setMarqueeIds(hitTest(next));
      return next;
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!marquee) return;
    const moved =
      Math.abs(marquee.x1 - marquee.x0) + Math.abs(marquee.y1 - marquee.y0) > 4;
    if (moved) {
      useFlow.getState().mergeSelection(marqueeIds, marquee.additive || e.shiftKey);
    } else {
      useFlow.getState().clearSelection();
    }
    setMarquee(null);
    setMarqueeIds([]);
  };

  // ----- selection / open -----
  const handleSelect = (card: AssetCard) => (e: React.MouseEvent<HTMLElement>) => {
    const s = useFlow.getState();
    if (e.shiftKey) s.rangeSelect(card.id, orderedIds);
    else if (e.metaKey || e.ctrlKey) s.toggleSelect(card.id);
    else s.selectOnly(card.id);
  };

  const handleOpen = (card: AssetCard) => () => {
    useFlow.getState().openInspector(card.id);
  };

  // card→card drop creates a collection containing both
  const handleDropOnCard = (target: AssetCard) => (dragged: string[]) => {
    if (!dragged.length) return;
    useFlow.getState().createCollectionFromCards([...dragged, target.id]);
  };

  // "drop to move" bar at bottom of canvas → move to root / current collection
  const moveToCollection = useFlow((s) => s.moveToCollection);
  const [barOver, setBarOver] = useState(false);

  const renderCard = (card: AssetCard, key?: string) => (
    <CardThumb
      key={key ?? card.id}
      card={card}
      selected={selectedIds.includes(card.id) || marqueeIds.includes(card.id)}
      onSelect={handleSelect(card)}
      onOpen={handleOpen(card)}
      onDropIds={handleDropOnCard(card)}
      registerRef={registerRef}
    />
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        data-canvas
        role="grid"
        aria-label={`Asset canvas, ${items.length} items`}
        aria-colcount={cols}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative min-h-0 flex-1 touch-pan-y overflow-y-auto p-3"
      >
        {items.length === 0 && (
          <div className="flex h-40 items-center justify-center text-sm text-zinc-600">
            No assets here. Drag cards onto a collection in the sidebar to
            organize.
          </div>
        )}

        {virtualize ? (
          <div
            data-canvas
            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const rowCards = items.slice(
                row.index * cols,
                row.index * cols + cols
              );
              return (
                <div
                  key={row.key}
                  data-canvas
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${row.start}px)`,
                    display: "grid",
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gap: GAP,
                    paddingBottom: GAP,
                  }}
                >
                  {rowCards.map((c) => renderCard(c))}
                </div>
              );
            })}
          </div>
        ) : (
          <div
            data-canvas
            role="row"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: GAP,
            }}
          >
            {items.slice(0, shown).map((c) => renderCard(c))}
          </div>
        )}

        {!virtualize && shown < items.length && (
          <div
            data-sentinel
            className="flex h-16 items-center justify-center text-xs text-zinc-600"
          >
            Loading more…
          </div>
        )}

        {/* marquee box */}
        {marquee && (
          <div
            aria-hidden
            className="pointer-events-none fixed z-30 border border-accent bg-accent/15"
            style={{
              left: Math.min(marquee.x0, marquee.x1),
              top: Math.min(marquee.y0, marquee.y1),
              width: Math.abs(marquee.x1 - marquee.x0),
              height: Math.abs(marquee.y1 - marquee.y0),
            }}
          />
        )}
      </div>

      {/* drop-to-move target */}
      {dragActive && (
        <div
          role="button"
          aria-label="Drop to move assets to All assets"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("application/x-flow-ids")) {
              e.preventDefault();
              setBarOver(true);
            }
          }}
          onDragLeave={() => setBarOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setBarOver(false);
            const raw = e.dataTransfer.getData("application/x-flow-ids");
            try {
              const ids = JSON.parse(raw) as string[];
              if (Array.isArray(ids) && ids.length) {
                moveToCollection(
                  ids,
                  activeCollection !== "all" && activeCollection !== "archived"
                    ? activeCollection
                    : null
                );
              }
            } catch {
              /* malformed payload — ignore */
            }
          }}
          className={`mx-3 mb-3 flex items-center justify-center rounded-lg border-2 border-dashed py-3 text-xs ${
            barOver
              ? "border-accent bg-accent/15 text-accent"
              : "border-faint text-zinc-500"
          }`}
        >
          Drop here to move to{" "}
          {activeCollection !== "all" && activeCollection !== "archived"
            ? "this collection"
            : "All assets"}
        </div>
      )}
    </div>
  );
}
