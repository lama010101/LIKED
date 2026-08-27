/**
 * friendBarToBottomBarItems — extracted from app/(app)/layout.tsx
 * Converts session user + friends + groups into BottomBarItem[] for the sidebar.
 */

import type { SessionUser } from "@/app/lib/actions/session";
import type { FriendBarEntry, GroupBarEntry } from "@/lib/db/friends";

export interface BottomBarItem {
  id: string;
  type: "me" | "friend" | "group";
  displayName: string;
  initial: string;
  bg: string;
  hasNew?: boolean;
  memberCount?: number;
  is_pending?: boolean;
  user_id?: string;
}

export function friendBarToBottomBarItems(
  sessionUser: SessionUser,
  friends: FriendBarEntry[],
  groups: GroupBarEntry[]
): BottomBarItem[] {
  const initial = (name: string | null) =>
    (name ?? "?").charAt(0).toUpperCase();

  const meItem: BottomBarItem = {
    id: sessionUser.id,
    type: "me",
    displayName: sessionUser.display_name ?? "Me",
    initial: initial(sessionUser.display_name),
    bg: "linear-gradient(135deg,#f5a623,#ff6b6b)",
  };

  const friendItems: BottomBarItem[] = friends.map((f) => ({
    id: f.user_id ?? f.to_email ?? Math.random().toString(),
    type: "friend",
    displayName: f.display_name ?? f.to_email ?? "Pending",
    initial: initial(f.display_name ?? f.to_email),
    bg: "linear-gradient(135deg,#4a9fd5,#1c6fa0)",
    hasNew: false,
    is_pending: f.is_pending,
    user_id: f.user_id ?? undefined,
  }));

  const groupItems: BottomBarItem[] = groups.map((g) => ({
    id: g.id,
    type: "group",
    displayName: g.name,
    initial: initial(g.name),
    bg: "linear-gradient(135deg,#7b3ad5,#4a1ca0)",
    memberCount: g.member_count,
  }));

  return [meItem, ...friendItems, ...groupItems];
}
