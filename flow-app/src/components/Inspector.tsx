"use client";

import { useEffect, useState } from "react";
import { useFlow } from "@/store";
import { Aspect, thumbGradient } from "@/lib/mock";

const ASPECTS: Aspect[] = ["16:9", "9:16", "1:1", "4:3", "3:4"];

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Inspector content — used by the desktop right panel and the mobile sheet. */
export default function InspectorContent() {
  const card = useFlow((s) =>
    s.inspectorCardId ? s.cards.find((c) => c.id === s.inspectorCardId) : undefined
  );
  const collections = useFlow((s) => s.collections);
  const renameCard = useFlow((s) => s.renameCard);
  const updateCardParams = useFlow((s) => s.updateCardParams);
  const archiveCards = useFlow((s) => s.archiveCards);
  const openInspector = useFlow((s) => s.openInspector);
  const setMobileSheet = useFlow((s) => s.setMobileSheet);

  const [draft, setDraft] = useState("");
  useEffect(() => setDraft(card?.prompt ?? ""), [card?.id, card?.prompt]);

  if (!card) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-600">
        Select an asset to inspect its prompt history and parameters.
      </div>
    );
  }

  const g = thumbGradient(card.seed);
  const colName = card.collectionId
    ? collections.find((c) => c.id === card.collectionId)?.name ?? "—"
    : "None";

  const close = () => {
    openInspector(null);
    setMobileSheet(null);
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-100">Inspector</h2>
        <button
          type="button"
          onClick={close}
          aria-label="Close inspector"
          className="rounded-md p-1.5 text-zinc-500 hover:bg-raise hover:text-zinc-200"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3 stroke-current" fill="none" strokeWidth="1.5">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>

      <div
        className="relative h-36 w-full shrink-0 overflow-hidden rounded-lg border border-edge"
        style={{ background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }}
        role="img"
        aria-label={`Preview of ${card.prompt}`}
      >
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
          {card.model}
        </span>
        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px]">
          {card.kind === "video" ? `${card.durationSec}s video` : "image"}
        </span>
      </div>

      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Prompt
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-md border border-edge bg-ink p-2 text-sm text-zinc-200 outline-none focus:border-accent"
        />
      </label>
      <button
        type="button"
        disabled={draft.trim() === card.prompt || !draft.trim()}
        onClick={() => renameCard(card.id, draft.trim())}
        className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        Apply prompt revision
      </button>

      <section aria-label="Prompt history">
        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          Prompt history
        </h3>
        <ol className="flex flex-col gap-1">
          {[...card.history].reverse().map((h, i) => (
            <li
              key={`${h.ts}-${i}`}
              className="rounded-md border border-edge bg-ink/60 px-2 py-1.5 text-xs text-zinc-400"
            >
              <span className="block truncate text-zinc-300">{h.prompt}</span>
              <span className="text-[10px] text-zinc-600">{fmtDate(h.ts)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Parameters" className="flex flex-col gap-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          Parameters
        </h3>

        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Steps — {card.params.steps}
          <input
            type="range"
            min={10}
            max={60}
            value={card.params.steps}
            aria-label="Diffusion steps"
            onChange={(e) =>
              updateCardParams(card.id, { steps: Number(e.target.value) })
            }
            className="accent-[#7c8cf8]"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Seed
          <input
            type="number"
            value={card.params.seed}
            aria-label="Seed"
            onChange={(e) =>
              updateCardParams(card.id, {
                seed: Number(e.target.value) || 0,
              })
            }
            className="rounded-md border border-edge bg-ink p-1.5 text-sm text-zinc-200 outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Aspect ratio
          <select
            value={card.params.aspect}
            aria-label="Aspect ratio"
            onChange={(e) =>
              updateCardParams(card.id, { aspect: e.target.value as Aspect })
            }
            className="rounded-md border border-edge bg-ink p-1.5 text-sm text-zinc-200 outline-none focus:border-accent"
          >
            {ASPECTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section aria-label="Metadata">
        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          Metadata
        </h3>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-zinc-600">ID</dt>
          <dd className="truncate text-zinc-400">{card.id}</dd>
          <dt className="text-zinc-600">Model</dt>
          <dd className="text-zinc-400">{card.model}</dd>
          <dt className="text-zinc-600">Created</dt>
          <dd className="text-zinc-400">{fmtDate(card.createdAt)}</dd>
          <dt className="text-zinc-600">Collection</dt>
          <dd className="truncate text-zinc-400">{colName}</dd>
          <dt className="text-zinc-600">Status</dt>
          <dd className="text-zinc-400">{card.archived ? "Archived" : "Active"}</dd>
        </dl>
      </section>

      <button
        type="button"
        onClick={() => {
          archiveCards([card.id], !card.archived);
          close();
        }}
        className="rounded-md border border-edge px-3 py-2 text-xs text-zinc-400 hover:bg-raise hover:text-zinc-200"
      >
        {card.archived ? "Restore from archive" : "Archive asset"}
      </button>
    </div>
  );
}
