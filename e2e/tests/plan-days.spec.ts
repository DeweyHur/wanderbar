import { expect, test } from "@playwright/test";
import { current, openHome, pickDay, signIn, WEB } from "./helpers";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
/** The next Saturday at least 2 days away. */
const nextSaturday = () => {
  const d = inDays(2);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  return d;
};

test("plan a route for a future day from the calendar; upcoming and past are listed apart", async ({ page }) => {
  await signIn(page, "Planner");
  const groupId = await openHome(page);
  await page.request.post(`/api/groups/${groupId}/plans`, { headers: WEB, data: { title: "Last spring", date: "2026-04-01" } });

  const day = inDays(12);
  await page.getByRole("button", { name: "New route" }).click();
  const picker = page.getByTestId("day-picker");
  if (day.getMonth() !== new Date().getMonth()) await picker.getByRole("button", { name: "Next month" }).click();
  await picker.getByRole("button", { name: iso(day), exact: true }).click();

  const label = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(day);
  await expect(page.getByTestId("plan-day").filter({ visible: true })).toContainText(label);
  const plans = (await (await page.request.get(`/api/groups/${groupId}/plans`)).json()).plans;
  expect(plans.find((p: { title: string }) => p.title === "")).toMatchObject({ date: iso(day) });

  await page.goto(`/group/${groupId}`);
  const cards = page.getByTestId("route-card").filter({ visible: true });
  await expect(page.getByText("Upcoming", { exact: true })).toBeVisible();
  await expect(page.getByText("Past", { exact: true })).toBeVisible();
  await expect(cards.nth(0)).toContainText(`Route · ${label}`);
  await expect(cards.nth(1)).toContainText("Last spring");
});

test("move a route to another day; places show their hours for that day", async ({ page }) => {
  await signIn(page, "Mover");
  const groupId = await openHome(page);
  const plan = await (await page.request.post(`/api/groups/${groupId}/plans`, { headers: WEB, data: { date: iso(new Date()) } })).json();
  await page.request.post(`/api/plans/${plan.id}/stops`, {
    headers: WEB,
    data: { stops: [{ name: "Weekday Lunch", hoursRaw: "Mon-Fri 11:00-14:00" }, { name: "Night Bar", hoursRaw: "Mon-Sun 17:00-23:00" }] },
  });
  await page.goto(`/plan/${plan.id}`);
  await expect(page.getByTestId("plan-day").filter({ visible: true })).toContainText("Today");

  const sat = nextSaturday();
  await page.getByRole("button", { name: "Change day" }).click();
  const picker = page.getByTestId("day-picker");
  if (sat.getMonth() !== new Date().getMonth()) await picker.getByRole("button", { name: "Next month" }).click();
  await picker.getByRole("button", { name: iso(sat), exact: true }).click();
  await expect(page.getByTestId("plan-day").filter({ visible: true })).toContainText("Sat");
  await expect(current(page)).toContainText("Closed that day");
  await expect(page.getByTestId("stop-row-1")).toContainText("That day 17:00–23:00");
  expect((await (await page.request.get(`/api/plans/${plan.id}`)).json()).date).toBe(iso(sat));
});

test("new route for tomorrow from the quick chips", async ({ page }) => {
  await signIn(page, "Tomorrow");
  await openHome(page);
  await page.getByRole("button", { name: "New route" }).click();
  await pickDay(page, "Tomorrow");
  await expect(page.getByTestId("plan-day").filter({ visible: true })).toContainText("Tomorrow");
});
