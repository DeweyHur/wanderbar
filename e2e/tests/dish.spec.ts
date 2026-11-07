import { expect, test } from "@playwright/test";
import { openHome, signIn, WEB } from "./helpers";

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

test("who made it: any member changes it to someone else in the group", async ({ page, browser }) => {
  await signIn(page, "Recorder");
  const groupId = await openHome(page);
  const { url } = await (await page.request.post(`/api/groups/${groupId}/invites`, { headers: WEB })).json();
  const partner = await (await browser.newContext({ locale: "en-US", timezoneId: "America/Los_Angeles" })).newPage();
  await signIn(partner, "Partner");
  await partner.goto(new URL(url).pathname);
  await partner.getByRole("button", { name: "Join" }).click();
  await expect(partner.getByTestId("group-home").filter({ visible: true })).toBeVisible();

  const dish = await (await page.request.post(`/api/groups/${groupId}/dishes`, { headers: WEB, data: { name: "Gambas" } })).json();
  await page.request.post(`/api/dishes/${dish.id}/made`, { headers: WEB, data: {} });
  await page.goto(`/dish/${dish.id}`);
  const row = page.getByTestId("made-row").filter({ visible: true });
  await expect(row).toContainText("Recorder");
  await row.getByRole("button").first().click();
  await row.getByTestId("made-editor").getByRole("button", { name: "Partner" }).click();
  await expect(row).toContainText("Partner");
  await expect(row.getByTestId("made-editor")).toHaveCount(0);
  // The partner can fix it too (it's the household's log).
  const got = await (await partner.request.get(`/api/dishes/${dish.id}`)).json();
  expect(got.made.map((m: { name: string }) => m.name)).toEqual(["Partner"]);
});
