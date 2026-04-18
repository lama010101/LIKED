"use client";

import { useCallback, useRef, useState } from "react";
import type { VisibleNode } from "@/lib/db/visibility";
import NodeCard from "./NodeCard";

const COLS = 4;
const ROW_PX = 120;
const GAP_PX = 12;

interface CardSize {
  w: number;
  h: number;
}

interface FreeGridProps {
  nodes: VisibleNode[];
  scopeKey: string;
  onCardClick: (node: VisibleNode) => void;
}

export default function FreeGrid({ nodes, scopeKey, onCardClick }: FreeGridProps) {
  const [sizes, setSizes] = useState<Record<string, Record<string, CardSize>>>({});

  const getSize = useCallback(
    (cardId: string): CardSize =>
      sizes[scopeKey]?.[cardId] ?? { w: 1, h: 1 },
    [sizes, scopeKey]
  );

  const setSize = useCallback(
    (cardId: string, size: CardSize) => {
      setSizes((prev) => ({
        ...prev,
        [scopeKey]: {
          ...prev[scopeKey],
          [cardId]: size,
        },
      }));
    },
    [scopeKey]
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gridAutoRows: `${ROW_PX}px`,
        gridAutoFlow: "dense",
        gap: GAP_PX,
        padding: GAP_PX,
      }}
    >
      {nodes.map((node) => (
        <ResizableCard
          key={node.id}
          node={node}
          size={getSize(node.id)}
          cols={COLS}
          rowPx={ROW_PX}
          gapPx={GAP_PX}
          onResize={(size) => setSize(node.id, size)}
          onClick={onCardClick}
        />
      ))}
    </div>
  );
}

interface ResizableCardProps {
  node: VisibleNode;
  size: CardSize;
  cols: number;
  rowPx: number;
  gapPx: number;
  onResize: (size: CardSize) => void;
  onClick: (node: VisibleNode) => void;
}

function ResizableCard({
  node,
  size,
  cols,
  rowPx,
  gapPx,
  onResize,
  onClick,
}: ResizableCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: size.w,
        startH: size.h,
      };

      const onMove = (ev: PointerEvent) => {
        if (!dragState.current) return;
        const dx = ev.clientX - dragState.current.startX;
        const dy = ev.clientY - dragState.current.startY;

        const colWidth = (rect.width / size.w + gapPx);
        const newW = Math.max(1, Math.min(cols, Math.round(dragState.current.startW + dx / colWidth)));
        const newH = Math.max(1, Math.round(dragState.current.startH + dy / (rowPx + gapPx)));

        onResize({ w: newW, h: newH });
      };

      const onUp = () => {
        dragState.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [size.w, size.h, cols, rowPx, gapPx, onResize]
  );

  return (
    <div
      ref={containerRef}
      style={{
        gridColumn: `span ${size.w}`,
        gridRow: `span ${size.h}`,
        position: "relative",
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <div style={{ height: "100%", overflow: "hidden", borderRadius: 12 }}>
        <NodeCard node={node} onClick={onClick} />
      </div>

      {/* Resize handle — bottom-right corner */}
      <div
        onPointerDown={onHandlePointerDown}
        title="Drag to resize"
        style={{
          position: "absolute",
          bottom: 4,
          right: 4,
          width: 18,
          height: 18,
          cursor: "se-resize",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 4,
          background: "rgba(0,0,0,0.18)",
          zIndex: 2,
          touchAction: "none",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <line x1="2" y1="9" x2="9" y2="2" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="5" y1="9" x2="9" y2="5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="9" x2="9" y2="8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
