"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getGenreCatalogAction,
  type GenreOption,
  type InboxFilters,
  type InboxSort,
} from "@/app/lib/actions/v2-owner";
import { toast } from "@/lib/store/toastStore";
import { CloseIcon } from "./icons";
import styles from "./inbox.module.css";
import { UI } from "./ui-constants";

const TYPE_VALUES = ["movie", "series", "documentary", "youtube"];
const DECADE_VALUES = [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950];
const LANGUAGE_VALUES = ["en", "fr", "es", "th", "ja", "ko", "de", "it", "pt", "zh", "hi"];
const SORT_VALUES: InboxSort[] = ["recent", "most_recommended", "friend_score", "release_date", "tmdb_score"];

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

/** PRD §6.4: one sheet containing filters and sort. All list reduction is
 *  delegated to get_inbox; this component only edits RPC parameters. */
export default function FiltersSheet({
  initialFilters,
  initialSort,
  platformOptions,
  onApply,
  onClose,
}: {
  initialFilters: InboxFilters;
  initialSort: InboxSort;
  platformOptions: string[];
  onApply: (filters: InboxFilters, sort: InboxSort) => void;
  onClose: () => void;
}) {
  const t = useTranslations("inbox");
  const [filters, setFilters] = useState<InboxFilters>(initialFilters);
  const [sort, setSort] = useState<InboxSort>(initialSort);
  const [genres, setGenres] = useState<GenreOption[]>([]);

  useEffect(() => {
    let live = true;
    getGenreCatalogAction()
      .then((rows) => {
        if (live) setGenres(rows);
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : t("error"));
      });
    return () => {
      live = false;
    };
  }, [t]);

  const platforms = useMemo(() => {
    const all = new Set(["youtube", ...platformOptions.filter(Boolean)]);
    return [...all].sort((a, b) => a.localeCompare(b));
  }, [platformOptions]);

  const setArray = (
    key: "platforms" | "types" | "decades" | "languages" | "genres",
    value: string | number,
  ) => {
    setFilters((current) => {
      const existing = (current[key] ?? []) as unknown[];
      const next = toggle(existing, value as unknown);
      return { ...current, [key]: next } as InboxFilters;
    });
  };

  const chip = (
    key: string,
    label: string,
    selected: boolean,
    onClick: () => void,
  ) => (
    <button
      key={key}
      type={UI.button}
      aria-pressed={selected}
      onClick={onClick}
      className={selected ? styles.genreSelected : styles.genreOption}
      data-testid={`filter-${key}`}
    >
      {label}
    </button>
  );

  return (
    <div className={styles.modalOverlay} onClick={onClose} data-testid="filters-sheet">
      <div
        role={UI.dialog}
        aria-modal={UI.true}
        aria-labelledby="inbox-filters-title"
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2 id="inbox-filters-title" className={styles.modalTitle}>
            {t("filtersTitle")}
          </h2>
          <button type={UI.button} onClick={onClose} aria-label={t("close")} className={styles.closeBtn}>
            <CloseIcon />
          </button>
        </div>

        <section className={styles.filterSection}>
          <h3 className={styles.filterHeading}>{t("sortLabel")}</h3>
          <div className={styles.genreGrid}>
            {SORT_VALUES.map((value) =>
              chip(`sort-${value}`, t(`sort_${value}`), sort === value, () => setSort(value)),
            )}
          </div>
        </section>

        <section className={styles.filterSection}>
          <h3 className={styles.filterHeading}>{t("filterPlatform")}</h3>
          <div className={styles.genreGrid}>
            {platforms.map((value) =>
              chip(`platform-${value}`, value === "youtube" ? t("typeYoutube") : value, (filters.platforms ?? []).includes(value), () => setArray("platforms", value)),
            )}
          </div>
        </section>

        <section className={styles.filterSection}>
          <h3 className={styles.filterHeading}>{t("filterType")}</h3>
          <div className={styles.genreGrid}>
            {TYPE_VALUES.map((value) =>
              chip(`type-${value}`, t(value === "movie" ? "typeMovie" : value === "series" ? "typeSeries" : value === "documentary" ? "typeDocumentary" : "typeYoutube"), (filters.types ?? []).includes(value), () => setArray("types", value)),
            )}
          </div>
        </section>

        <section className={styles.filterSection}>
          <h3 className={styles.filterHeading}>{t("filterDecade")}</h3>
          <div className={styles.genreGrid}>
            {DECADE_VALUES.map((value) =>
              chip(`decade-${value}`, `${value}s`, (filters.decades ?? []).includes(value), () => setArray("decades", value)),
            )}
          </div>
        </section>

        <section className={styles.filterSection}>
          <h3 className={styles.filterHeading}>{t("filterLanguage")}</h3>
          <div className={styles.genreGrid}>
            {LANGUAGE_VALUES.map((value) =>
              chip(`language-${value}`, value, (filters.languages ?? []).includes(value), () => setArray("languages", value)),
            )}
          </div>
        </section>

        <section className={styles.filterSection}>
          <h3 className={styles.filterHeading}>{t("filterGenre")}</h3>
          <div className={styles.genreGrid} data-testid="filter-genre-options">
            {genres.map((genre) =>
              chip(`genre-${genre.id}`, genre.name, (filters.genres ?? []).includes(`tmdb:${genre.id}`), () => setArray("genres", `tmdb:${genre.id}`)),
            )}
          </div>
        </section>

        <section className={styles.filterSection}>
          <button
            type={UI.button}
            aria-pressed={Boolean(filters.multi_recommended)}
            onClick={() => setFilters((current) => ({ ...current, multi_recommended: !current.multi_recommended }))}
            className={filters.multi_recommended ? styles.genreSelected : styles.genreOption}
            data-testid="filter-multi-recommended"
          >
            {t("filterMultiRecommended")}
          </button>
        </section>

        <div className={styles.actions}>
          <button
            type={UI.button}
            onClick={() => {
              setFilters({});
              setSort("recent");
            }}
            className={styles.secondaryBtn}
            data-testid="filters-clear"
          >
            {t("clearAll")}
          </button>
          <button
            type={UI.button}
            onClick={() => onApply(filters, sort)}
            className={styles.primaryBtn}
            data-testid="filters-apply"
          >
            {t("applyFilters")}
          </button>
        </div>
      </div>
    </div>
  );
}
