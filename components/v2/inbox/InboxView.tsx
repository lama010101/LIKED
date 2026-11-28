"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  getFriendRailAction,
  getInboxAction,
  markFriendSeenAction,
  type InboxFilters,
  type InboxSort,
} from "@/app/lib/actions/v2-owner";
import InboxCardView from "./InboxCard";
import DetailSheet from "./DetailSheet";
import FiltersSheet from "./FiltersSheet";
import FriendRail from "./FriendRail";
import ShareBar from "./ShareBar";
import { BellIcon, CloseIcon, GearIcon, ShareIcon } from "./icons";
import styles from "./inbox.module.css";
import { ROUTES, TESTID, UI } from "./ui-constants";
import {
  mergeCards,
  type AskRow,
  type FriendRail as FriendRailData,
  type InboxCard,
  type InboxPayload,
} from "./inbox-utils";

/** Owner inbox (PRD §6.2/§6.3, P0-16 + P0-17): top bar, the To watch tab with
 *  its count, the friend rail, the merged card list and its detail sheet. */
export default function InboxView({
  initial,
  initialRail,
  ask,
  unread,
}: {
  initial: InboxPayload;
  initialRail: FriendRailData;
  ask: AskRow;
  unread: number;
}) {
  const t = useTranslations("inbox");
  const [cards, setCards] = useState<InboxCard[]>(initial.cards);
  const [counts, setCounts] = useState(initial.counts);
  const [cursor, setCursor] = useState(initial.next_cursor);
  const [rail, setRail] = useState<FriendRailData>(initialRail);
  const [selected, setSelected] = useState<string | null>(null);
  const [askState, setAskState] = useState<AskRow>(ask);
  const [open, setOpen] = useState<InboxCard | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<InboxFilters>({});
  const [sort, setSort] = useState<InboxSort>("recent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedFriend = selected ? rail.friends.find((f) => f.contributor_id === selected) : null;

  const loadMore = async () => {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await getInboxAction({ friendId: selected, filters, sort, cursor });
      setCards((prev) => mergeCards(prev, page.cards));
      setCounts(page.counts);
      setCursor(page.next_cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const selectFriend = async (contributorId: string | null) => {
    if (busy) return;
    // Single-select: tapping the selected avatar (or All) clears the filter.
    const next = contributorId !== null && contributorId === selected ? null : contributorId;
    setBusy(true);
    setError(null);
    try {
      const page = await getInboxAction({ friendId: next, filters, sort });
      setCards(page.cards);
      setCounts(page.counts);
      setCursor(page.next_cursor);
      setSelected(next);
      // Opening a friend's filtered view marks that friend's submissions seen;
      // viewing All marks nothing (PRD §6.3).
      if (next !== null) {
        await markFriendSeenAction(next);
        setRail(await getFriendRailAction());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const activeFilterCount = [
    filters.platforms,
    filters.types,
    filters.decades,
    filters.languages,
    filters.genres,
  ].filter((values) => Array.isArray(values) && values.length > 0).length + (filters.multi_recommended ? 1 : 0);

  const platformOptions = [...new Set(cards.flatMap((card) => card.platforms))];

  const applyFilters = async (nextFilters: InboxFilters, nextSort: InboxSort) => {
    setBusy(true);
    setError(null);
    try {
      const page = await getInboxAction({ friendId: selected, filters: nextFilters, sort: nextSort });
      setCards(page.cards);
      setCounts(page.counts);
      setCursor(page.next_cursor);
      setFilters(nextFilters);
      setSort(nextSort);
      setFiltersOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const clearFilterCategory = (key: keyof InboxFilters) => {
    const next = { ...filters, [key]: Array.isArray(filters[key]) ? [] : false };
    void applyFilters(next, sort);
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


        <div className={styles.filterBar}>
          <button
            type={UI.button}
            onClick={() => setFiltersOpen(true)}
            className={styles.smallBtn}
            data-testid="filters-open"
          >
            {t("filters")}
            {activeFilterCount > 0 && <span className={styles.badge} data-testid="filters-badge">{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && (
            <div className={styles.chipRow} data-testid="active-filter-chips">
              {filters.platforms?.length ? <button type={UI.button} onClick={() => clearFilterCategory("platforms")} className={styles.filterChip}>{t("filterPlatform")}<CloseIcon /></button> : null}
              {filters.types?.length ? <button type={UI.button} onClick={() => clearFilterCategory("types")} className={styles.filterChip}>{t("filterType")}<CloseIcon /></button> : null}
              {filters.decades?.length ? <button type={UI.button} onClick={() => clearFilterCategory("decades")} className={styles.filterChip}>{t("filterDecade")}<CloseIcon /></button> : null}
              {filters.languages?.length ? <button type={UI.button} onClick={() => clearFilterCategory("languages")} className={styles.filterChip}>{t("filterLanguage")}<CloseIcon /></button> : null}
              {filters.genres?.length ? <button type={UI.button} onClick={() => clearFilterCategory("genres")} className={styles.filterChip}>{t("filterGenre")}<CloseIcon /></button> : null}
              {filters.multi_recommended ? <button type={UI.button} onClick={() => clearFilterCategory("multi_recommended")} className={styles.filterChip}>{t("filterMultiRecommended")}<CloseIcon /></button> : null}
            </div>
          )}
        </div>

        <FriendRail rail={rail} selected={selected} disabled={busy} onSelect={selectFriend} />

        {cards.length === 0 ? (
          <div className={styles.empty} data-testid={TESTID.empty}>
            <p className={styles.emptyText}>
              {selectedFriend ? t("emptyFriend", { name: selectedFriend.display_name }) : t("empty")}
            </p>
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

      {open && <DetailSheet card={open} onClose={() => setOpen(null)} />}
      {filtersOpen && (
        <FiltersSheet
          initialFilters={filters}
          initialSort={sort}
          platformOptions={platformOptions}
          onApply={applyFilters}
          onClose={() => setFiltersOpen(false)}
        />
      )}
      {shareOpen && (
        <ShareBar ask={askState} onAskChange={setAskState} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}
