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
