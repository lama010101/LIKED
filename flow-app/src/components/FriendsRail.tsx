"use client";

import { FRIENDS, Friend } from "@/lib/mock";
import { useFlow } from "@/store";

/** Count of cards shared by a friend (or a group's members). */
function useFriendCounts(): (f: Friend) => number {
  const cards = useFlow((s) => s.cards);
  return (f) =>
    f.isGroup
      ? cards.filter((c) => f.memberIds?.includes(c.sharedBy)).length
      : cards.filter((c) => c.sharedBy === f.id).length;
}

function Avatar({
  label,
  initials,
  from,
  to,
  active,
  count,
  isGroup,
  accentRing,
  mobile,
  onClick,
}: {
  label: string;
  initials: string;
  from: string;
  to: string;
  active: boolean;
  count?: number;
  isGroup?: boolean;
  accentRing?: boolean;
  mobile?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Show assets from ${label}`}
      className={`group flex shrink-0 flex-col items-center gap-1 ${
        mobile ? "min-h-[48px] min-w-[56px]" : "min-w-[52px]"
      }`}
    >
      <span
        className={`relative rounded-full p-[2.5px] transition-transform ${
          active ? "scale-105" : "opacity-70 group-hover:opacity-100"
        }`}
        style={{
          background: accentRing
            ? "linear-gradient(135deg, #7c8cf8, #a78bfa)"
            : `linear-gradient(135deg, ${from}, ${to})`,
        }}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink bg-raise text-xs font-semibold text-zinc-200">
          {initials}
        </span>

        {/* group-chat badge */}
        {isGroup && (
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-ink bg-faint"
            title="Group chat"
          >
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-zinc-200" aria-hidden>
              <circle cx="3" cy="4" r="2" />
              <circle cx="9" cy="4" r="2" />
              <path d="M1 10a2.5 2.5 0 0 1 4-2 2.5 2.5 0 0 1 4 2 2.5 2.5 0 0 1 4 0z" />
            </svg>
          </span>
        )}

        {/* count badge */}
        {typeof count === "number" && count > 0 && (
          <span className="absolute -right-1 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-ink bg-accent px-0.5 text-[9px] font-semibold text-white">
            {count}
          </span>
        )}
      </span>
      <span
        className={`max-w-[60px] truncate text-[10px] leading-tight ${
          active ? "text-zinc-100" : "text-zinc-500"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

/** Stories-style horizontal avatar rail — filters the canvas by sharedBy. */
export default function FriendsRail({ mobile = false }: { mobile?: boolean }) {
  const activeFriend = useFlow((s) => s.activeFriend);
  const setActiveFriend = useFlow((s) => s.setActiveFriend);
  const countFor = useFriendCounts();

  const toggle = (id: string) =>
    setActiveFriend(activeFriend === id ? "me" : id);

  return (
    <div
      className="no-scrollbar flex items-start gap-3 overflow-x-auto border-b border-edge bg-panel px-3 py-2"
      role="toolbar"
      aria-label="Filter by person"
    >
      <Avatar
        label="You"
        initials="You"
        from="#7c8cf8"
        to="#a78bfa"
        accentRing
        active={activeFriend === "me"}
        mobile={mobile}
        onClick={() => setActiveFriend("me")}
      />
      {FRIENDS.map((f) => (
        <Avatar
          key={f.id}
          label={f.name}
          initials={f.initials}
          from={f.from}
          to={f.to}
          isGroup={f.isGroup}
          count={countFor(f)}
          active={activeFriend === f.id}
          mobile={mobile}
          onClick={() => toggle(f.id)}
        />
      ))}
    </div>
  );
}
