"use client";

/* eslint-disable react/jsx-no-literals -- see the FINDING banner in FriendFlow.tsx (v2 rule config rejects every JSX attribute string). */

// Add screen (PRD §5.2-§5.4, task P0-14): one search box (TMDB, 300 ms
// debounce, ≥2 chars), the paste-a-link row, the "Your picks" tray with
// collapsed per-item details (score slider, platform, comment) and the
// single "Send to {owner} (N titles)" action.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import ScoreSlider from "./ScoreSlider";
import type { TrayItem } from "./types";

interface SearchRow {
  source: "tmdb";
  kind: "movie" | "series";
  external_id: string;
  title: string;
  year: number | null;
  poster_path: string | null;
}

interface AddScreenProps {
  token: string;
  owner: string;
  tray: TrayItem[];
  onChange: (items: TrayItem[]) => void;
  onSend: () => void;
  sending: boolean;
  sendError: string | null;
}

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w92";

function posterFor(path: string | null): string | null {
  return path && /^\/[A-Za-z0-9._-]+$/.test(path) ? `${TMDB_IMAGE_BASE}${path}` : null;
}

export default function AddScreen({
  token,
  owner,
  tray,
  onChange,
  onSend,
  sending,
  sendError,
}: AddScreenProps) {
  const t = useTranslations("ask");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [openDetails, setOpenDetails] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRows([]);
      setSearchBusy(false);
      return;
    }
    const mine = seq.current + 1;
    seq.current = mine;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ask/search?q=${encodeURIComponent(q)}&src=tmdb`, {
          headers: { "x-ask-token": token },
          cache: "no-store",
        });
        if (seq.current !== mine) return;
        if (!res.ok) {
          setRows([]);
          setSearchBusy(res.status === 503);
          return;
        }
        const body = (await res.json()) as { tmdb?: SearchRow[]; youtube?: { status?: string } };
        setRows(Array.isArray(body.tmdb) ? body.tmdb : []);
        setSearchBusy(body.youtube?.status === "busy");
      } catch {
        if (seq.current === mine) setRows([]);
      } finally {
        if (seq.current === mine) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, token]);

  async function resolveBody(body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch("/api/ask/resolve", {
        method: "POST",
        headers: { "content-type": "application/json", "x-ask-token": token },
        body: JSON.stringify(body),
      });
      if (!res.ok) return false;
      const item = (await res.json()) as {
        item_id?: string;
        source?: "tmdb" | "youtube";
        kind?: TrayItem["kind"];
        name?: string | null;
        year?: number | null;
        poster_path?: string | null;
        thumb_url?: string | null;
      };
      if (!item.item_id || !item.source || !item.kind) return false;
      if (tray.some((existing) => existing.item_id === item.item_id)) return true;
      onChange([
        ...tray,
        {
          item_id: item.item_id,
          source: item.source,
          kind: item.kind,
          title: item.name ?? "",
          year: item.year ?? null,
          poster_path: item.poster_path ?? null,
          thumb_url: item.thumb_url ?? null,
          rating: null,
          platform: "",
          comment: "",
        },
      ]);
      return true;
    } catch {
      return false;
    }
  }

  function update(itemId: string, patch: Partial<TrayItem>) {
    onChange(tray.map((item) => (item.item_id === itemId ? { ...item, ...patch } : item)));
  }

  const sendLabel =
    tray.length === 1 ? t("sendOne", { owner }) : t("send", { owner, count: tray.length });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="ask-search" className="text-sm font-medium">
          {t("searchLabel")}
        </label>
        <input
          id="ask-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2 text-base outline-none focus:border-[var(--v2-accent)]"
        />
        {searchBusy ? (
          <p role="status" className="text-sm text-[var(--v2-warn)]">
            {t("searchBusy")}
          </p>
        ) : null}
        {rows.length > 0 ? (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-1">
            {rows.map((row) => {
              const poster = posterFor(row.poster_path);
              return (
                <li key={`${row.kind}-${row.external_id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      void resolveBody({
                        source: "tmdb",
                        kind: row.kind,
                        external_id: row.external_id,
                      });
                      setQuery("");
                      setRows([]);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--v2-surface-raised)]"
                  >
                    <span aria-hidden="true" className="h-12 w-8 shrink-0 overflow-hidden rounded bg-[var(--v2-surface-raised)]">
                      {poster ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={poster} alt="" width={32} height={48} loading="lazy" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{row.title}</span>
                      <span className="block text-xs text-[var(--v2-text-muted)]">
                        {row.year ?? ""}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-xs text-[var(--v2-text-muted)]">
                      {row.kind === "movie" ? t("add") : t("add")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {searching ? (
          <p role="status" className="text-xs text-[var(--v2-text-muted)]">
            {t("searchPlaceholder")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-3">
        <span className="text-sm font-medium">{t("pasteRow")}</span>
        <div className="flex gap-2">
          <input
            type="url"
            value={paste}
            onChange={(event) => {
              setPaste(event.target.value);
              setPasteError(null);
            }}
            placeholder={t("pastePlaceholder")}
            aria-label={t("pastePlaceholder")}
            className="min-w-0 flex-1 rounded-lg border border-[var(--v2-border)] bg-[var(--v2-bg)] px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={paste.trim().length === 0}
            onClick={async () => {
              const ok = await resolveBody({ url: paste.trim() });
              if (ok) setPaste("");
              else setPasteError(t("error.resolve"));
            }}
            className="rounded-lg border border-[var(--v2-border)] px-3 py-2 text-sm disabled:opacity-50"
          >
            {t("paste")}
          </button>
        </div>
        {pasteError ? (
          <p role="alert" className="text-sm text-[var(--v2-danger)]">
            {pasteError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">
          {t("tray")} ({tray.length})
        </h2>
        {tray.length === 0 ? (
          <p className="text-sm text-[var(--v2-text-muted)]">{t("trayEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tray.map((item) => {
              const open = openDetails === item.item_id;
              return (
                <li
                  key={item.item_id}
                  className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-[var(--v2-text-muted)]">
                        {item.year ?? ""}
                        {item.rating !== null ? ` · ${item.rating}%` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpenDetails(open ? null : item.item_id)}
                        className="rounded-full border border-[var(--v2-border)] px-2.5 py-1 text-xs"
                      >
                        {t("details")}
                      </button>
                      <button
                        type="button"
                        onClick={() => onChange(tray.filter((row) => row.item_id !== item.item_id))}
                        className="rounded-full border border-[var(--v2-border)] px-2.5 py-1 text-xs"
                      >
                        {t("remove")}
                      </button>
                    </div>
                  </div>
                  {open ? (
                    <div className="mt-3 flex flex-col gap-3">
                      <ScoreSlider
                        value={item.rating}
                        label={t("score")}
                        onChange={(rating) => update(item.item_id, { rating })}
                      />
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`platform-${item.item_id}`}
                          className="text-sm font-medium"
                        >
                          {t("platform")}
                        </label>
                        <input
                          id={`platform-${item.item_id}`}
                          type="text"
                          maxLength={60}
                          value={item.platform}
                          onChange={(event) =>
                            update(item.item_id, { platform: event.target.value })
                          }
                          className="rounded-lg border border-[var(--v2-border)] bg-[var(--v2-bg)] px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`comment-${item.item_id}`}
                          className="text-sm font-medium"
                        >
                          {t("comment", { owner })}
                        </label>
                        <textarea
                          id={`comment-${item.item_id}`}
                          maxLength={280}
                          rows={2}
                          value={item.comment}
                          onChange={(event) =>
                            update(item.item_id, { comment: event.target.value })
                          }
                          aria-describedby={`comment-hint-${item.item_id}`}
                          className="rounded-lg border border-[var(--v2-border)] bg-[var(--v2-bg)] px-3 py-2 text-sm"
                        />
                        <p
                          id={`comment-hint-${item.item_id}`}
                          className="text-xs text-[var(--v2-text-muted)]"
                        >
                          {t("commentHint")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpenDetails(null)}
                        className="self-end rounded-full bg-[var(--v2-surface-raised)] px-3 py-1 text-xs"
                      >
                        {t("done")}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {sendError ? (
        <p role="alert" className="text-sm text-[var(--v2-danger)]">
          {sendError}
        </p>
      ) : null}

      <button
        type="button"
        disabled={tray.length === 0 || sending}
        onClick={onSend}
        className="rounded-xl bg-[var(--v2-accent)] px-4 py-3 text-base font-semibold text-[var(--v2-on-accent)] disabled:opacity-50"
      >
        {sending ? t("sending") : sendLabel}
      </button>
    </section>
  );
}
