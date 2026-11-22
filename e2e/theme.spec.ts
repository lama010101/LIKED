import { test, expect } from "@playwright/test";
import { injectSession } from "./helpers/auth";

/**
 * P0-10 theme foundation: LIKED_THEME / LIKED_ACCENT cookies are read by the
 * root layout on the server and emitted as <html data-theme data-accent>.
 * Proves SSR attributes + first-paint colours (no flash of wrong theme).
 */

const htmlTag = async (request: import("@playwright/test").APIRequestContext, cookie?: string) => {
  const res = await request.get("/login", {
    headers: cookie ? { cookie } : {},
  });
  const html = await res.text();
  return html.match(/<html[^>]*>/)?.[0] ?? "";
};

const themeCookie = (value: string) => ({
  name: "LIKED_THEME",
  value,
  domain: "localhost",
  path: "/",
});

test.describe("Theme SSR (P0-10)", () => {
  test("LIKED_THEME=dark cookie -> data-theme=dark in SSR HTML", async ({ request }) => {
    const tag = await htmlTag(request, "LIKED_THEME=dark");
    expect(tag).toContain('data-theme="dark"');
  });

  test("LIKED_THEME=light cookie -> data-theme=light in SSR HTML", async ({ request }) => {
    const tag = await htmlTag(request, "LIKED_THEME=light");
    expect(tag).toContain('data-theme="light"');
  });

  test("no cookie -> data-theme=system; LIKED_ACCENT=blue -> data-accent=blue", async ({ request }) => {
    const tag = await htmlTag(request);
    expect(tag).toContain('data-theme="system"');
    expect(tag).toContain('data-accent="orange"');
    const tag2 = await htmlTag(request, "LIKED_ACCENT=blue");
    expect(tag2).toContain('data-accent="blue"');
  });

  test("dark OS + LIKED_THEME=dark -> dark first paint", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    await context.addCookies([themeCookie("dark")]);
    const page = await context.newPage();
    await page.goto("/login");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(10, 10, 18)"); // --bg #0a0a12
    await context.close();
  });

  test("light OS + LIKED_THEME=light -> light first paint", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "light" });
    await context.addCookies([themeCookie("light")]);
    const page = await context.newPage();
    await page.goto("/login");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(242, 242, 246)"); // --bg #f2f2f6
    await context.close();
  });

  test("authed /feed: system resolves via OS (dark->dark, light->light after ThemeSync)", async ({ browser, baseURL }) => {
    for (const scheme of ["dark", "light"] as const) {
      const context = await browser.newContext({ colorScheme: scheme });
      await injectSession(context, baseURL ?? "http://localhost:3001");
      const page = await context.newPage();
      await page.goto("/feed");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1500);
      const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      expect(theme).toBe(scheme);
      await context.close();
    }
  });
});
