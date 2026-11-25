// Outbox row shape returned by email_claim (migration-147 contract):
// [{id,kind,to_email,owner_id,payload,attempts,language}]. The SQL
// function owns leasing (5 min), attempts increment and recipient
// resolution; this module only consumes the claimed rows.
export interface EmailOutboxRow {
  id: string;
  kind: string;
  to_email: string | null;
  owner_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  language: string | null;
}

/** Minimal surface of the service-role Supabase client used here. */
export interface EmailDb {
  rpc(
    fn: string,
    params: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
}
