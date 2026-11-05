import { expect, test } from "@playwright/test";
import { openHome, signIn } from "./helpers";

test("home cooking: add a dish, log making it, rate it, edit the recipe", async ({ page }) => {
  await signIn(page, "Cook");
  await openHome(page);
  await page.getByRole("button", { name: "Home cooking", exact: true }).click();
  await expect(page.getByText("Log what you cook at home", { exact: false })).toBeVisible();
  await page.getByPlaceholder("A dish you made", { exact: false }).fill("Kimchi stew");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const info = page.getByTestId("dish-info").filter({ visible: true });
  await expect(info).toContainText("Kimchi stew");
  await expect(page.getByText("Not logged yet.")).toBeVisible();
  await page.getByRole("button", { name: "I made it today" }).click();
  await expect(page.getByTestId("made-row")).toHaveCount(1);
  await expect(page.getByTestId("made-row")).toContainText("Cook");

  await page.getByRole("button", { name: "4.5 stars", exact: true }).click();
  await page.getByLabel("Review").fill("Better with aged kimchi");
  await page.getByRole("button", { name: "Save rating" }).click();
  await expect(info).toContainText("4.5 (1)");

  await page.getByRole("button", { name: "Edit dish" }).click();
  await page.getByRole("button", { name: "Korean", exact: true }).click();
  await page.getByLabel("Recipe notes").fill("Pork belly, aged kimchi, gochugaru");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(info).toContainText("Korean");
  await expect(info).toContainText("Pork belly, aged kimchi, gochugaru");

  await page.goBack();
  await page.reload();
  const card = page.getByTestId("dish-card").filter({ visible: true });
  await expect(card).toContainText("Kimchi stew");
  await expect(card).toContainText("4.5 (1)");
  await expect(card).toContainText("Made ");

  // The tab is remembered.
  await page.reload();
  await expect(page.getByTestId("dish-card").filter({ visible: true })).toHaveCount(1);
});
