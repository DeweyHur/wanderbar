import { expect, test } from "@playwright/test";
import { current, openHome, signIn } from "./helpers";

test("add from a pasted Google Maps share into a new route", async ({ page }) => {
  await signIn(page, "Sharer");
  await openHome(page);
  await page.getByRole("button", { name: "Add from a link" }).click();
  await page.getByLabel("Paste a Google Maps or Yelp share").fill(
    "Blue Bottle Coffee\n315 Linden St, San Francisco, CA 94102\nhttps://maps.app.goo.gl/abc123",
  );
  await expect(page.getByText("From Google Maps")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Blue Bottle Coffee");
  await page.getByRole("button", { name: "New route" }).click();
  await expect(current(page)).toContainText("Blue Bottle Coffee");
  await expect(current(page)).toContainText("315 Linden St, San Francisco, CA 94102");
});

test("a Yelp share sentence becomes the place name and keeps the Yelp link", async ({ page }) => {
  await signIn(page, "Yelper");
  const home = await openHome(page);
  await page.getByRole("button", { name: "Add from a link" }).click();
  await page.getByLabel("Paste a Google Maps or Yelp share").fill("Check out Tsujita LA Artisan Noodle on Yelp! https://yelp.to/AbC12");
  await expect(page.getByText("From Yelp")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Tsujita LA Artisan Noodle");
  await page.getByRole("button", { name: "New route" }).click();
  await expect(current(page)).toContainText("Tsujita LA Artisan Noodle");

  const plans = await (await page.request.get(`/api/groups/${home}/plans`)).json();
  const plan = await (await page.request.get(`/api/plans/${plans.plans[0].id}`)).json();
  expect(plan.stops[0]).toMatchObject({ name: "Tsujita LA Artisan Noodle", yelpUrl: "https://yelp.to/AbC12" });
});
