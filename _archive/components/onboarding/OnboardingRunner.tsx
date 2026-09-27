"use client";

/**
 * ONBOARD-001 — reduced-v1 onboarding runner + single-folder CTA.
 *
 * Flow (N3 ruling / COMPLETE-APP-002 amendments):
 *   1. Mounted once in the (app) shell. get_onboarding_state decides:
 *      backfilled/dismissed → nothing; no YouTube connection → silent skip.
 *   2. Background import: page through /api/youtube/likes, reusing the
 *      importYouTubeActivity action (import_url RPC is idempotent —
 *      UNIQUE(url, owner_id) → DUPLICATE_NODE → zero duplicate
 *      nodes/edges/causes on re-run or resume).
 *   3. onboarding_imported_at is set ONLY after the final page completes;
 *      an interrupted run simply resumes on next visit.
 *   4. CTA (feed only): one editable-name folder via create_folder_with_nodes.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getOnboardingState,
  setOnboardingFlag,
  createOnboardingFolder,
} from "@/app/lib/actions/onboarding";
import { importYouTubeActivity } from "@/app/lib/actions/youtubeImport";
import {
  shouldRunOnboardingImport,
  shouldShowOnboardingCta,
} from "@/lib/onboarding/predicates";
import { toast as showToast } from "@/lib/store/toastStore";

const PAGE_MAX_ATTEMPTS = 3; // bounded retries per likes page, then abort → resume next visit

interface LikesPage {
  videos?: { id: string; title?: string; description?: string; channelTitle?: string; categoryId?: string; thumbnail?: string }[];
  nextPageToken?: string | null;
}

async function fetchLikesPage(pageToken: string | null): Promise<LikesPage | null> {
  for (let attempt = 0; attempt < PAGE_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(
        `/api/youtube/likes${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ""}`
      );
      if (res.ok) return (await res.json()) as LikesPage;
    } catch {
      // network error → retry
    }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  return null;
}

export default function OnboardingRunner({
  onFolderCreated,
}: {
  onFolderCreated?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "importing" | "cta">("idle");
  const [importedCount, setImportedCount] = useState(0);
  const [folderName, setFolderName] = useState("My YouTube Likes");
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    // StrictMode dev double-mount: the throwaway first run is cancelled at its
    // next check; the second mount must be allowed to start. Re-running is
    // safe — import_url dedupes by UNIQUE(url, owner_id).
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    (async () => {
      const state = await getOnboardingState();
      if (!state || cancelled) return;

      if (!shouldRunOnboardingImport(state)) {
        // Import already done (possibly in a previous session) and the CTA
        // was never answered → resurface it on the feed.
        if (shouldShowOnboardingCta(state)) {
          setImportedCount(state.importCount);
          setPhase("cta");
        }
        return; // dismissed / pre-migration user / no YT connection → silent
      }

      setPhase("importing");
      let pageToken: string | null = null;
      let completedAllPages = false;

      for (;;) {
        const page = await fetchLikesPage(pageToken);
        if (!page) break; // page fetch exhausted retries → abort, resume next visit
        for (const v of page.videos ?? []) {
          if (cancelled) return;
          try {
            await importYouTubeActivity({
              url: `https://www.youtube.com/watch?v=${v.id}`,
              title: v.title ?? "",
              description: v.description ?? "",
              channelTitle: v.channelTitle ?? "",
              categoryId: v.categoryId ?? "",
              thumbnailUrl: v.thumbnail ?? null,
            });
          } catch {
            // per-item failure is non-fatal — continue with the next video
          }
        }
        if (!page.nextPageToken) {
          completedAllPages = true;
          break;
        }
        pageToken = page.nextPageToken;
      }

      if (cancelled) return;
      if (!completedAllPages) {
        setPhase("idle"); // interrupted → NOT marked imported; resumes next visit
        return;
      }

      await setOnboardingFlag("imported");
      const post = await getOnboardingState();
      if (cancelled) return;
      if (post && shouldShowOnboardingCta(post)) {
        setImportedCount(post.importCount);
        setPhase("cta");
      } else {
        setPhase("idle"); // zero likes imported → nothing to offer
      }
    })();

    return () => {
      cancelled = true;
      startedRef.current = false; // allow the (real or StrictMode) remount to run
    };
  }, []);

  const handleAccept = async () => {
    setBusy(true);
    const res = await createOnboardingFolder(folderName);
    setBusy(false);
    if (res.ok) {
      showToast.success(`Folder "${folderName.trim()}" created with ${res.count} videos.`);
      setPhase("idle");
      onFolderCreated?.();
      router.refresh();
    } else {
      showToast.error(res.error ?? "Could not create the folder.");
    }
  };

  const handleDismiss = async () => {
    setBusy(true);
    await setOnboardingFlag("dismissed");
    setBusy(false);
    setPhase("idle");
  };

  if (phase === "idle") return null;
  if (pathname !== "/feed") return null; // CTA + progress pill surface on the feed only

  if (phase === "importing") {
    return (
      <div
        data-testid="onboarding-importing"
        style={{
          margin: "12px 16px 0",
          padding: "10px 14px",
          borderRadius: 10,
          background: "var(--surface-1, #fff)",
          border: "1px solid var(--border-1, #e5e7eb)",
          fontSize: 13,
          color: "var(--text-2, #666)",
        }}
      >
        Importing your YouTube likes…
      </div>
    );
  }

  return (
    <div
      data-testid="onboarding-cta"
      style={{
        margin: "12px 16px 0",
        padding: 16,
        borderRadius: 12,
        background: "var(--surface-1, #fff)",
        border: "1px solid var(--border-1, #e5e7eb)",
        boxShadow: "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.08))",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1, #111)" }}>
        We imported {importedCount} liked {importedCount === 1 ? "video" : "videos"} from YouTube.
      </div>
      <div style={{ fontSize: 13, color: "var(--text-2, #666)" }}>
        Keep them together in a folder.
      </div>
      <input
        type="text"
        value={folderName}
        onChange={(e) => setFolderName(e.target.value)}
        aria-label="Folder name"
        style={{
          padding: "8px 10px",
          fontSize: 13,
          borderRadius: 8,
          border: "1px solid var(--border-1, #e5e7eb)",
          background: "var(--surface-2, #fafafa)",
          color: "var(--text-1, #111)",
        }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleAccept}
          disabled={busy || folderName.trim().length === 0}
          style={{
            padding: "8px 16px",
            background: "var(--accent, #7c5cfc)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
            opacity: busy || folderName.trim().length === 0 ? 0.6 : 1,
          }}
        >
          {busy ? "Creating…" : "Create folder"}
        </button>
        <button
          onClick={handleDismiss}
          disabled={busy}
          style={{
            padding: "8px 16px",
            background: "var(--surface-3, #f5f5f5)",
            color: "var(--text-2, #666)",
            border: "1px solid var(--border-1, #e5e7eb)",
            borderRadius: 8,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
