import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

const drainMock = vi.fn();
vi.mock("@/lib/email/drain", () => ({
  drainEmailOutbox: (...args: unknown[]) => drainMock(...args),
}));

function req(auth?: string) {
  return new Request("https://liked.test/api/cron/email", {
    headers: auth ? { authorization: auth } : {},
  });
}

describe("GET /api/cron/email", () => {
  const OLD = process.env.CRON_SECRET;
  beforeEach(() => {
    drainMock.mockReset();
    drainMock.mockResolvedValue({ ok: true, claimed: 0, sent: 0, failed: 0, skipped: 0 });
  });
  afterEach(() => {
    if (OLD === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = OLD;
  });

  it("503 when CRON_SECRET is unset (fail closed, drain never runs)", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req("Bearer anything"));
    expect(res.status).toBe(503);
    expect(drainMock).not.toHaveBeenCalled();
  });

  it("401 on missing or wrong bearer", async () => {
    process.env.CRON_SECRET = "s3cr3t-value-0123456789";
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(drainMock).not.toHaveBeenCalled();
  });

  it("200 with the drain summary on the correct bearer", async () => {
    process.env.CRON_SECRET = "s3cr3t-value-0123456789";
    drainMock.mockResolvedValue({ ok: true, reason: "email_not_configured", claimed: 0, sent: 0, failed: 0, skipped: 0 });
    const res = await GET(req("Bearer s3cr3t-value-0123456789"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 0, reason: "email_not_configured" });
  });
});
