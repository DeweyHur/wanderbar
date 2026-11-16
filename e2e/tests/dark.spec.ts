import { expect, test, type Page } from "@playwright/test";
import { openHome, signIn, WEB } from "./helpers";

const bg = (page: Page) =>
  page.getByTestId("group-home").filter({ visible: true }).first().evaluate((el) => getComputedStyle(el).backgroundColor);

test("each person picks light, dark or the phone's setting; every group theme has a dark version", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await signIn(page, "Night Owl");
  const g = (await (await page.request.post("/api/groups", { headers: WEB, data: { name: "Mint Club", module: "boardgame", timezone: "America/Los_Angeles" } })).json()) as { id: string };
  await page.request.patch(`/api/groups/${g.id}`, { headers: WEB, data: { theme: "mint" } });

  // Default: same as the phone (dark here) → mint's dark version.
  await page.goto(`/group/${g.id}`);
  await expect(page.getByText("Mint Club").filter({ visible: true }).first()).toBeVisible();
  await expect.poll(() => bg(page)).toBe("rgb(23, 34, 31)");

  // Settings: always light.
  await page.goto("/settings");
  await page.getByTestId("appearance").filter({ visible: true }).getByRole("button", { name: "Light", exact: true }).click();
  await page.goto(`/group/${g.id}`);
  await expect.poll(() => bg(page)).toBe("rgb(239, 250, 245)");

  // Always dark, even when the phone is light; remembered after a reload.
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/settings");
  await page.getByTestId("appearance").filter({ visible: true }).getByRole("button", { name: "Dark", exact: true }).click();
  await page.goto(`/group/${g.id}`);
  await page.reload();
  await expect.poll(() => bg(page)).toBe("rgb(23, 34, 31)");
  void openHome;
});
