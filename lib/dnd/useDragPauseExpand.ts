"use client";

/**
 * useDragPauseExpand — fires `onExpand()` when the user is dragging and
 * hovers over a (collapsed) bar for more than `delayMs` without moving.
 *
 * Spec per P7-T01: pause >500ms → auto-expand with smooth 200ms animation.
 *
 * Usage:
 *   const ref = useDragPauseExpand({ isCollapsed, onExpand });
 *   return <div ref={ref}>...</div>;
 *
 * Implementation: uses pointer events and resets a timer on pointermove.
 * DndKit's own hover events are per-droppable; this is a bar-level trigger
 * that coexists peacefully with useDroppable on children.
 */

import { useCallback, useEffect, useRef } from "react";
import { useDndState } from "./DndProvider";

export interface UseDragPauseExpandOptions {
  /** Is the bar currently collapsed? Only then will auto-expand fire. */
  isCollapsed: boolean;
  /** Called once after `delayMs` of pointer-hovering while dragging. */
  onExpand: () => void;
  /** Default: 500 ms. */
  delayMs?: number;
}

export function useDragPauseExpand<T extends HTMLElement>(
  opts: UseDragPauseExpandOptions
): (node: T | null) => void {
  const { isCollapsed, onExpand, delayMs = 500 } = opts;
  const { activeSource } = useDndState();
  const timerRef = useRef<number | null>(null);
  const nodeRef = useRef<T | null>(null);
  const firedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleExpand = useCallback(() => {
    if (!activeSource || !isCollapsed || firedRef.current) return;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true;
      onExpand();
    }, delayMs);
  }, [activeSource, isCollapsed, onExpand, delayMs, clearTimer]);

  // Reset the "fired" latch when drag ends or collapse state changes.
  useEffect(() => {
    if (!activeSource) {
      firedRef.current = false;
      clearTimer();
    }
  }, [activeSource, clearTimer]);

  useEffect(() => {
    firedRef.current = false;
  }, [isCollapsed]);

  const handlePointerOver = useCallback(() => {
    scheduleExpand();
  }, [scheduleExpand]);

  const handlePointerMove = useCallback(() => {
    // Any movement resets the dwell timer — only a true pause triggers.
    scheduleExpand();
  }, [scheduleExpand]);

  const handlePointerLeave = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  // Stable ref callback that wires/unwires listeners to whatever node we get.
  return useCallback(
    (node: T | null) => {
      const prev = nodeRef.current;
      if (prev) {
        prev.removeEventListener("pointerover", handlePointerOver);
        prev.removeEventListener("pointermove", handlePointerMove);
        prev.removeEventListener("pointerleave", handlePointerLeave);
      }
      nodeRef.current = node;
      if (node) {
        node.addEventListener("pointerover", handlePointerOver);
        node.addEventListener("pointermove", handlePointerMove);
        node.addEventListener("pointerleave", handlePointerLeave);
      }
    },
    [handlePointerOver, handlePointerMove, handlePointerLeave]
  );
}
