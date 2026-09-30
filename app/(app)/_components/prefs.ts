"use client";

/**
 * UI layout prefs — render-only, persisted in localStorage (same pattern as
 * liked.theme / liked.view). Applied to <html data-layout / data-rail> so CSS
 * can react without prop drilling; a "liked:prefs" event keeps AppShell in
 * sync when prefs are changed from another page (e.g. /me).
 */

export type LayoutPref = "friends-left" | "friends-top";

const LAYOUT_KEY = "liked.layout";
const RAIL_KEY = "liked.rail";
const EVT = "liked:prefs";

export function getLayoutPref(): LayoutPref {
  if (typeof window === "undefined") return "friends-left";
  return localStorage.getItem(LAYOUT_KEY) === "friends-top" ? "friends-top" : "friends-left";
}

export function getRailOpen(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(RAIL_KEY) !== "closed";
}

function apply() {
  document.documentElement.setAttribute("data-layout", getLayoutPref());
  document.documentElement.setAttribute("data-rail", getRailOpen() ? "open" : "closed");
}

function commit() {
  apply();
  window.dispatchEvent(new Event(EVT));
}

export function setLayoutPref(p: LayoutPref) {
  localStorage.setItem(LAYOUT_KEY, p);
  commit();
}

export function setRailOpen(open: boolean) {
  localStorage.setItem(RAIL_KEY, open ? "open" : "closed");
  commit();
}

/** Apply stored prefs to <html> now, invoke cb with current prefs, and
 *  re-invoke on every pref change. Returns an unsubscribe function. */
export function syncPrefs(cb: (layout: LayoutPref, railOpen: boolean) => void): () => void {
  apply();
  const on = () => cb(getLayoutPref(), getRailOpen());
  window.addEventListener(EVT, on);
  on();
  return () => window.removeEventListener(EVT, on);
}
