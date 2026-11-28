"use client";

// After-submit screen (PRD §5.5, task P0-14): one screen with the
// receipt (the guest's OWN rows only — guest_get_receipt filters by
// contributor), "Add more titles" and "Delete my data".

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ReceiptRow } from "./types";

interface ReceiptScreenProps {
  token: string;
  owner: string;
  onAddMore: () => void;
  onDeleted: () => void;
}

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w92";
const PICK_SEPARATOR = " · ";
const EXTERNAL_LINK_ICON = "↗";

function posterFor(path: string | null): string | null {
  return path && /^\/[A-Za-z0-9._-]+$/.test(path) ? `${TMDB_IMAGE_BASE}${path}` : null;
}

export default function ReceiptScreen({ token, owner, onAddMore, onDeleted }: ReceiptScreenProps) {
  const t = useTranslations("ask");
  const tPicks = useTranslations("picks");
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [picks, setPicks] = useState<Array<{
    kind: string;
    external_id: string;
    source: string;
    name: string;
    release_year: number | null;
    poster_path: string | null;
    thumb_url: string | null;
  }>>([]);
  const [showPicks, setShowPicks] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ask/receipt", {
        headers: { "x-ask-token": token },
        cache: "no-store",
      });
      if (!res.ok) {
        setError(t("error.submit"));
        return;
      }
      const body = (await res.json()) as { items?: ReceiptRow[] };
      setRows(Array.isArray(body.items) ? body.items : []);
    } catch {
      setError(t("error.submit"));
    }
  }, [token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    fetch("/api/ask/picks", { headers: { "x-ask-token": token }, cache: "no-store" })
      .then(async (res) => {
        if (!active || !res.ok) return;
        const body = (await res.json()) as { items?: typeof picks };
        if (Array.isArray(body.items)) setPicks(body.items);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);

  async function deleteMine() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/ask/delete-me", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        setError(t("error.submit"));
        return;
      }
      setDeleted(true);
      setRows([]);
      onDeleted();
    } catch {
      setError(t("error.submit"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("sentTitle", { owner })}</h1>
      <h2 className="text-sm font-medium text-[var(--v2-text-muted)]">{t("receiptTitle")}</h2>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--v2-text-muted)]">{t("receiptEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const poster = posterFor(row.poster_path);
            return (
              <li
                key={row.item_id}
                className="flex items-start gap-3 rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-3"
              >
                <span aria-hidden="true" className="h-16 w-11 shrink-0 overflow-hidden rounded bg-[var(--v2-surface-raised)]">
                  {poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={poster} alt="" width={44} height={64} loading="lazy" />
                  ) : null}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.name ?? ""}</p>
                  <p className="text-xs text-[var(--v2-text-muted)]">
                    {row.year ?? ""}
                    {row.rating !== null ? ` · ${row.rating}%` : ""}
                    {row.platform_text ? ` · ${row.platform_text}` : ""}
                  </p>
                  {row.comment ? <p className="mt-1 text-sm">{row.comment}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Owner picks block (V2-W9-LIBRARY-1128-001) ── */}
      {picks.length > 0 && (
        <section className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-3" data-testid="owner-picks-block">
          <h2 className="text-sm font-medium">{tPicks("wantToSee", { owner })}</h2>
          {!showPicks ? (
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setShowPicks(true)} className="rounded-lg bg-[var(--v2-accent)] px-3 py-2 text-sm font-semibold text-[var(--v2-on-accent)]">
                {tPicks("yesShow")}
              </button>
              <button type="button" onClick={() => setPicks([])} className="rounded-lg border border-[var(--v2-border)] px-3 py-2 text-sm">
                {tPicks("noThanks")}
              </button>
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {picks.map((pick) => {
                const poster = posterFor(pick.poster_path) ?? pick.thumb_url;
                const href = pick.source === "tmdb" && pick.kind === "movie"
                  ? `https://www.themoviedb.org/movie/${pick.external_id}`
                  : pick.source === "tmdb" && pick.kind === "series"
                    ? `https://www.themoviedb.org/tv/${pick.external_id}`
                    : pick.kind === "video"
                      ? `https://www.youtube.com/watch?v=${pick.external_id}`
                      : pick.kind === "playlist"
                        ? `https://www.youtube.com/playlist?list=${pick.external_id}`
                        : null;
                return (
                  <li key={`${pick.source}:${pick.kind}:${pick.external_id}`} className="flex items-center gap-3 rounded-lg border border-[var(--v2-border)] p-2" data-testid="owner-pick">
                    <span aria-hidden="true" className="h-16 w-11 shrink-0 overflow-hidden rounded bg-[var(--v2-surface-raised)]">
                      {poster ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={poster} alt="" width={44} height={64} loading="lazy" />
                      ) : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{pick.name}</p>
                      <p className="text-xs text-[var(--v2-text-muted)]">
                        {pick.release_year ?? ""}{PICK_SEPARATOR}<span className="rounded border border-[var(--v2-border)] px-1">{pick.kind}</span>
                      </p>
                    </div>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={tPicks("openTitle", { title: pick.name })} className="text-sm text-[var(--v2-accent)]">
                        {EXTERNAL_LINK_ICON}
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      {/* ── Reserved gap: another session owns the “Make your own list” block ── */}

      {error ? (
        <p role="alert" className="text-sm text-[var(--v2-danger)]">
          {error}
        </p>
      ) : null}
      {deleted ? (
        <p role="status" className="text-sm text-[var(--v2-success)]">
          {t("deleted")}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onAddMore}
          className="rounded-xl bg-[var(--v2-accent)] px-4 py-2.5 text-base font-semibold text-[var(--v2-on-accent)]"
        >
          {t("addMore")}
        </button>
        <button
          type="button"
          disabled={deleting}
          onClick={() => {
            void deleteMine();
          }}
          className="rounded-xl border border-[var(--v2-border)] px-4 py-2.5 text-base text-[var(--v2-danger)] disabled:opacity-50"
        >
          {t("deleteData")}
        </button>
      </div>
    </section>
  );
}
