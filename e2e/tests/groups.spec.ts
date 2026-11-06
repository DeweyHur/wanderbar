import { expect, test } from "@playwright/test";
import { openHome, signIn, WEB } from "./helpers";

test("switch between groups from the title: food log and board game night", async ({ page }) => {
  await signIn(page, "Switcher");
  const foodId = await openHome(page);
  const bg = (await (
    await page.request.post("/api/groups", { headers: WEB, data: { name: "Saturday Board Games", module: "boardgame", timezone: "America/Los_Angeles" } })
  ).json()) as { id: string };

  // From the food group's title to the board game group.
  await page.goto(`/group/${foodId}`);
  await page.getByTestId("group-switcher").filter({ visible: true }).click();
  const rows = page.getByTestId("group-row").filter({ visible: true });
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "My log" })).toContainText("Food & day routes");
  await expect(rows.filter({ hasText: "Saturday Board Games" })).toContainText("Board game night");
  await rows.filter({ hasText: "Saturday Board Games" }).click();
  await expect(page).toHaveURL(new RegExp(`/group/${bg.id}$`));
  await expect(page.getByRole("button", { name: "Next night", exact: true }).filter({ visible: true })).toBeVisible();

  // And back; the app reopens the last group used.
  await page.getByTestId("group-switcher").filter({ visible: true }).click();
  await page.getByTestId("group-row").filter({ visible: true }).filter({ hasText: "My log" }).click();
  await expect(page).toHaveURL(new RegExp(`/group/${foodId}$`));
  await page.goto("/");
  await expect(page).toHaveURL(new RegExp(`/group/${foodId}$`));

  // A new group is one tap away from the list.
  await page.getByTestId("group-switcher").filter({ visible: true }).click();
  await page.getByRole("button", { name: "New group", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/group\/new$/);
});

test("each group has its own color theme, set by the owner", async ({ page, browser }) => {
  await signIn(page, "Painter");
  const foodId = await openHome(page);
  const bg = (await (
    await page.request.post("/api/groups", { headers: WEB, data: { name: "Game Night", module: "boardgame", timezone: "America/Los_Angeles" } })
  ).json()) as { id: string };
  const homeBg = () => page.getByTestId("group-home").filter({ visible: true }).evaluate((el) => getComputedStyle(el).backgroundColor);

  // The board game group goes dark ("Night"); the food group stays pink.
  await page.goto(`/group/${bg.id}/members`);
  await page.getByTestId("theme-night").filter({ visible: true }).click();
  await expect(page.getByTestId("theme-night").filter({ visible: true })).toContainText("✓");
  await expect(page.getByTestId("theme-pink").filter({ visible: true })).not.toContainText("✓");
  expect((await (await page.request.get(`/api/groups/${bg.id}`)).json()).theme).toBe("night");
  await page.goto(`/group/${bg.id}`);
  await expect.poll(homeBg).toBe("rgb(29, 27, 38)");

  await page.goto(`/group/${foodId}`);
  await expect.poll(homeBg).toBe("rgb(255, 243, 246)");
  await page.goto(`/group/${bg.id}`);
  await expect.poll(homeBg).toBe("rgb(29, 27, 38)");
  // Switching back to the food group brings its pink back.
  await page.getByTestId("group-switcher").filter({ visible: true }).click();
  await page.getByTestId("group-row").filter({ visible: true }).filter({ hasText: "My log" }).click();
  await expect(page).toHaveURL(new RegExp(`/group/${foodId}$`));
  await expect.poll(homeBg).toBe("rgb(255, 243, 246)");

  // Members see the theme but can't change it.
  const { url } = await (await page.request.post(`/api/groups/${bg.id}/invites`, { headers: WEB })).json();
  const friend = await (await browser.newContext({ locale: "en-US" })).newPage();
  await signIn(friend, "Guest");
  await friend.goto(new URL(url).pathname);
  await friend.getByRole("button", { name: "Join" }).click();
  await expect(friend.getByRole("button", { name: "Next night", exact: true }).filter({ visible: true })).toBeVisible();
  await expect.poll(() => friend.getByTestId("group-home").filter({ visible: true }).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(29, 27, 38)");
  await friend.goto(`/group/${bg.id}/members`);
  await expect(friend.getByTestId("theme-mint")).toHaveCount(0);
  expect((await friend.request.patch(`/api/groups/${bg.id}`, { headers: WEB, data: { theme: "mint" } })).status()).toBe(403);
});
