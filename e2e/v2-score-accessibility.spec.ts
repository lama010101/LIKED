import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { getE2ESession } from "./helpers/auth";
import { startProdAudit, type ProdAudit } from "./helpers/prodAudit";
import { deleteGuest, deleteItems, getOwnerAskToken, serviceClient } from "./helpers/v2Fixtures";

// C5: real guest-flow ScoreSlider keyboard/axe proof. The slider is reached
// through landing -> PoW session -> paste/resolve -> details, never by a
// test-only mount. No submission is sent; the guest contributor is deleted.
test.describe.configure({ mode: "serial" });

const require = createRequire(import.meta.url);
const stamp = String(Date.now()).slice(-8);
const guestName = `zz-c5-slider-${stamp}`;
let audit: ProdAudit;
let contributorId = "";
let createdItemId = "";

test.beforeAll(async () => {
  audit = await startProdAudit();
});

test.afterAll(async () => {
  if (contributorId) await deleteGuest(contributorId);
  if (createdItemId) await deleteItems([createdItemId]);
  await audit.assertEqual();
});

test("ScoreSlider keyboard, aria-valuetext, clear/null and axe baseline", async ({ page }) => {
  const session = await getE2ESession();
  const token = await getOwnerAskToken(session.user.id as string);
  expect(token).toBeTruthy();

  const beforeItem = await serviceClient()
    .from("items")
    .select("id")
    .eq("source", "tmdb")
    .eq("external_id", "603")
    .maybeSingle();
  const preexistingItem = (beforeItem.data as { id?: string } | null)?.id ?? "";

  await page.goto(`/r/${token}`);
  await page.getByLabel(/your name/i).fill(guestName);
  await page.getByRole("button", { name: /^start$/i }).click();
  await expect(page.getByLabel(/paste/i)).toBeVisible({ timeout: 15000 });

  await page.getByLabel(/paste/i).fill("https://www.themoviedb.org/movie/603");
  await page.getByRole("button", { name: /^paste$/i }).click();
  await expect(page.getByRole("button", { name: /^details$/i }).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /^details$/i }).first().click();

  const slider = page.getByRole("slider").first();
  await expect(slider).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuemin", "0");
  await expect(slider).toHaveAttribute("aria-valuemax", "100");
  await expect(slider).toHaveAttribute("step", "5");
  await expect(slider).toHaveAttribute("aria-valuetext", "No score");

  await slider.focus();
  for (let i = 0; i < 16; i++) await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", "80 percent, Great");
  await expect(slider).toHaveValue("80");

  // Explicit zero is a real score, distinct from untouched/null.
  for (let i = 0; i < 16; i++) await page.keyboard.press("ArrowLeft");
  await expect(slider).toHaveValue("0");
  await expect(slider).toHaveAttribute("aria-valuetext", "0 percent, Skip it");

  await page.getByRole("button", { name: /clear score/i }).click();
  await expect(slider).toHaveAttribute("aria-valuetext", "No score");

  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const axe = await page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (el: Element, opts?: object) => Promise<{ violations: unknown[] }> } })
      .axe.run(document.querySelector("main")!, { resultTypes: ["violations"] });
    return result.violations;
  });
  expect(axe).toEqual([]);

  const contributor = await serviceClient()
    .from("contributors")
    .select("id")
    .eq("display_name", guestName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  contributorId = (contributor.data as { id?: string } | null)?.id ?? "";
  expect(contributorId).toBeTruthy();

  if (!preexistingItem) {
    const afterItem = await serviceClient()
      .from("items")
      .select("id")
      .eq("source", "tmdb")
      .eq("external_id", "603")
      .maybeSingle();
    createdItemId = (afterItem.data as { id?: string } | null)?.id ?? "";
  }
});
