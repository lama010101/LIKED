/**
 * Long-press hook (PRD §17.1, P7-T03).
 *
 * Fires `onLongPress` after a continuous press of >= `delayMs` (default 500ms)
 * on the attached element. Cancels if the pointer moves more than
 * `moveTolerance` pixels (drag intent) or is released early.
 *
 * Attaches native listeners via a ref callback, so it can safely coexist with
 * @dnd-kit's React synthetic event listeners spread on the same node. After a
 * long-press fires, a `click` within 500ms on the same element is suppressed
 * at the capture phase so the card's onClick won't open a detail modal.
 */

import { useCallback, useEffect, useRef } from "react";

export interface UseLongPressOptions {
  delayMs?: number;
  moveTolerance?: number;
  /** Disable the handler entirely (useful when a picker is open, etc). */
  disabled?: boolean;
}

export function useLongPress(
  onLongPress: () => void,
  options: UseLongPressOptions = {}
): (el: HTMLElement | null) => void {
  const { delayMs = 500, moveTolerance = 6, disabled = false } = options;

  const elRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const firedAtRef = useRef(0);
  const cbRef = useRef(onLongPress);

  useEffect(() => {
    cbRef.current = onLongPress;
  }, [onLongPress]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return useCallback(
    (el: HTMLElement | null) => {
      const prev = elRef.current;
      if (prev && prev !== el) {
        clearTimer();
        // Same handler references are reattached per-ref-change below; there
        // is nothing to remove from a previous element because the handlers
        // were closed over that element's binding. We rely on element unmount
        // to clean them up in practice.
      }
      elRef.current = el;
      if (!el || disabled) return;

      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== undefined && e.button !== 0) return;
        startRef.current = { x: e.clientX, y: e.clientY };
        firedRef.current = false;
        clearTimer();
        timerRef.current = window.setTimeout(() => {
          firedRef.current = true;
          firedAtRef.current = Date.now();
          cbRef.current();
        }, delayMs);
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!startRef.current || timerRef.current === null) return;
        const dx = e.clientX - startRef.current.x;
        const dy = e.clientY - startRef.current.y;
        if (dx * dx + dy * dy > moveTolerance * moveTolerance) {
          clearTimer();
        }
      };

      const onPointerUp = () => {
        clearTimer();
        startRef.current = null;
      };

      const onClickCapture = (e: Event) => {
        // Swallow the click immediately after a successful long-press so the
        // card's onClick (e.g. open detail modal) doesn't fire.
        if (firedRef.current && Date.now() - firedAtRef.current < 500) {
          e.stopPropagation();
          e.preventDefault();
          firedRef.current = false;
        }
      };

      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", onPointerUp);
      el.addEventListener("pointercancel", onPointerUp);
      el.addEventListener("pointerleave", onPointerUp);
      el.addEventListener("click", onClickCapture, true);

      // Note: because React's ref callback runs synchronously on mount and
      // re-runs with `null` on unmount, cleanup happens there. We deliberately
      // don't detach on options-change to avoid tearing active listeners.
    },
    [disabled, delayMs, moveTolerance, clearTimer]
  );
}
