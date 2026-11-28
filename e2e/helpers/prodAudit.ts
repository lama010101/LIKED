import { serviceClient } from "./v2Fixtures";

// PROD audit helper (V2-W7 WP-E): snapshot per-table row counts before a
// spec, assert equality after. Counts only — never prints row contents or
// PII. A nonzero delta fails the spec loudly in afterAll.

// Fixture-owned tables (proven list from scripts/wp7-delete-live.mjs).
// rate_limits is excluded on purpose: throttle rows are ephemeral and are
// not fixture data.
const AUDIT_TABLES = [
  "users",
  "nodes",
  "folders",
  "folder_tree",
  "edges",
  "causes",
  "folder_grants",
  "folder_edges",
  "folder_admins",
  "recommendations",
  "submissions",
  "contributors",
  "asks",
  "items",
  "notifications",
  "email_outbox",
  "account_deletion_jobs",
  "user_prefs",
  "owner_item_state",
  "owner_contributor_blocks",
  "blocks",
] as const;

export type ProdAuditCounts = Record<string, number>;

export interface ProdAudit {
  before: ProdAuditCounts;
  assertEqual(): Promise<void>;
}

async function snapshot(): Promise<ProdAuditCounts> {
  const svc = serviceClient();
  const out: ProdAuditCounts = {};
  for (const table of AUDIT_TABLES) {
    const { count, error } = await svc
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`prodAudit count ${table}: ${error.message}`);
    out[table] = count ?? 0;
  }
  return out;
}

/** Call in beforeAll; pair with audit.assertEqual() in afterAll. */
export async function startProdAudit(): Promise<ProdAudit> {
  const before = await snapshot();
  return {
    before,
    async assertEqual() {
      const after = await snapshot();
      const deltas = AUDIT_TABLES.filter((t) => after[t] !== before[t]).map(
        (t) => `${t}: ${before[t]} -> ${after[t]}`
      );
      if (deltas.length > 0) {
        throw new Error(`prodAudit residue detected: ${deltas.join("; ")}`);
      }
    },
  };
}
