import { expect, test } from "@playwright/test";
import { addInput, current, newRoute, openHome, row, signIn } from "./helpers";

// Real Google Places/Routes through our API, with the same server key production uses.
// Run with: E2E_LIVE_GOOGLE=1 GOOGLE_SERVER_KEY=... npx playwright test --project=phone
test("live: autocomplete, place details and drive time from real Google", async ({ page }) => {
  test.skip(!process.env.GOOGLE_SERVER_KEY, "needs GOOGLE_SERVER_KEY");
  await signIn(page, "Live");
  await openHome(page);
  expect(await (await page.request.get("/api/config")).json()).toEqual({ googlePlaces: true });
  await newRoute(page);

  await addInput(page).fill("Tartine Bakery Guerrero");
  const first = page.getByText("Tartine Bakery", { exact: true }).first();
  await expect(first).toBeVisible({ timeout: 15_000 });
  await first.click();
  await expect(current(page)).toContainText("Tartine Bakery");
  await expect(current(page)).toContainText("Guerrero St");

  await addInput(page).fill("Dolores Park San Francisco");
  const park = page.getByText("Dolores Park", { exact: true }).first();
  await expect(park).toBeVisible({ timeout: 15_000 });
  await park.click();
  await expect(row(page, 1)).toContainText("Dolores Park");
  // A real drive time between the two (a few minutes apart in the Mission).
  await expect(page.getByText(/^Drive \d+ min · [\d.]+ ?k?m/)).toBeVisible({ timeout: 15_000 });
});
