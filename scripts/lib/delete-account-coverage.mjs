// delete-account-coverage.mjs — coverage list for public.delete_account
// (migration 146, PLAN-V2-002 §3.2/§3.7, task V2-W2-P0-05).
//
// Single source of truth that P0-06 wires into DB-22: every FK that
// points at public.users / auth.users, every uuid column that looks
// like a user reference but has NO FK, and every jsonb payload key
// observed in notifications / email_outbox must appear here, or
// findCoverageGaps() reports it. Pure JS: no DB access, no side
// effects on import.
//
// handled_by: step number (1-12 of §3.2) for rows deleted by the
// function, 'cascade' for rows removed purely by ON DELETE CASCADE,
// 'ledger' for the account_deletion_jobs row itself (kept by design).

export const COVERED_FKS = [
  // ---- CASCADE -> auth.users (explicit step-9 deletes; FK is cascade) ----
  { child: "card_positions", column: "user_id", parent: "auth.users", on_delete: "CASCADE", handled_by: 9 },
  { child: "youtube_connections", column: "user_id", parent: "auth.users", on_delete: "CASCADE", handled_by: 9 },
  // ---- CASCADE -> public.users ----
  { child: "asks", column: "owner_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "causes", column: "created_by", parent: "public.users", on_delete: "CASCADE", handled_by: 8 },
  { child: "contributors", column: "claimed_by_user_id", parent: "public.users", on_delete: "CASCADE", handled_by: 1 },
  { child: "edges", column: "user_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "email_outbox", column: "owner_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "folder_grants", column: "granted_by", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "folder_grants", column: "grantee_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "folder_ratings", column: "user_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "folders", column: "owner_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "friend_invites", column: "from_user_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "friend_invites", column: "to_user_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "node_classifications", column: "owner_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "node_notes", column: "user_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "nodes", column: "origin_user_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "nodes", column: "owner_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "organize_batches", column: "user_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "owner_contributor_blocks", column: "owner_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "owner_item_state", column: "owner_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "owner_picks", column: "owner_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "recommendations", column: "owner_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "user_node_preferences", column: "user_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  { child: "user_prefs", column: "user_id", parent: "public.users", on_delete: "CASCADE", handled_by: "cascade" },
  // ---- SET NULL -> public.users ----
  { child: "folder_edges", column: "added_by", parent: "public.users", on_delete: "SET NULL", handled_by: 3 },
  // ---- NO ACTION -> public.users ----
  { child: "activity_log", column: "user_id", parent: "public.users", on_delete: "NO ACTION", handled_by: 7 },
  { child: "blocks", column: "blocked_id", parent: "public.users", on_delete: "NO ACTION", handled_by: 7 },
  { child: "blocks", column: "blocker_id", parent: "public.users", on_delete: "NO ACTION", handled_by: 7 },
  { child: "categorization_suggestions", column: "user_id", parent: "public.users", on_delete: "NO ACTION", handled_by: 7 },
  { child: "direct_chats", column: "user_1_id", parent: "public.users", on_delete: "NO ACTION", handled_by: 5 },
  { child: "direct_chats", column: "user_2_id", parent: "public.users", on_delete: "NO ACTION", handled_by: 5 },
  { child: "edges", column: "sender_id", parent: "public.users", on_delete: "NO ACTION", handled_by: 8 },
  { child: "folder_admins", column: "granted_by", parent: "public.users", on_delete: "NO ACTION", handled_by: 7 },
  { child: "folder_admins", column: "user_id", parent: "public.users", on_delete: "NO ACTION", handled_by: 7 },
  { child: "group_admins", column: "granted_by", parent: "public.users", on_delete: "NO ACTION", handled_by: 6 },
  { child: "group_admins", column: "user_id", parent: "public.users", on_delete: "NO ACTION", handled_by: 6 },
  { child: "group_members", column: "user_id", parent: "public.users", on_delete: "NO ACTION", handled_by: 6 },
  { child: "group_messages", column: "sender_id", parent: "public.users", on_delete: "NO ACTION", handled_by: 6 },
  { child: "groups", column: "owner_id", parent: "public.users", on_delete: "NO ACTION", handled_by: 6 },
  { child: "messages", column: "sender_id", parent: "public.users", on_delete: "NO ACTION", handled_by: 5 },
  { child: "node_messages", column: "sender_id", parent: "public.users", on_delete: "NO ACTION", handled_by: 5 },
  { child: "notifications", column: "user_id", parent: "public.users", on_delete: "NO ACTION", handled_by: 7 },
  { child: "ratings", column: "user_id", parent: "public.users", on_delete: "NO ACTION", handled_by: 4 },
];

// uuid columns that look like user references but carry NO FK to
// users/auth.users. account_deletion_jobs.user_id is the ledger
// itself (kept by design — exempt from the zero-residue check).
export const COVERED_UNREFERENCED_COLUMNS = [
  { table: "account_deletion_jobs", column: "user_id", handled_by: "ledger" },
  { table: "categorization_suggestions_backup_20260927", column: "user_id", handled_by: 7 },
];

// Every jsonb payload key seen in notifications.payload (live scan
// 2026-11-23) and email_outbox.payload (contract, migration 144),
// plus the plan's actor_id key. Whitelist semantics: any live key
// NOT listed here is a coverage gap. `type_or_kind` is the
// notifications.type or email_outbox.kind value ('*' = any).
export const COVERED_PAYLOAD_KEYS = [
  // notifications.type = 'recommendation_received' (migration 144 contract)
  { table: "notifications", type_or_kind: "recommendation_received", key: "submission_id", handled_by: 1 },
  { table: "notifications", type_or_kind: "recommendation_received", key: "contributor_id", handled_by: 1 },
  { table: "notifications", type_or_kind: "recommendation_received", key: "contributor_name", handled_by: 1 },
  { table: "notifications", type_or_kind: "recommendation_received", key: "count", handled_by: 1 },
  { table: "notifications", type_or_kind: "recommendation_received", key: "ask_id", handled_by: 1 },
  // notifications.type = 'folder_share' (live)
  { table: "notifications", type_or_kind: "folder_share", key: "folder_id", handled_by: 7 },
  { table: "notifications", type_or_kind: "folder_share", key: "folder_name", handled_by: 7 },
  { table: "notifications", type_or_kind: "folder_share", key: "permission", handled_by: 7 },
  { table: "notifications", type_or_kind: "folder_share", key: "sender_id", handled_by: 7 },
  // notifications.type = 'share_received' (live)
  { table: "notifications", type_or_kind: "share_received", key: "node_id", handled_by: 7 },
  { table: "notifications", type_or_kind: "share_received", key: "node_title", handled_by: 7 },
  { table: "notifications", type_or_kind: "share_received", key: "permission", handled_by: 7 },
  { table: "notifications", type_or_kind: "share_received", key: "sender_id", handled_by: 7 },
  // plan-mandated actor_id (not present live; covered defensively)
  { table: "notifications", type_or_kind: "*", key: "actor_id", handled_by: 7 },
  // email_outbox.kind = 'recommendation_received' (migration 144 contract)
  { table: "email_outbox", type_or_kind: "recommendation_received", key: "submission_id", handled_by: 1 },
  { table: "email_outbox", type_or_kind: "recommendation_received", key: "contributor_id", handled_by: 1 },
  { table: "email_outbox", type_or_kind: "recommendation_received", key: "contributor_name", handled_by: 1 },
  { table: "email_outbox", type_or_kind: "recommendation_received", key: "count", handled_by: 1 },
  { table: "email_outbox", type_or_kind: "recommendation_received", key: "ask_id", handled_by: 1 },
];

const fkKey = (f) => `${f.child}.${f.column}->${f.parent}`;
const colKey = (c) => `${c.table}.${c.column}`;
const payKey = (p) => `${p.table}|${p.type_or_kind}|${p.key}`;

// liveFks:        [{child, column, parent, on_delete}]   (parent 'public.users'|'auth.users')
// liveColumns:    [{table, column}]                     (user-looking uuid cols w/o FK)
// livePayloadKeys:[{table, type_or_kind, key}]          (distinct payload keys)
// Returns a list of human-readable uncovered items; [] = full coverage.
export function findCoverageGaps({ liveFks = [], liveColumns = [], livePayloadKeys = [] } = {}) {
  const gaps = [];
  const coveredFks = new Set(COVERED_FKS.map(fkKey));
  const coveredCols = new Set(COVERED_UNREFERENCED_COLUMNS.map(colKey));
  const coveredPay = new Set(COVERED_PAYLOAD_KEYS.map(payKey));

  for (const f of liveFks) {
    const k = fkKey(f);
    if (!coveredFks.has(k)) gaps.push(`uncovered FK: ${k} on_delete=${f.on_delete ?? "?"}`);
  }
  for (const c of liveColumns) {
    const k = colKey(c);
    if (!coveredCols.has(k)) gaps.push(`uncovered unreferenced user column: ${k}`);
  }
  for (const p of livePayloadKeys) {
    const exact = payKey(p);
    const anyType = payKey({ ...p, type_or_kind: "*" });
    if (!coveredPay.has(exact) && !coveredPay.has(anyType)) {
      gaps.push(`uncovered payload key: ${p.table}.${p.type_or_kind}.${p.key}`);
    }
  }
  return gaps;
}
