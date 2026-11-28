"use client";

import { useTranslations } from "next-intl";
import styles from "./inbox.module.css";
import { TESTID, UI } from "./ui-constants";
import { unseenTotal, type FriendRail as FriendRailData } from "./inbox-utils";

/** Friend rail (PRD §6.3, P0-17): first item All, then one avatar per
 *  contributor ordered by most recent submission. Each friend shows a count
 *  badge (hidden at 0) plus the ring; All shows the sum. Single-select:
 *  tapping the selected avatar clears the filter. Opening a friend's filtered
 *  view marks that friend's submissions seen (handled by the parent). */
export default function FriendRail({
  rail,
  selected,
  disabled,
  onSelect,
}: {
  rail: FriendRailData;
  selected: string | null;
  disabled: boolean;
  onSelect: (contributorId: string | null) => void;
}) {
  const t = useTranslations("inbox");
  const all = unseenTotal(rail.friends);
  const allRing = all > 0 ? `${styles.railRing} ${styles.railRingUnseen}` : styles.railRing;

  return (
    <div className={styles.rail} data-testid={TESTID.rail}>
      <button
        type={UI.button}
        onClick={() => onSelect(null)}
        disabled={disabled}
        aria-label={t("railAllLabel", { count: all })}
        aria-pressed={selected === null}
        data-testid={TESTID.railAll}
        data-all-unseen={all}
        className={styles.railItem}
      >
        <span className={allRing}>
          <span className={selected === null ? `${styles.railAvatar} ${styles.railAvatarSelected}` : styles.railAvatar}>
            {t("railAll")}
          </span>
          {all > 0 && (
            <span className={styles.railBadge} data-testid={TESTID.railBadge}>
              {all}
            </span>
          )}
        </span>
        <span className={selected === null ? `${styles.railName} ${styles.railNameSelected}` : styles.railName}>
          {t("railAll")}
        </span>
      </button>

      {rail.friends.map((f) => {
        const isSelected = selected === f.contributor_id;
        const ring = f.unseen_count > 0 ? `${styles.railRing} ${styles.railRingUnseen}` : styles.railRing;
        const avatar = isSelected ? `${styles.railAvatar} ${styles.railAvatarSelected}` : styles.railAvatar;
        const name = isSelected ? `${styles.railName} ${styles.railNameSelected}` : styles.railName;
        return (
          <button
            key={f.contributor_id}
            type={UI.button}
            onClick={() => onSelect(f.contributor_id)}
            disabled={disabled}
            aria-label={t("railFriendLabel", { name: f.display_name, count: f.unseen_count })}
            aria-pressed={isSelected}
            data-testid={TESTID.railFriend}
            data-contributor-id={f.contributor_id}
            data-unseen={f.unseen_count}
            className={styles.railItem}
          >
            <span className={ring}>
              <span className={avatar}>{initials(f.display_name)}</span>
              {f.unseen_count > 0 && (
                <span className={styles.railBadge} data-testid={TESTID.railBadge}>
                  {f.unseen_count}
                </span>
              )}
            </span>
            <span className={name}>{f.display_name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Same initials rule the RPC uses for card avatars (first letters of the
 *  first two words, upper case). */
export function initials(name: string): string {
  const words = name.trim().replace(/\s+/g, " ").split(" ");
  return (words[0]?.[0] ?? "").toUpperCase() + (words[1]?.[0] ?? "").toUpperCase();
}
