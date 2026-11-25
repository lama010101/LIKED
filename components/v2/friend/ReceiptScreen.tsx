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

function posterFor(path: string | null): string | null {
  return path && /^\/[A-Za-z0-9._-]+$/.test(path) ? `${TMDB_IMAGE_BASE}${path}` : null;
}

export default function ReceiptScreen({ token, owner, onAddMore, onDeleted }: ReceiptScreenProps) {
  const t = useTranslations("ask");
  const [rows, setRows] = useState<ReceiptRow[]>([]);
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
