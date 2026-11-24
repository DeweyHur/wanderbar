import { expect, test } from "@playwright/test";
import { openHome, signIn, WEB } from "./helpers";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const clock = (d: Date) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);

// A reservation or a show: the stop gets a time, and the route says when to leave for it
// (the drive from the stop before it, plus 10 minutes). The phone also gets "time to leave" reminders.
test("a stop with a fixed time shows when to leave for it", async ({ page }) => {
  await signIn(page, "Booker");
  const groupId = await openHome(page);
  const post = (url: string, data: unknown) => page.request.post(url, { headers: WEB, data }).then((r) => r.json());
  const tomorrow = iso(new Date(Date.now() + 86_400_000));
  const plan = await post(`/api/groups/${groupId}/plans`, { date: tomorrow });
  const { stops } = await post(`/api/plans/${plan.id}/stops`, {
    stops: [
      { name: "Bell Rock Trail", lat: 34.7988, lng: -111.7646 },
      { name: "Dinner spot", address: "Sedona, AZ", lat: 34.8697, lng: -111.7609 },
    ],
  });

  await page.goto(`/plan/${plan.id}/stop/${stops[1].id}`);
  const fixed = page.getByTestId("fixed-time").filter({ visible: true });
  await fixed.getByRole("button", { name: "Set a time" }).click();
  await fixed.getByLabel("Be there at").fill("7:30pm");
  await fixed.getByRole("button", { name: "Save" }).click();
  await expect(fixed).toContainText("🕐 7:30 PM");

  // On the route: the time, and when to leave (Google's stand-in drive is 10 minutes, plus 10 to spare).
  await page.goto(`/plan/${plan.id}`);
  await expect(page.getByTestId("stop-row-1").filter({ visible: true }).getByTestId("fixed-line")).toHaveText("🕐 7:30 PM · leave by 7:10 PM");

  // What the phone schedules its "time to leave" reminders from.
  const { fixed: upcoming } = await (await page.request.get("/api/me/reminders")).json();
  expect(upcoming).toEqual([expect.objectContaining({ stopId: stops[1].id, name: "Dinner spot", from: "Bell Rock Trail", travelSeconds: 600 })]);

  // Cleared: no time, no reminder.
  await page.goto(`/plan/${plan.id}/stop/${stops[1].id}`);
  await fixed.getByRole("button", { name: "Clear" }).click();
  await expect(fixed).toContainText("None.");
  expect((await (await page.request.get("/api/me/reminders")).json()).fixed).toEqual([]);
});

test("today: the next fixed time is on top, and says 'leave now' once it's time", async ({ page }) => {
  await signIn(page, "Runner");
  const groupId = await openHome(page);
  const post = (url: string, data: unknown) => page.request.post(url, { headers: WEB, data }).then((r) => r.json());
  const plan = await post(`/api/groups/${groupId}/plans`, { date: iso(new Date()) });
  const { stops } = await post(`/api/plans/${plan.id}/stops`, {
    stops: [
      { name: "Bell Rock Trail", lat: 34.7988, lng: -111.7646 },
      { name: "Show", lat: 34.8697, lng: -111.7609 },
    ],
  });
  const at = new Date(Date.now() + 2 * 3600_000);
  at.setSeconds(0, 0);
  await page.request.patch(`/api/stops/${stops[1].id}`, { headers: WEB, data: { fixedAt: at.toISOString() } });
  await page.goto(`/plan/${plan.id}`);
  const next = page.getByTestId("fixed-next").filter({ visible: true });
  await expect(next).toContainText("Show");
  await expect(next.getByTestId("fixed-line")).toHaveText(`🕐 ${clock(at)} · leave by ${clock(new Date(at.getTime() - 20 * 60_000))}`);

  // 15 minutes to go, 20 needed: leave now.
  const soon = new Date(Date.now() + 15 * 60_000);
  soon.setSeconds(0, 0);
  await page.request.patch(`/api/stops/${stops[1].id}`, { headers: WEB, data: { fixedAt: soon.toISOString() } });
  await page.reload();
  await expect(next.getByTestId("fixed-line")).toHaveText(`🕐 ${clock(soon)} · leave now`);
});
