import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("settings show the app version (to tell an update arrived)", async ({ page }) => {
  await signIn(page, "Versioned");
  await page.goto("/settings");
  await expect(page.getByTestId("app-version").filter({ visible: true })).toHaveText(/^Version v0\.\d+\.\d+/);
});
