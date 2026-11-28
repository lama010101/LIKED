// Guest-side e2e (PLAN-V2-002 §4.5 T1, PRD §13 item 1; task P0-13).
//
// Runnable without seeded data:
//   - no sb-* cookie is ever set on /r/*
//   - two different dead tokens return the identical 404 body
// The mint (T6), the 21st-miss 429 and the spoofed x-forwarded-for bucket
// need a live ask token and a Vercel preview; they are listed as UNPROVEN
// in the task report (not silently skipped here).

import { expect, test } from "@playwright/test";
import { startProdAudit, type ProdAudit } from "./helpers/prodAudit";
import { injectSession } from "./helpers/auth";
import { getOwnerAskToken } from "./helpers/v2Fixtures";

const DEAD_TOKEN_A = "zz-e2e-dead-token-aaaaaaaaaaaaaaaaaaaa";
const DEAD_TOKEN_B = "zz-e2e-dead-token-bbbbbbbbbbbbbbbbbbbb";

let audit: ProdAudit;

test.beforeAll(async () => {
  audit = await startProdAudit();
});

test.afterAll(async () => {
  await audit.assertEqual();
});

test.describe("guest landing /r/[token]", () => {
  test("sets no Supabase cookie on /r/*", async ({ page, context }) => {
    await page.goto(`/r/${DEAD_TOKEN_A}`);
    const cookies = await context.cookies();
    expect(cookies.filter((cookie) => cookie.name.startsWith("sb-"))).toEqual([]);
  });

  test("returns the identical 404 body for two different dead tokens", async ({ request }) => {
    const first = await request.get(`/r/${DEAD_TOKEN_A}`);
    const second = await request.get(`/r/${DEAD_TOKEN_B}`);
    expect(first.status()).toBe(404);
    expect(second.status()).toBe(404);
    expect(await first.text()).toBe(await second.text());
  });

  test("guest appearance controls apply instantly and persist on the device", async ({ page, context, baseURL }) => {
    const origin = baseURL ?? "http://localhost:3001";
    const session = await injectSession(context, origin);
    await page.goto("/inbox");
    const token = await getOwnerAskToken(session.user.id as string);
    expect(token).toBeTruthy();
    await context.clearCookies();

    await page.goto(`/r/${token}`);
    await page.locator('button[aria-haspopup="dialog"]').click();
    await expect(page.getByTestId("appearance-controls")).toBeVisible();
    await page.getByTestId("theme-dark").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByTestId("accent-teal").click();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "teal");

    let cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "LIKED_THEME")?.value).toBe("dark");
    expect(cookies.find((c) => c.name === "LIKED_ACCENT")?.value).toBe("teal");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-accent", "teal");
    cookies = await context.cookies();
    expect(cookies.filter((cookie) => cookie.name.startsWith("sb-"))).toEqual([]);
  });
});
