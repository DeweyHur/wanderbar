import { expect, test } from "@playwright/test";
import { current, newRoute, openHome, quickAdd, row, signIn } from "./helpers";

test("a day route: quick add, done, skip, reorder, not this time, restore, restart", async ({ page }) => {
  await signIn(page, "Router");
  await openHome(page);
  await newRoute(page);

  await quickAdd(page, "Cafe, Park, Jazz bar");
  await expect(current(page)).toContainText("Cafe");
  await expect(row(page, 0)).toContainText("Cafe");
  await expect(row(page, 1)).toContainText("Park");
  await expect(row(page, 2)).toContainText("Jazz bar");

  // Done: the next one is "now".
  await current(page).getByRole("button", { name: "Done" }).click();
  await expect(current(page)).toContainText("Park");
  await expect(row(page, 0)).toContainText("Done");

  // Skip: Park goes to the end, Jazz bar is now.
  await current(page).getByRole("button", { name: "Skip" }).click();
  await expect(current(page)).toContainText("Jazz bar");
  await expect(row(page, 2)).toContainText("Park");

  // Reorder with ▲: Park moves above Jazz bar (status unchanged).
  await row(page, 2).getByLabel("Move up").click();
  await expect(row(page, 1)).toContainText("Park");
  await expect(current(page)).toContainText("Jazz bar");

  // Not this time / bring back, on the place screen.
  await row(page, 1).getByText("Park").click();
  await page.getByRole("button", { name: "Not this time" }).click();
  await expect(page.getByText("Not this time", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Bring back" }).click();
  await page.goBack();
  await expect(row(page, 1)).toContainText("Park");

  // Finish everything, then start over.
  await current(page).getByRole("button", { name: "Done" }).click();
  await current(page).getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("All done for this route.")).toBeVisible();
  await page.getByRole("button", { name: "Start over" }).first().click();
  await expect(current(page)).toContainText("Cafe");
});

test("place screen: edit details and hours; the open badge follows", async ({ page }) => {
  await signIn(page, "Editor");
  await openHome(page);
  await newRoute(page);
  await quickAdd(page, "Bakery");
  await current(page).getByText("Bakery").click();

  await page.getByLabel("Address").fill("315 Linden St, San Francisco");
  await page.getByLabel("Opening hours").fill("24h");
  await expect(page.getByText("Open 24 hours")).toBeVisible();
  await page.getByLabel("Memo").fill("Try the croissant");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  await page.goBack();
  await expect(current(page)).toContainText("315 Linden St, San Francisco");
  await expect(current(page)).toContainText("Open 24 hours");
  // The web can't hand off to the Tesla app, so it offers the address instead.
  await expect(current(page).getByRole("button", { name: "Copy address" })).toBeVisible();
});

test("pasting a whole Google Maps share into the link field fills name and address", async ({ page }) => {
  await signIn(page, "Paster");
  await openHome(page);
  await newRoute(page);
  await quickAdd(page, "Somewhere");
  await current(page).getByText("Somewhere").click();
  await page.getByLabel("Name").fill("");
  await page.getByLabel("Google Maps link").fill("Blue Bottle Coffee\n315 Linden St, San Francisco, CA 94102\nhttps://maps.app.goo.gl/abc123");
  await expect(page.getByLabel("Google Maps link")).toHaveValue("https://maps.app.goo.gl/abc123");
  await expect(page.getByLabel("Name")).toHaveValue("Blue Bottle Coffee");
});

test("routes list and delete", async ({ page }) => {
  await signIn(page, "Lister");
  await openHome(page);
  await newRoute(page);
  await quickAdd(page, "A, B");
  await current(page).getByRole("button", { name: "Done" }).click();
  await page.goBack();
  await expect(page.getByText("1/2 done · Now: B")).toBeVisible();

  await page.getByText("1/2 done · Now: B").click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete route" }).click();
  await expect(page.getByText("No routes yet", { exact: false })).toBeVisible();
});
