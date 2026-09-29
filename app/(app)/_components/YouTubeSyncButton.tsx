"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Modal from "./Modal";
import { setYoutubeConsentAction, getYoutubeConsentAction } from "@/app/lib/actions/mvp2";
import { runYouTubeImport } from "@/lib/youtube/runImport";
import { toast } from "@/lib/store/toastStore";

const SYNC_NEXT = "/feed?yt_sync=1";

/** Topbar YouTube sync (always visible): connected → import liked videos;
 *  not connected → consent modal (Q13) → OAuth → returns to ?yt_sync=1
 *  which auto-runs the import. */
export default function YouTubeSyncButton() {
  const t = useTranslations();
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const count = await runYouTubeImport();
      toast.success(`✓ ${count}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSyncing(false);
    }
  }, [router, t]);

  useEffect(() => {
    let live = true;
    fetch("/api/youtube/status")
      .then((r) => r.json())
      .then(async (b) => {
        if (!live) return;
        setConnected(!!b.connected);
        // Returned from OAuth with ?yt_sync=1 → run the import once.
        if (b.connected && new URLSearchParams(window.location.search).get("yt_sync") === "1") {
          await sync();
          router.replace("/feed");
        }
      })
      .catch(() => {});
    return () => { live = false; };
  }, [router, sync]);

  const connect = () => {
    window.location.href = `/api/youtube/connect?next=${encodeURIComponent(SYNC_NEXT)}`;
  };

  const onClick = async () => {
    if (syncing) return;
    if (connected) { await sync(); return; }
    try {
      if (await getYoutubeConsentAction()) connect();
      else setConsentOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const confirmConsent = async () => {
    try {
      await setYoutubeConsentAction(true);
      connect();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  return (
    <>
      <button
        className="icon-btn"
        onClick={onClick}
        disabled={syncing}
        aria-label={t("nav.youtubeSync")}
        title={t("nav.youtubeSync")}
      >
        <YouTubeIcon spinning={syncing} />
      </button>
      <Modal open={consentOpen} onClose={() => setConsentOpen(false)} title={t("youtube.consentTitle")}>
        <p>{t("youtube.consentBody")}</p>
        <div className="modal-actions">
          <button className="btn" onClick={() => setConsentOpen(false)}>{t("common.cancel")}</button>
          <button className="btn btn-primary" onClick={confirmConsent}>{t("youtube.consentConfirm")}</button>
        </div>
      </Modal>
    </>
  );
}

function YouTubeIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg className={spinning ? "icon-spin" : undefined} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="4" />
      <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
    </svg>
  );
}
