import { describe, expect, it } from "vitest";
import { drainEmailOutbox } from "./drain";
import { renderEmail } from "./templates";
import type { EmailDb, EmailOutboxRow } from "./types";

interface Call {
  fn: string;
  params: Record<string, unknown>;
}

const ENV = { apiKey: "re_test_key_1234567890", from: "LIKED <no-reply@liked.app>" };

function row(partial: Partial<EmailOutboxRow> = {}): EmailOutboxRow {
  return {
    id: "out-1",
    kind: "recommendation_received",
    to_email: "owner@example.com",
    owner_id: "u-1",
    payload: { contributor_name: "Ada", count: 2 },
    attempts: 0,
    language: "en",
    ...partial,
  };
}

function makeClient(rows: EmailOutboxRow[] = [], rpcError?: Record<string, string>) {
  const calls: Call[] = [];
  const client: EmailDb = {
    async rpc(fn, params) {
      calls.push({ fn, params });
      const err = rpcError?.[fn];
      if (err) return { data: null, error: { message: err } };
      return { data: fn === "email_claim" ? rows : null, error: null };
    },
  };
  return { client, calls };
}

describe("drainEmailOutbox", () => {
  it("claims nothing and reports email_not_configured when env is missing", async () => {
    const { client, calls } = makeClient([row()]);
    const summary = await drainEmailOutbox({ client, env: null });
    expect(summary).toMatchObject({ ok: true, reason: "email_not_configured", claimed: 0, sent: 0 });
    expect(calls).toHaveLength(0);
  });

  it("sends each claimed row with Idempotency-Key = outbox id, then finishes ok", async () => {
    const { client, calls } = makeClient([row(), row({ id: "out-2", kind: "account_deleted", payload: {} })]);
    const seen: { url: string; headers: Headers }[] = [];
    const captureFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), headers: new Headers(init?.headers) });
      return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
    }) as typeof fetch;
    const summary = await drainEmailOutbox({ client, fetchImpl: captureFetch, env: ENV });
    expect(summary).toMatchObject({ claimed: 2, sent: 2, failed: 0 });
    expect(seen).toHaveLength(2);
    expect(seen[0].url).toBe("https://api.resend.com/emails");
    expect(seen[0].headers.get("idempotency-key")).toBe("out-1");
    expect(seen[1].headers.get("idempotency-key")).toBe("out-2");
    expect(seen[0].headers.get("authorization")).toBe(`Bearer ${ENV.apiKey}`);
    const finishes = calls.filter((c) => c.fn === "email_finish");
    expect(finishes).toHaveLength(2);
    expect(finishes.every((f) => f.params.p_ok === true && f.params.p_error === null)).toBe(true);
  });

  it("finishes not-ok with the provider error when Resend fails", async () => {
    const { client, calls } = makeClient([row()]);
    const failFetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    const summary = await drainEmailOutbox({ client, fetchImpl: failFetch, env: ENV });
    expect(summary).toMatchObject({ claimed: 1, sent: 0, failed: 1 });
    const fin = calls.find((c) => c.fn === "email_finish");
    expect(fin?.params.p_ok).toBe(false);
    expect(String(fin?.params.p_error)).toContain("resend_http_500");
  });

  it("redacts the API key from error text stored via email_finish", async () => {
    const { client, calls } = makeClient([row()]);
    const leaky = (async () => {
      throw new Error(`connect fail Bearer ${ENV.apiKey} at https://api.resend.com/emails?key=${ENV.apiKey}`);
    }) as typeof fetch;
    await drainEmailOutbox({ client, fetchImpl: leaky, env: ENV });
    const pError = String(calls.find((c) => c.fn === "email_finish")?.params.p_error);
    expect(pError).not.toContain(ENV.apiKey);
    expect(pError).toContain("<redacted>");
  });

  it("skips rows without a recipient and unknown kinds without sending", async () => {
    const { client, calls } = makeClient([
      row({ id: "out-noemail", to_email: null }),
      row({ id: "out-bad", kind: "mystery" }),
    ]);
    let fetched = 0;
    const fetchImpl = (async () => {
      fetched += 1;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const summary = await drainEmailOutbox({ client, fetchImpl, env: ENV });
    expect(fetched).toBe(0);
    expect(summary).toMatchObject({ claimed: 2, sent: 0, failed: 2, skipped: 2 });
    expect(calls.filter((c) => c.fn === "email_finish")).toHaveLength(2);
  });

  it("propagates an email_claim RPC failure", async () => {
    const { client } = makeClient([], { email_claim: "claim boom" });
    await expect(drainEmailOutbox({ client, env: ENV })).rejects.toThrow("email_claim");
  });
});

describe("renderEmail", () => {
  it("renders recommendation_received in the row language", () => {
    const en = renderEmail("recommendation_received", "en", { contributor_name: "Ada", count: 3 });
    const fr = renderEmail("recommendation_received", "fr-FR", { contributor_name: "Ada", count: 3 });
    expect(en?.subject).toContain("recommendations");
    expect(en?.text).toContain("Ada");
    expect(fr?.text).toContain("Ada");
    expect(fr?.text).not.toBe(en?.text);
  });

  it("falls back to English for unknown languages and kinds", () => {
    expect(renderEmail("account_deleted", "xx", {})?.subject).toContain("deleted");
    expect(renderEmail("nope", "en", {})).toBeNull();
  });

  it("includes the confirm URL for deletion_request_confirm", () => {
    const r = renderEmail("deletion_request_confirm", "en", { confirm_url: "https://x.test/c?t=1" });
    expect(r?.text).toContain("https://x.test/c?t=1");
  });
});
