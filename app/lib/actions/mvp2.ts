"use server";

/**
 * MVP2 server actions — thin session-client wrappers over the Phase 2/3
 * SECURITY DEFINER RPCs. No business logic here: the RPCs own visibility,
 * permissions, and multi-row atomicity. Every call runs as auth.uid().
 */

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale, type Locale } from "@/i18n/locales";

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<unknown>;

async function sessionRpc(): Promise<Rpc> {
  const supabase = await getSupabaseServerClient();
  return async (fn, args) => {
    const { data, error } = await (supabase as unknown as {
      rpc: (f: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    }).rpc(fn, args);
    if (error) throw new Error(error.message);
    return data;
  };
}

export interface Mvp2Folder {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  owner_name: string;
  parent_folder_id: string | null;
  color_hex: string | null;
  system_kind: string | null;
  created_at: string;
  my_permission: string;
  is_shared: boolean;
  node_count: number;
  thumbnails: { th: string }[] | string[];
}

// ── reads ──────────────────────────────────────────────────────

export async function getFoldersAction(opts?: {
  parentId?: string | null;
  search?: string | null;
  tagIds?: string[] | null;
  friendId?: string | null;
  sort?: "created" | "alpha" | "name" | null;
}): Promise<Mvp2Folder[]> {
  const rpc = await sessionRpc();
  return (await rpc("get_folders", {
    p_parent_folder_id: opts?.parentId ?? null,
    p_search: opts?.search ?? null,
    p_tag_ids: opts?.tagIds ?? null,
    p_friend_id: opts?.friendId ?? null,
    p_sort: opts?.sort === "created" ? "created" : "name",
  })) as Mvp2Folder[];
}

/** Card → folder map for feed chips (UX-BATCH-004). Reads folder_edges
 *  via the session client (RLS allows any authenticated user). */
export async function getNodeFoldersAction(nodeIds: string[]): Promise<Record<string, string>> {
  const { getFoldersForNodes } = await import("@/lib/db/folders");
  return getFoldersForNodes(nodeIds);
}

export interface Mvp2FolderDetail extends Mvp2Folder {
  breadcrumb: { id: string; name: string }[];
  children: { id: string; name: string; color_hex: string | null; system_kind: string | null }[];
  node_ids: string[];
}

export async function getFolderAction(folderId: string): Promise<Mvp2FolderDetail | null> {
  const rpc = await sessionRpc();
  const rows = (await rpc("get_folder", { p_folder_id: folderId })) as Mvp2FolderDetail[];
  return rows?.[0] ?? null;
}

export interface AccessEntry {
  grantee_id?: string;
  user_id?: string;
  cause_id?: string;
  display_name: string;
  avatar_key: string | null;
  permission: string;
}

export async function getFolderAccessAction(folderId: string): Promise<AccessEntry[]> {
  const rpc = await sessionRpc();
  return (await rpc("get_folder_access", { p_folder_id: folderId }).catch(() => [])) as AccessEntry[];
}

export async function getNodeAccessAction(nodeId: string): Promise<AccessEntry[]> {
  const rpc = await sessionRpc();
  return (await rpc("get_node_access", { p_node_id: nodeId }).catch(() => [])) as AccessEntry[];
}

export async function changeNodePermissionAction(causeId: string, permission: string) {
  const rpc = await sessionRpc();
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  await rpc("change_node_permission", {
    p_cause_id: causeId, p_requesting_user_id: user?.id ?? null, p_new_permission: permission,
  });
}

export async function unshareNodeAction(causeId: string) {
  const rpc = await sessionRpc();
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  await rpc("unshare", { p_cause_id: causeId, p_requesting_user_id: user?.id ?? null });
}

export interface TrashItem {
  item_type: "node" | "folder";
  id: string;
  title: string | null;
  thumbnail_key: string | null;
  trash_batch_id: string | null;
  deleted_at: string;
}

export async function getTrashItemsAction(): Promise<TrashItem[]> {
  const rpc = await sessionRpc();
  return (await rpc("get_trash_items")) as TrashItem[];
}

export interface NotificationRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export async function listNotificationsAction(limit = 50, before?: string): Promise<NotificationRow[]> {
  const rpc = await sessionRpc();
  return (await rpc("list_notifications", { p_limit: limit, p_before: before ?? null })) as NotificationRow[];
}

export interface OrganizeBatchRow {
  id: string;
  source_folder_id: string;
  source_folder_name: string;
  status: string;
  item_count: number;
  proposed_count: number;
  created_at: string;
}

export interface OrganizeItemRow {
  item_id: string;
  node_id: string;
  node_title: string | null;
  node_thumbnail: string | null;
  status: string;
  target_folder_id: string | null;
  target_folder_name: string | null;
  new_folder_name: string | null;
  tag_labels: string[];
  reason: string | null;
}

export async function getOrganizeBatchesAction(): Promise<OrganizeBatchRow[]> {
  const rpc = await sessionRpc();
  return (await rpc("get_organize_batches")) as OrganizeBatchRow[];
}

export async function getOrganizeBatchAction(batchId: string): Promise<OrganizeItemRow[]> {
  const rpc = await sessionRpc();
  return (await rpc("get_organize_batch", { p_batch_id: batchId })) as OrganizeItemRow[];
}

// ── folder writes ──────────────────────────────────────────────

export async function createFolderAction(input: { name: string; parentId?: string | null; color?: string | null; description?: string | null }) {
  const rpc = await sessionRpc();
  const id = await rpc("create_folder", {
    p_name: input.name, p_parent_folder_id: input.parentId ?? null,
    p_color_hex: input.color ?? null, p_description: input.description ?? null,
  });
  revalidatePath("/feed");
  return id as string;
}

export async function moveFolderAction(folderId: string, newParentId: string | null) {
  const rpc = await sessionRpc();
  await rpc("move_folder", { p_folder_id: folderId, p_new_parent_id: newParentId });
  revalidatePath("/feed");
}

export async function renameFolderAction(folderId: string, name: string) {
  const rpc = await sessionRpc();
  await rpc("rename_folder", { p_folder_id: folderId, p_name: name });
  revalidatePath("/feed");
}

export async function setFolderDetailsAction(folderId: string, description: string | null, color: string | null) {
  const rpc = await sessionRpc();
  await rpc("set_folder_details", { p_folder_id: folderId, p_description: description, p_color_hex: color });
  revalidatePath("/feed");
}

export async function addNodeToFolderAction(nodeId: string, folderId: string) {
  const rpc = await sessionRpc();
  await rpc("add_node_to_folder", { p_node_id: nodeId, p_folder_id: folderId });
  revalidatePath("/feed");
}

export async function removeNodeFromFolderAction(nodeId: string, folderId: string) {
  const rpc = await sessionRpc();
  await rpc("remove_node_from_folder", { p_node_id: nodeId, p_folder_id: folderId });
  revalidatePath("/feed");
}

export async function moveNodeToFolderAction(nodeId: string, fromFolderId: string | null, toFolderId: string | null) {
  const rpc = await sessionRpc();
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  await rpc("move_node_to_folder", {
    p_node_id: nodeId, p_target_folder_id: toFolderId,
    p_source_folder_id: fromFolderId, p_user_id: user?.id ?? null,
  });
  revalidatePath("/feed");
}

/** Move a card to a folder — files it out of every folder it is currently in
 *  (single-membership app convention). One move_node_everywhere RPC — the
 *  whole add+remove runs in a single transaction (AUDIT-09 P3-5). */
export async function moveNodeEverywhereAction(nodeId: string, targetFolderId: string) {
  const rpc = await sessionRpc();
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  await rpc("move_node_everywhere", {
    p_node_id: nodeId, p_target_folder_id: targetFolderId,
    p_user_id: user?.id ?? null,
  });
  revalidatePath("/feed");
}

// ── sharing ────────────────────────────────────────────────────
// Group targets are expanded client-side (read) into member ids — the RPC
// expands them to snapshot edges (Q3/Q4). share_folder_v2 takes one
// p_group_id per call; multiple groups loop.

export async function shareFolderV2Action(folderId: string, permission: string, userIds: string[], groupIds: string[], allFriends: boolean) {
  const rpc = await sessionRpc();
  // group shares go through p_group_id (snapshot expansion inside the RPC)
  for (const gid of groupIds) {
    await rpc("share_folder_v2", {
      p_folder_id: folderId, p_permission: permission,
      p_target_user_ids: null, p_all_friends: false, p_group_id: gid,
    });
  }
  if (userIds.length > 0 || allFriends) {
    await rpc("share_folder_v2", {
      p_folder_id: folderId, p_permission: permission,
      p_target_user_ids: userIds.length > 0 ? userIds : null, p_all_friends: allFriends, p_group_id: null,
    });
  }
  revalidatePath("/feed");
}

export async function shareNodeAction(nodeId: string, permission: string, userIds: string[], groupIds: string[], allFriends: boolean) {
  const rpc = await sessionRpc();
  // expand each group's members into the user set (snapshot semantics)
  const expanded = new Set(userIds);
  for (const gid of groupIds) {
    const members = (await rpc("get_group_access_users", { p_group_id: gid }).catch(() => [])) as { user_id: string }[];
    members.forEach((m) => expanded.add(m.user_id));
  }
  await rpc("share_node", {
    p_node_id: nodeId, p_permission: permission,
    p_target_user_ids: expanded.size > 0 ? [...expanded] : null, p_all_friends: allFriends,
  });
  revalidatePath("/feed");
}

export async function revokeFolderGrantAction(folderId: string, granteeId: string) {
  const rpc = await sessionRpc();
  await rpc("revoke_folder_grant", { p_folder_id: folderId, p_grantee_id: granteeId });
  revalidatePath("/feed");
}

export async function setFolderGrantPermissionAction(folderId: string, granteeId: string, permission: string) {
  const rpc = await sessionRpc();
  await rpc("set_folder_grant_permission", { p_folder_id: folderId, p_grantee_id: granteeId, p_permission: permission });
  revalidatePath("/feed");
}

// ── trash ──────────────────────────────────────────────────────

export async function trashFolderAction(folderId: string) {
  const rpc = await sessionRpc();
  await rpc("trash_folder", { p_folder_id: folderId });
  revalidatePath("/feed");
  revalidatePath("/trash");
}

export async function restoreFolderAction(folderId: string) {
  const rpc = await sessionRpc();
  await rpc("restore_folder", { p_folder_id: folderId });
  revalidatePath("/trash");
}

export async function hardDeleteFolderAction(folderId: string) {
  const rpc = await sessionRpc();
  await rpc("hard_delete_folder", { p_folder_id: folderId });
  revalidatePath("/trash");
}

export async function restoreNodeAction(nodeId: string) {
  const rpc = await sessionRpc();
  await rpc("restore_node", { p_node_id: nodeId });
  revalidatePath("/trash");
}

export async function trashNodeAction(nodeId: string) {
  const rpc = await sessionRpc();
  await rpc("set_node_deleted", { p_node_id: nodeId, p_deleted: true });
  revalidatePath("/feed");
  revalidatePath("/trash");
}

export async function hardDeleteNodeAction(nodeId: string) {
  const rpc = await sessionRpc();
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  await rpc("hard_delete_node", { p_node_id: nodeId, p_user_id: user?.id ?? null });
  revalidatePath("/trash");
}

export async function emptyTrashAction() {
  const rpc = await sessionRpc();
  await rpc("empty_trash");
  revalidatePath("/trash");
}

// ── ratings ────────────────────────────────────────────────────

export async function rateFolderAction(folderId: string, score: number) {
  const rpc = await sessionRpc();
  await rpc("rate_folder", { p_folder_id: folderId, p_score: score });
}

// ── organize ───────────────────────────────────────────────────

export async function createOrganizeBatchAction(sourceFolderId: string): Promise<string> {
  const rpc = await sessionRpc();
  return (await rpc("create_organize_batch", { p_source_folder_id: sourceFolderId })) as string;
}

export async function applyOrganizeBatchAction(batchId: string, itemIds: string[]) {
  const rpc = await sessionRpc();
  await rpc("apply_organization_batch", { p_batch_id: batchId, p_item_ids: itemIds });
  revalidatePath("/feed");
}

export async function discardOrganizeBatchAction(batchId: string) {
  const rpc = await sessionRpc();
  await rpc("discard_organization_batch", { p_batch_id: batchId });
}

// ── social ─────────────────────────────────────────────────────

export async function inviteFriendAction(email: string) {
  const rpc = await sessionRpc();
  const status = (await rpc("invite_friend", { p_email: email })) as string;
  if (status === "self") return;
  // Send the actual invite email via Supabase Auth — pending invitees have no
  // account, so this also creates auth.users and ensure_user_profile links the
  // invite on their first sign-in. A registered address errors benignly: the
  // invitee is already in-app, nothing to send.
  const admin = getSupabaseServiceClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/callback` : undefined,
  });
  if (error && !/already|registered|exists/i.test(error.message)) {
    throw new Error(error.message);
  }
}

export async function removeFriendAction(userId: string) {
  const rpc = await sessionRpc();
  await rpc("remove_friend", { p_target_user_id: userId });
}

export async function blockUserAction(userId: string) {
  const rpc = await sessionRpc();
  await rpc("block_user", { p_blocked_id: userId });
}

export async function createGroupAction(name: string, memberIds: string[] = []) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { createGroup } = await import("@/lib/db/friends");
  return createGroup(user.id, name, memberIds);
}

export async function addGroupMemberAction(groupId: string, userId: string) {
  const rpc = await sessionRpc();
  await rpc("add_group_member", { p_group_id: groupId, p_user_id: userId });
}

export async function removeGroupMemberAction(groupId: string, userId: string) {
  const rpc = await sessionRpc();
  await rpc("remove_group_member", { p_group_id: groupId, p_user_id: userId });
}

export async function deleteGroupAction(groupId: string) {
  const rpc = await sessionRpc();
  await rpc("delete_group", { p_group_id: groupId });
}

export async function markNotificationsReadAction(ids: string[] | null) {
  const rpc = await sessionRpc();
  await rpc("mark_notifications_read", { p_ids: ids });
}

// ── youtube consent ────────────────────────────────────────────

export async function setYoutubeConsentAction(consent: boolean) {
  const rpc = await sessionRpc();
  await rpc("set_youtube_import_consent", { p_consent: consent });
}

export async function getYoutubeConsentAction(): Promise<boolean> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  // users_select_scoped permits id = auth.uid() — self-read needs no service key.
  const { data } = await supabase.from("users").select("youtube_import_consent_at").eq("id", user.id).single();
  return !!data?.youtube_import_consent_at;
}

// ── card creation ──────────────────────────────────────────────
// createNode (RPC) auto-files to Unsorted; if the caller picked a folder,
// the card is MOVED out of Unsorted into it (single-membership default).

export async function createCardAction(input: {
  url?: string | null;
  text?: string | null;
  title?: string | null;
  folderId?: string | null;
}): Promise<{ ok: boolean; nodeId?: string; error?: string }> {
  const { createNodeAction } = await import("./createNode");
  const res = await createNodeAction({
    url: input.url ?? null,
    textContent: input.text ?? null,
    title: input.title ?? null,
    nodeType: input.url ? "link" : "text",
  });
  if (!res.ok || !res.nodeId) return { ok: false, error: "error" in res ? res.error : "create failed" };

  if (input.folderId) {
    try {
      const rpc = await sessionRpc();
      const supabase = await getSupabaseServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      const unsortedId = (await rpc("get_or_create_system_folder", { p_kind: "unsorted" })) as string;
      await rpc("move_node_to_folder", {
        p_node_id: res.nodeId, p_target_folder_id: input.folderId,
        p_source_folder_id: unsortedId, p_user_id: user?.id ?? null,
      });
    } catch (e) {
      return { ok: true, nodeId: res.nodeId, error: e instanceof Error ? e.message : "folder move failed" };
    }
  }
  revalidatePath("/feed");
  return { ok: true, nodeId: res.nodeId };
}

// ── locale + theme ─────────────────────────────────────────────

export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  // persist to profile language for cross-device preference
  const rpc = await sessionRpc();
  await rpc("set_language", { p_language_code: locale as Locale }).catch(() => {});
}
