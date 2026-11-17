import { expect, test } from "@playwright/test";
import { me, openHome, signIn, WEB, openMore } from "./helpers";

test("signed out: the sign-in screen, and the API refuses", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("wanderbar", { exact: true })).toBeVisible();
  await expect(page.getByText("A private log for your people", { exact: false })).toBeVisible();
  expect((await page.request.get("/api/me")).status()).toBe(401);
});

test("first sign-in works solo: a personal group is created automatically", async ({ page }) => {
  await signIn(page, "Solo");
  await openHome(page);
  const { groups } = await me(page.request);
  expect(groups[0]).toMatchObject({ name: "My log", module: "food", role: "owner" });
  await expect(page.getByRole("button", { name: "Day routes", exact: true })).toBeVisible();
  await expect(page.getByText("No routes yet", { exact: false })).toBeVisible();

  await openMore(page);
  await page.getByRole("button", { name: "Members & invite" }).click();
  await expect(page.getByText("It's just you for now", { exact: false })).toBeVisible();
});

test("language: switch to Korean and back; the choice is saved on the account", async ({ page }) => {
  await signIn(page, "Lang");
  await openHome(page);
  await openMore(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "한국어" }).click();
  await expect(page.getByText("언어", { exact: true })).toBeVisible();
  expect((await me(page.request)).user).toMatchObject({ locale: "ko" });
  await page.goBack();
  await expect(page.getByTestId("group-menu").filter({ visible: true })).toBeVisible();

  await page.getByTestId("group-menu").filter({ visible: true }).getByRole("button", { name: "설정" }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByText("Language", { exact: true })).toBeVisible();
});

test("security: cookie writes need the client header, and the test login is the only shortcut", async ({ page }) => {
  await signIn(page, "Csrf");
  await openHome(page);
  const withoutHeader = await page.request.post("/api/groups", { data: { name: "x" } });
  expect(withoutHeader.status()).toBe(403);
  expect(await withoutHeader.json()).toEqual({ error: "csrf" });
  const ok = await page.request.post("/api/groups", { headers: WEB, data: { name: "Second" } });
  expect(ok.status()).toBe(201);
  const res = await page.request.get("/api/health");
  expect(res.headers()["x-robots-tag"]).toContain("noindex");
});
