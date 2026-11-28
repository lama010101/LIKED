import { test, expect } from "@playwright/test";

/**
 * V2 pipeline cron routes must fail closed without the cron secret
 * (PLAN-V2-002 §2.12; CTO AUTH RULE 2026-11-24):
 *   - CRON_SECRET set   + no/wrong bearer -> 401
 *   - CRON_SECRET unset                   -> 503 (never open)
 * The local/CI e2e server does not set CRON_SECRET, so 503 is expected
 * there; both statuses are accepted so the spec also passes against a
 * deployment that has the secret configured.
 */
test.describe("v2 pipeline cron routes — unauthenticated", () => {
  test.use({ storageState: undefined });

  test("GET /api/cron/enrich without Authorization is rejected", async ({ request }) => {
    const res = await request.get("/api/cron/enrich");
    expect([401, 503]).toContain(res.status());
    const body = await res.json();
    expect(["unauthorized", "cron_unavailable"]).toContain(body.error);
  });

  test("GET /api/cron/enrich with a wrong bearer is rejected", async ({ request }) => {
    const res = await request.get("/api/cron/enrich", {
      headers: { authorization: "Bearer definitely-not-the-cron-secret" },
    });
    expect([401, 503]).toContain(res.status());
    const body = await res.json();
    expect(["unauthorized", "cron_unavailable"]).toContain(body.error);
  });
});
