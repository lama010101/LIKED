"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { getInboxAction } from "@/app/lib/actions/v2-owner";
import InboxCardView from "./InboxCard";
import DetailSheet from "./DetailSheet";
import ShareBar from "./ShareBar";
import { BellIcon, GearIcon, ShareIcon } from "./icons";
import styles from "./inbox.module.css";
import { ROUTES, TESTID, UI } from "./ui-constants";
import {
  mergeCards,
  type AskRow,
  type InboxCard,
  type InboxPayload,
} from "./inbox-utils";

/** Owner inbox (PRD §6.2, P0 scope): top bar, the To watch tab with its count,
 *  the merged card list and its detail sheet. The friend rail is P0-17 and
 *  lands in its own change. */
export default function InboxView({
  initial,
  ask,
  region,
  unread,
}: {
  initial: InboxPayload;
  ask: AskRow;
  region: string;
  unread: number;
}) {
  const t = useTranslations("inbox");
  const [cards, setCards] = useState<InboxCard[]>(initial.cards);
  const [counts, setCounts] = useState(initial.counts);
  const [cursor, setCursor] = useState(initial.next_cursor);
  const [askState, setAskState] = useState<AskRow>(ask);
  const [open, setOpen] = useState<InboxCard | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = async () => {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await getInboxAction({ cursor });
      setCards((prev) => mergeCards(prev, page.cards));
      setCounts(page.counts);
      setCursor(page.next_cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local brand asset */}
          <img src={ROUTES.logo} alt={t("logoAlt")} className={styles.logo} />
          <h1 className={styles.title}>{t("title")}</h1>
          <button
            type={UI.button}
            onClick={() => setShareOpen(true)}
            data-testid={TESTID.shareButton}
            className={styles.shareBtn}
          >
            <ShareIcon />
            <span className={styles.shareLabel}>{t("shareLink")}</span>
          </button>
          <Link href={ROUTES.settings} aria-label={t("settings")} className={styles.iconBtn}>
            <GearIcon />
          </Link>
          <Link
            href={ROUTES.notifications}
            aria-label={t("notifications")}
            className={styles.bellWrap}
          >
            <span className={styles.iconBtn}>
              <BellIcon />
            </span>
            {unread > 0 && (
              <span className={styles.badge} data-testid={TESTID.unreadCount}>
                {unread}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.tabs} role={UI.tablist} aria-label={t("title")}>
          <button
            type={UI.button}
            role={UI.tab}
            aria-selected={UI.true}
            data-testid={TESTID.tabToWatch}
            className={styles.tabActive}
          >
            {t("toWatch")} <span className={styles.tabCount} data-testid={TESTID.tabCount}>{counts.to_watch}</span>
          </button>
        </div>

        {cards.length === 0 ? (
          <div className={styles.empty} data-testid={TESTID.empty}>
            <p className={styles.emptyText}>{t("empty")}</p>
            <button type={UI.button} onClick={() => setShareOpen(true)} className={styles.cta}>
              {t("shareLink")}
            </button>
          </div>
        ) : (
          <ul className={styles.list} data-testid={TESTID.list}>
            {cards.map((card) => (
              <li key={card.item_id}>
                <InboxCardView card={card} onOpen={setOpen} />
              </li>
            ))}
          </ul>
        )}

        {cursor && (
          <div className={styles.loadMoreWrap}>
            <button
              type={UI.button}
              onClick={loadMore}
              disabled={busy}
              data-testid={TESTID.loadMore}
              className={styles.loadMore}
            >
              {busy ? t("loading") : t("loadMore")}
            </button>
          </div>
        )}

        {error && (
          <p role={UI.alert} className={styles.errorText}>
            {error}
          </p>
        )}
      </main>

      {open && <DetailSheet card={open} region={region} onClose={() => setOpen(null)} />}
      {shareOpen && (
        <ShareBar ask={askState} onAskChange={setAskState} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}
