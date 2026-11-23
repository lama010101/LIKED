import { test, expect } from "@playwright/test";

/**
 * V2-LANDING-002-A — landing switch + "v2b" pre-launch page. Unauthenticated.
 * The waitlist FIELD is gated by WAITLIST_ENABLED in production builds, so
 * layout assertions accept either the field or the "opens soon" text.
 */
const H1 = "Get recommendations from people you trust";
const formOrClosed = '.lb-hero .lb-input, .lb-hero [data-testid="waitlist-closed"]';

test.describe("Landing switch (V2-LANDING-002-A)", () => {
  test.use({ storageState: undefined });

  test("no override: '/' is the unchanged default landing, no pill", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/stop losing/i);
    await expect(page.getByTestId("landing-pill")).toHaveCount(0);
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === "liked.landing")).toBe(false);
  });

  test("?landing=v2b shows the exact H1, the pill and a session cookie", async ({ page }) => {
    const res = await page.goto("/?landing=v2b");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(H1);
    await expect(page.getByTestId("landing-pill")).toBeVisible();
    expect(res?.headers()["x-robots-tag"]).toContain("noindex");
    expect(res?.headers()["cache-control"]).toContain("private");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === "liked.landing")?.value).toBe("v2b");
    const ck = (await page.context().cookies()).find((c) => c.name === "liked.landing");
    expect(ck?.expires).toBe(-1); // session cookie
  });

  test("cookie keeps the override; ?landing=default clears it", async ({ page }) => {
    await page.goto("/?landing=legacy");
    await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === "liked.landing")?.value).toBe("legacy");
    await page.goto("/");
    await expect(page.getByTestId("landing-pill")).toBeVisible();
    await page.goto("/?landing=default");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/stop losing/i);
    await expect(page.getByTestId("landing-pill")).toHaveCount(0);
    await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === "liked.landing")).toBe(false);
  });

  test("unknown values are ignored silently and never reflected", async ({ page }) => {
    await page.goto("/?landing=%3Cb%3Ezzz%3C%2Fb%3E");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/stop losing/i);
    await expect(page.getByTestId("landing-pill")).toHaveCount(0);
    // Rendered output only (Next's own router-state payload carries the URL).
    expect(await page.locator("body").innerText()).not.toContain("zzz");
    await expect(page.getByText("zzz")).toHaveCount(0);
  });

  test("pill flips between variants", async ({ page }) => {
    await page.goto("/?landing=v2b");
    await page.getByTestId("landing-pill").locator("summary").click();
    await page.getByTestId("landing-pill").getByRole("link", { name: "v2a" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/stop losing/i);
  });
});

test.describe("v2b page", () => {
  test.use({ storageState: undefined });

  test("structure: one H1, badge, sections, footer attribution, no analytics", async ({ page }) => {
    await page.goto("/?landing=v2b");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByText("Private beta coming soon")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Three friends. One card." })).toBeVisible();
    await expect(page.getByText("TMDB 81%")).toBeVisible();
    await expect(page.getByText("Friends 87% (3)").first()).toBeVisible();
    await expect(page.getByText("This product uses the TMDB API but is not endorsed or certified by TMDB.")).toBeVisible();
    await expect(page.getByText("Streaming availability data is provided by JustWatch.")).toBeVisible();
    await expect(page.locator("details.lb-faq-item")).toHaveCount(5);
    // no third-party scripts
    const srcs = await page.locator("script[src]").evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).src));
    for (const s of srcs) expect(new URL(s).origin).toBe(new URL(page.url()).origin);
  });

  test("360x640: H1, subhead and the email field (or closed text) are above the fold", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
    const page = await ctx.newPage();
    await page.goto("/?landing=v2b");
    for (const sel of ["h1", ".lb-hero .lb-sub", formOrClosed]) {
      const box = await page.locator(sel).first().boundingBox();
      expect(box, sel).not.toBeNull();
      expect(box!.y + box!.height, sel).toBeLessThanOrEqual(640);
    }
    await ctx.close();
  });

  for (const locale of ["en", "fr", "es", "th"]) {
    test(`360px has no horizontal scroll (${locale})`, async ({ browser, baseURL }) => {
      const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
      await ctx.addCookies([{ name: "LIKED_LOCALE", value: locale, url: baseURL ?? "http://localhost:3001" }]);
      const page = await ctx.newPage();
      await page.goto("/?landing=v2b");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await page.locator("details.lb-faq-item").first().locator("summary").click();
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(sw).toBeLessThanOrEqual(360);
      await ctx.close();
    });
  }

  test("honeypot is off-screen, not focusable and hidden from assistive tech", async ({ page }) => {
    await page.goto("/?landing=v2b");
    const hp = page.locator(".lb-hero .lb-hp");
    if ((await hp.count()) === 0) test.skip(true, "waitlist field gated off in this build");
    await expect(hp).toHaveAttribute("aria-hidden", "true");
    await expect(hp.locator("input[name=website]")).toHaveAttribute("tabindex", "-1");
  });

  test("/api/waitlist stub: 404 in production, validating 200/400 elsewhere", async ({ request }) => {
    const ok = await request.post("/api/waitlist", { form: { email: "you@example.com", website: "", locale: "en" } });
    if (ok.status() === 404) return; // production build: stub is closed by design
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    const bad = await request.post("/api/waitlist", { form: { email: "nope" } });
    expect(bad.status()).toBe(400);
  });
});
