import { expect, test } from "@playwright/test";
import { current, newRoute, openHome, signIn } from "./helpers";

// Near Civic Center, San Francisco: SFJAZZ (~150 m) is much nearer than Golden Gate Park (~6 km).
test.use({ geolocation: { latitude: 37.7775, longitude: -122.4199 }, permissions: ["geolocation"] });

test("place search: places you've been come first, then the nearest; a ZIP moves the center", async ({ page }) => {
  await signIn(page, "Seeker");
  await openHome(page);

  // A past route where Mensho was finished.
  await newRoute(page);
  const search = () => page.getByRole("textbox", { name: "Search a place, or type cafe, park, jazz bar", exact: true }).filter({ visible: true });
  await search().fill("mensho");
  await page.getByTestId("place-suggestion").filter({ visible: true }).filter({ hasText: "Mensho Tokyo" }).click();
  await expect(current(page)).toContainText("Mensho Tokyo");
  await current(page).getByRole("button", { name: "Done" }).click();

  // A new route: "en" matches Mensho, SFJAZZ Center and Golden Gate Park.
  await page.goBack();
  await newRoute(page);
  await expect(page.getByTestId("place-origin").filter({ visible: true })).toHaveText("📍 Nearest to you first");
  await search().fill("en");
  const been = page.getByTestId("visited-suggestion").filter({ visible: true });
  await expect(been).toHaveCount(1);
  await expect(been).toContainText("🕘 Mensho Tokyo");
  await expect(been).toContainText("been");
  await expect(been).toContainText(/\d+(\.\d)? (km|mi)/);
  // Google's, nearest first, without Mensho again.
  const found = page.getByTestId("place-suggestion").filter({ visible: true });
  await expect(found).toHaveCount(2);
  await expect(found.nth(0)).toContainText("SFJAZZ Center");
  await expect(found.nth(1)).toContainText("Golden Gate Park");
  await expect(found.nth(1)).toContainText(/\d+(\.\d)? (km|mi)/);

  // A ZIP code beside the box: distances from there instead (remembered for next time).
  await page.getByTestId("place-zip").filter({ visible: true }).fill("94102");
  await expect(page.getByTestId("place-origin").filter({ visible: true })).toHaveText("📍 Nearest to San Francisco, CA 94102 first");
  await page.reload();
  await expect(page.getByTestId("place-zip").filter({ visible: true })).toHaveValue("94102");

  // Picking the visited one adds it with its address and location.
  await search().fill("mens");
  await page.getByTestId("visited-suggestion").filter({ visible: true }).click();
  await expect(current(page)).toContainText("Mensho Tokyo");
});
