"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Modal from "../../_components/Modal";
import ProgressModal from "../../_components/ProgressModal";
import Crumbs from "../../_components/Crumbs";
import { setYoutubeConsentAction } from "@/app/lib/actions/mvp2";
import { runYouTubeImport } from "@/lib/youtube/runImport";
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
  const [progOpen, setProgOpen] = useState(false);
  const stopRef = useRef(false);

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
    stopRef.current = false;
    setProgOpen(true);
    try {
      const { count, nodeIds } = await runYouTubeImport((n) => setProgress(`${n}`), () => stopRef.current);
      toast.success(`✓ ${count}`);
      // Fire-and-forget: theme/channel classification for grouped search.
      if (nodeIds.length > 0) {
        fetch("/api/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ node_ids: nodeIds }),
        }).catch(() => {});
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setImporting(false);
      setProgOpen(false);
    }
  };

  return (
    <div className="yt-view">
      <Crumbs items={[{ href: "/feed", label: t("nav.home") }, { label: t("nav.youtube") }]} />
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
      <ProgressModal
        open={progOpen && importing}
        onClose={() => setProgOpen(false)}
        onCancel={() => { stopRef.current = true; }}
        title={t("youtube.progressTitle")}
        text={t("youtube.progressCount", { count: Number(progress ?? 0) })}
      />
    </div>
  );
}
