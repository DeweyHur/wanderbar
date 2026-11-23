import { expect, test } from "@playwright/test";
import { openHome, signIn, WEB } from "./helpers";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const inDays = (n: number) => iso(new Date(Date.now() + n * 86_400_000));

// A route has three views: a past day is a record you check off, today is live, a later day is planning.
// Today's routes sit on top of the routes list.
test("past, today and future routes each get their own view; today's route is listed first", async ({ page }) => {
  await signIn(page, "Phases");
  const groupId = await openHome(page);
  const post = (url: string, data: unknown) => page.request.post(url, { headers: WEB, data }).then((r) => r.json());
  const past = await post(`/api/groups/${groupId}/plans`, { date: inDays(-2), title: "Sedona day" });
  await post(`/api/plans/${past.id}/stops`, { stops: [{ name: "Bell Rock Trail" }, { name: "Midgley Bridge" }] });
  const future = await post(`/api/groups/${groupId}/plans`, { date: inDays(3), title: "Phoenix day" });
  await post(`/api/plans/${future.id}/stops`, { stops: [{ name: "Desert Botanical Garden" }, { name: "Pizzeria Bianco" }] });
  const now = await post(`/api/groups/${groupId}/plans`, { date: inDays(0), title: "Today in town" });
  await post(`/api/plans/${now.id}/stops`, { stops: [{ name: "Coffee" }] });

  // The list: today's route first, highlighted, above the upcoming and past ones.
  await page.goto(`/group/${groupId}`);
  const todays = page.getByTestId("today-route").filter({ visible: true });
  await expect(todays).toHaveCount(1);
  await expect(todays).toContainText("Today in town");
  const box = async (l: ReturnType<typeof page.getByTestId>) => (await l.boundingBox())!.y;
  expect(await box(todays)).toBeLessThan(await box(page.getByTestId("route-card").filter({ visible: true }).first()));

  // Future: planning only. No "heading to" card, every stop editable, nothing struck or current.
  await page.goto(`/plan/${future.id}`);
  await expect(page.getByTestId("future-route").filter({ visible: true })).toContainText("Planned for");
  await expect(page.getByTestId("current-card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start over" })).toHaveCount(0);
  await page.getByLabel("Move down").filter({ visible: true }).first().click();
  await expect(page.getByTestId("stop-row-0").filter({ visible: true })).toContainText("Pizzeria Bianco");
  // Its stops: no "go here now" before the day.
  await page.getByTestId("stop-row-0").filter({ visible: true }).getByText("Pizzeria Bianco").click();
  await expect(page.getByText("On an upcoming route").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Go here now" })).toHaveCount(0);

  // Past: a record. No editing, no "heading to"; check off where you went.
  await page.goto(`/plan/${past.id}`);
  const record = page.getByTestId("past-route").filter({ visible: true });
  await expect(record).toContainText("went to 0 of 2 places");
  await expect(page.getByTestId("current-card")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Route name" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove Bell Rock Trail" })).toHaveCount(0);
  await expect(page.getByLabel("Move down")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Went to Midgley Bridge" }).filter({ visible: true }).click();
  await expect(record).toContainText("went to 1 of 2 places");
  await expect(page.getByTestId("stop-row-1").filter({ visible: true })).toContainText("Went");
  // …and undo it from the stop's own page.
  await page.getByTestId("stop-row-1").filter({ visible: true }).getByText("Midgley Bridge").click();
  await expect(page.getByText("On a past route · Went").filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo went" }).filter({ visible: true }).click();
  await expect(page.getByText("On a past route · Didn't go").filter({ visible: true })).toBeVisible();

  // Today: live, as before.
  await page.goto(`/plan/${now.id}`);
  await expect(page.getByTestId("current-card").filter({ visible: true })).toContainText("Coffee");
});

test("a trip's day for today is on top of the trip and of the routes list", async ({ page }) => {
  await signIn(page, "Tripday");
  const groupId = await openHome(page);
  const trip = await page.request
    .post(`/api/groups/${groupId}/trips`, { headers: WEB, data: { title: "Arizona", startDate: inDays(-1), endDate: inDays(1), transport: "car" } })
    .then((r) => r.json());
  await page.goto(`/trip/${trip.id}`);
  const top = page.getByTestId("trip-today").filter({ visible: true });
  await expect(top).toContainText("Day 2 · Today");
  await page.goto(`/group/${groupId}`);
  await expect(page.getByTestId("today-route").filter({ visible: true })).toContainText("Arizona");
});

// A restaurant can be rated without any menus, and your visits can be moved, removed or logged for another day.
test("rate a restaurant with no menu; edit its visit history", async ({ page }) => {
  await signIn(page, "Diner");
  const groupId = await openHome(page);
  const { restaurant } = await (await page.request.post(`/api/groups/${groupId}/restaurants`, { headers: WEB, data: { name: "Mariposa" } })).json();
  await page.goto(`/restaurant/${restaurant.id}`);

  const reviews = page.getByTestId("reviews").filter({ visible: true });
  await expect(reviews).toContainText("How was it?");
  await reviews.getByRole("button", { name: /^(⭐ )?Rate$/ }).click();
  await page.getByRole("button", { name: "4 stars", exact: true }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Save rating" }).filter({ visible: true }).click();
  await expect(reviews.getByTestId("review")).toContainText("Diner");
  await expect(page.getByTestId("restaurant-info").filter({ visible: true })).toContainText("4.0");

  // Two visits by mistake (one by hand, one from a route): move one to another day, delete the other.
  const rows = page.getByTestId("visit-row").filter({ visible: true });
  await page.getByRole("button", { name: "Went today" }).click();
  await expect(rows).toHaveCount(1);
  await page.getByRole("button", { name: "Went another day" }).click();
  await page.getByTestId("day-picker").getByRole("button", { name: "Today", exact: true }).click();
  await expect(rows).toHaveCount(2);

  const day = new Date(Date.now() - 86_400_000);
  const label = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(day);
  await rows.nth(0).getByRole("button", { name: "Change day" }).click();
  const picker = page.getByTestId("day-picker");
  if (day.getMonth() !== new Date().getMonth()) await picker.getByRole("button", { name: "Previous month" }).click();
  await picker.getByRole("button", { name: iso(day), exact: true }).click();
  await expect(rows.filter({ hasText: label })).toHaveCount(1);

  page.once("dialog", (d) => d.accept());
  await rows.filter({ hasNotText: label }).getByRole("button", { name: "Delete" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(label);
});
