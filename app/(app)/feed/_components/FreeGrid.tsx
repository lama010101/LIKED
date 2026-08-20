"use client";

import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import type { FeedNode } from "@/lib/hooks/useFeed";
import NodeCard from "./NodeCard";
import { supabaseBrowser } from "@/lib/supabase/client";
import { upsertCardPositionAction, type CardPosition } from "@/app/lib/actions/cardPositions";

const CARD_W = 200;
const CARD_H = 200;
const GAP = 16;
const MIN_CARD_W = 1;
const MIN_CARD_H = 1;
const MAX_CARD_W = 4;
const MAX_CARD_H = 4;

interface FreeGridProps {
  nodes: FeedNode[];
  scopeKey: string;
  onCardClick: (node: FeedNode) => void;
  currentUserId: string;
  activeFolderId: string | null;
  onShare?: (node: FeedNode) => void;
  onMoveToFolder?: (node: FeedNode) => void;
  onAddTag?: (node: FeedNode) => void;
  onDelete?: (nodeId: string) => void;
}

interface CardState {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function FreeGrid({
  nodes,
  scopeKey: _scopeKey,
  onCardClick,
  currentUserId,
  activeFolderId,
  onShare,
  onMoveToFolder,
  onAddTag,
  onDelete,
}: FreeGridProps) {
  const [positions, setPositions] = useState<Record<string, CardState>>({});
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);
  const panState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const dragState = useRef<{ nodeId: string; startX: number; startY: number; cardX: number; cardY: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved positions from DB
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const loadPositions = async () => {
      try {
        const supabase = await supabaseBrowser;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        let query = supabase
          .from('card_positions')
          .select('node_id, folder_id, pos_x, pos_y, width, height')
          .eq('user_id', user.id);

        if (activeFolderId) {
          query = query.eq('folder_id', activeFolderId);
        } else {
          query = query.is('folder_id', null);
        }

        const { data } = await query;
        if (cancelled || !data) return;

        const map: Record<string, CardState> = {};
        (data as CardPosition[]).forEach((p) => {
          map[p.node_id] = {
            x: p.pos_x,
            y: p.pos_y,
            w: p.width,
            h: p.height,
          };
        });
        setPositions(map);
      } catch {
        // ignore — will use auto-arrange
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPositions();
    return () => { cancelled = true; };
  }, [activeFolderId]);

  // Auto-arrange cards that don't have a saved position
  const autoPositions = useMemo(() => {
    const result: Record<string, CardState> = { ...positions };
    const COLS = 4;
    let col = 0;
    let row = 0;
    nodes.forEach((node) => {
      if (!result[node.node_id]) {
        result[node.node_id] = {
          x: col * (CARD_W + GAP),
          y: row * (CARD_H + GAP),
          w: 1,
          h: 1,
        };
        col++;
        if (col >= COLS) { col = 0; row++; }
      }
    });
    return result;
  }, [nodes, positions]);

  // Debounced position save
  const savePosition = useCallback((nodeId: string, state: CardState) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      upsertCardPositionAction(nodeId, activeFolderId, state.x, state.y, state.w, state.h);
    }, 500);
  }, [activeFolderId]);

  // ── Pan handlers (drag background to scroll) ──────────────────────────────

  const onCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    // Only pan when clicking the canvas background, not a card
    if (e.target !== canvasRef.current) return;
    panState.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pan]);

  const onCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (!panState.current) return;
    const dx = e.clientX - panState.current.startX;
    const dy = e.clientY - panState.current.startY;
    setPan({ x: panState.current.panX + dx, y: panState.current.panY + dy });
  }, []);

  const onCanvasPointerUp = useCallback((e: React.PointerEvent) => {
    panState.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, []);

  // ── Card drag handlers ────────────────────────────────────────────────────

  const onCardPointerDown = useCallback((e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    const card = autoPositions[nodeId];
    if (!card) return;
    dragState.current = {
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      cardX: card.x,
      cardY: card.y,
    };
  }, [autoPositions]);

  const onCardPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    const nodeId = dragState.current.nodeId;
    const newX = dragState.current.cardX + dx;
    const newY = dragState.current.cardY + dy;
    setPositions((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], x: newX, y: newY },
    }));
  }, []);

  const onCardPointerUp = useCallback(() => {
    if (!dragState.current) return;
    const nodeId = dragState.current.nodeId;
    const card = positions[nodeId];
    if (card) savePosition(nodeId, card);
    dragState.current = null;
  }, [positions, savePosition]);

  // ── Auto-arrange ──────────────────────────────────────────────────────────

  const handleAutoArrange = useCallback(() => {
    const COLS = 4;
    const newPositions: Record<string, CardState> = {};
    let col = 0;
    let row = 0;
    nodes.forEach((node) => {
      newPositions[node.node_id] = {
        x: col * (CARD_W + GAP),
        y: row * (CARD_H + GAP),
        w: 1,
        h: 1,
      };
      col++;
      if (col >= COLS) { col = 0; row++; }
    });
    setPositions(newPositions);
    setPan({ x: 0, y: 0 });
    // Save all positions
    Object.entries(newPositions).forEach(([nodeId, state]) => {
      upsertCardPositionAction(nodeId, activeFolderId, state.x, state.y, state.w, state.h);
    });
  }, [nodes, activeFolderId]);

  // ── Resize handler ────────────────────────────────────────────────────────

  const handleResize = useCallback((nodeId: string, dw: number, dh: number) => {
    setPositions((prev) => {
      const card = prev[nodeId] ?? { x: 0, y: 0, w: 1, h: 1 };
      const newCard = {
        ...card,
        w: Math.max(MIN_CARD_W, Math.min(MAX_CARD_W, card.w + dw)),
        h: Math.max(MIN_CARD_H, Math.min(MAX_CARD_H, card.h + dh)),
      };
      savePosition(nodeId, newCard);
      return { ...prev, [nodeId]: newCard };
    });
  }, [savePosition]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3, #999)' }}>Loading canvas…</div>;
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Auto-arrange button */}
      <button
        onClick={handleAutoArrange}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 10,
          padding: '8px 14px',
          background: 'var(--surface-2, #f5f5f5)',
          border: '1px solid var(--border-1, #e5e7eb)',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-2, #666)',
          cursor: 'pointer',
        }}
      >
        Auto-arrange
      </button>

      {/* Canvas */}
      <div
        ref={canvasRef}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={(e) => { onCanvasPointerMove(e); onCardPointerMove(e); }}
        onPointerUp={(e) => { onCanvasPointerUp(e); onCardPointerUp(); }}
        style={{
          position: 'absolute',
          inset: 0,
          cursor: panState.current ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        {/* Cards layer (translated by pan) */}
        <div
          style={{
            position: 'absolute',
            left: pan.x,
            top: pan.y,
            width: '100%',
            height: '100%',
          }}
        >
          {nodes.map((node) => {
            const card = autoPositions[node.node_id] ?? { x: 0, y: 0, w: 1, h: 1 };
            const w = card.w * CARD_W + (card.w - 1) * GAP;
            const h = card.h * CARD_H + (card.h - 1) * GAP;
            return (
              <div
                key={node.node_id}
                onPointerDown={(e) => onCardPointerDown(e, node.node_id)}
                style={{
                  position: 'absolute',
                  left: card.x,
                  top: card.y,
                  width: w,
                  height: h,
                  cursor: dragState.current?.nodeId === node.node_id ? 'grabbing' : 'grab',
                  touchAction: 'none',
                }}
              >
                <div style={{ height: '100%', overflow: 'hidden', borderRadius: 12 }}>
                  <NodeCard
                    node={node}
                    onClick={onCardClick}
                    currentUserId={currentUserId}
                    onShare={onShare}
                    onMoveToFolder={onMoveToFolder}
                    onAddTag={onAddTag}
                    onDelete={onDelete}
                  />
                </div>

                {/* Resize handle — bottom-right corner */}
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const cardState = autoPositions[node.node_id] ?? { x: 0, y: 0, w: 1, h: 1 };
                    const startW = cardState.w;
                    const startH = cardState.h;

                    const onMove = (ev: PointerEvent) => {
                      const dx = ev.clientX - startX;
                      const dy = ev.clientY - startY;
                      const dw = Math.round(dx / (CARD_W + GAP));
                      const dh = Math.round(dy / (CARD_H + GAP));
                      handleResize(node.node_id, dw - (startW - (positions[node.node_id]?.w ?? startW)), dh - (startH - (positions[node.node_id]?.h ?? startH)));
                    };
                    const onUp = () => {
                      window.removeEventListener('pointermove', onMove);
                      window.removeEventListener('pointerup', onUp);
                    };
                    window.addEventListener('pointermove', onMove);
                    window.addEventListener('pointerup', onUp);
                  }}
                  title="Drag to resize"
                  style={{
                    position: 'absolute',
                    bottom: 4,
                    right: 4,
                    width: 18,
                    height: 18,
                    cursor: 'se-resize',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 4,
                    background: 'rgba(0,0,0,0.18)',
                    zIndex: 2,
                    touchAction: 'none',
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
          })}
        </div>
      </div>
    </div>
  );
}
