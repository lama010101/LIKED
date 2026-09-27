"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Modal from "../../_components/Modal";
import { setYoutubeConsentAction } from "@/app/lib/actions/mvp2";
import { importYouTubeActivity } from "@/app/lib/actions/youtubeImport";
import { toast } from "@/lib/store/toastStore";

/**
 * YouTube (Phase 7): incremental consent (Q13) — the OAuth redirect to
 * /api/youtube/connect (youtube.readonly scope) only happens AFTER the
 * user confirms the in-app consent modal; consent is persisted via
 * set_youtube_import_consent. Import pulls liked videos → YouTube folder.
 */
export default function YouTubeView({ consent }: { consent: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [consentOpen, setConsentOpen] = useState(false);
  const [hasConsent, setHasConsent] = useState(consent);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/youtube/status")
      .then((r) => r.json())
      .then((b) => { setConnected(!!b.connected); setEmail(b.email ?? null); })
      .catch(() => {});
    // OAuth errors land on /feed?youtube_error=… — keep simple: read here too
    if (typeof window !== "undefined") {
      const err = new URLSearchParams(window.location.search).get("youtube_error");
      if (err) toast.error(err.replaceAll("_", " "));
    }
  }, []);

  const confirmConsent = async () => {
    try {
      await setYoutubeConsentAction(true);
      setHasConsent(true);
      // NOW start OAuth (readonly scope, explicit user opt-in — Q13)
      window.location.href = "/api/youtube/connect";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const runImport = async () => {
    setImporting(true);
    setProgress(null);
    try {
      let pageToken: string | undefined;
      let count = 0;
      do {
        const res = await fetch(`/api/youtube/likes${pageToken ? `?pageToken=${pageToken}` : ""}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `likes fetch failed (${res.status})`);
        for (const v of body.videos ?? []) {
          await importYouTubeActivity({
            url: `https://www.youtube.com/watch?v=${v.id}`,
            title: v.title ?? "",
            description: v.description ?? "",
            channelTitle: v.channelTitle ?? "",
            categoryId: v.categoryId ?? "",
            thumbnailUrl: v.thumbnail ?? null,
          }).catch(() => {});
          count += 1;
          setProgress(`${count}`);
        }
        pageToken = body.nextPageToken;
      } while (pageToken);
      toast.success(`✓ ${count}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="yt-view">
      <h1 className="sec-title">{t("youtube.title")}</h1>

      <section className="me-card">
        {connected ? (
          <>
            <p>{t("youtube.connected")}{email ? ` — ${email}` : ""}</p>
            <div className="folder-actions">
              <button className="btn btn-primary" onClick={runImport} disabled={importing}>
                {importing ? `${t("youtube.importing")} ${progress ?? ""}` : t("youtube.import")}
              </button>
              <Link className="btn" href="/organize">{t("youtube.organizeCta")}</Link>
            </div>
          </>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => (hasConsent ? (window.location.href = "/api/youtube/connect") : setConsentOpen(true))}
          >
            {t("youtube.consentTitle")}
          </button>
        )}
      </section>

      <Modal open={consentOpen} onClose={() => setConsentOpen(false)} title={t("youtube.consentTitle")}>
        <p>{t("youtube.consentBody")}</p>
        <div className="modal-actions">
          <button className="btn" onClick={() => setConsentOpen(false)}>{t("common.cancel")}</button>
          <button className="btn btn-primary" onClick={confirmConsent}>{t("youtube.consentConfirm")}</button>
        </div>
      </Modal>
    </div>
  );
}
