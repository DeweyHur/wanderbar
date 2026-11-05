import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const WEB = { "x-wanderbar-client": "web" };

/** Signs a fresh test user in (test-only endpoint) and opens the app. */
export async function signIn(page: Page, name: string) {
  const email = `${name.toLowerCase().replace(/\W+/g, "")}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.dev`;
  const res = await page.request.post("/api/auth/test-login", { headers: WEB, data: { email, name } });
  expect(res.ok(), await res.text()).toBeTruthy();
  await page.goto("/");
  return email;
}

export async function me(request: APIRequestContext) {
  const res = await request.get("/api/me");
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { user: { id: string; email: string }; groups: { id: string; name: string; module: string; role: string }[] };
}

/** Waits until the personal group exists and the group home is open; returns its id. */
export async function openHome(page: Page) {
  await expect(page.getByRole("button", { name: "New route" })).toBeVisible();
  const { groups } = await me(page.request);
  expect(groups).toHaveLength(1);
  return groups[0].id;
}

/** In the day picker that "New route" opens: "Today", "Tomorrow", or a calendar day "YYYY-MM-DD". */
export async function pickDay(page: Page, day = "Today") {
  await page.getByTestId("day-picker").getByRole("button", { name: day, exact: true }).click();
}

/** New route (for today unless another day is given) from the group home; leaves the route screen open. */
export async function newRoute(page: Page, day = "Today") {
  await page.getByRole("button", { name: "New route" }).click();
  await pickDay(page, day);
  await expect(addInput(page)).toBeVisible();
}

export async function quickAdd(page: Page, text: string) {
  const input = addInput(page);
  await input.fill(text);
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

export const current = (page: Page) => page.getByTestId("current-card");
export const row = (page: Page, i: number) => page.getByTestId(`stop-row-${i}`);

/** The route's add field ("Search a place, or type cafe, park, jazz bar" when place search is on). */
export const addInput = (page: Page) => page.getByPlaceholder(/cafe, park, jazz bar/i);
