import { expect, test, type Page } from "@playwright/test";
import { me, openHome, signIn, WEB } from "./helpers";

const visible = (page: Page, testId: string) => page.getByTestId(testId).filter({ visible: true });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).filter({ visible: true });

/** Fills an exercise in the routine editor: day `d`, exercise `e`. */
async function exercise(page: Page, d: number, e: number, fields: Record<string, string>) {
  const box = visible(page, `exercise-${d}-${e}`);
  for (const [label, value] of Object.entries(fields)) await box.getByRole("textbox", { name: label, exact: true }).fill(value);
  return box;
}

test("fitness: a 3-day split, sets with a rest timer, check-in, the next day of the cycle", async ({ page, browser }) => {
  await signIn(page, "Lifter");
  await openHome(page);
  await page.goto("/group/new");
  await button(page, "Fitness").click();
  await page.getByRole("textbox", { name: "Group name", exact: true }).filter({ visible: true }).fill("Gym crew");
  await button(page, "Create group").click();
  await expect(page.getByText("Set up your split first", { exact: false }).filter({ visible: true })).toBeVisible();
  const groupId = (await me(page.request)).groups.find((g) => g.name === "Gym crew")!.id;

  // The routine starts as a 3-day split; fill in day 1 and day 3.
  await button(page, "Set up my routine").click();
  const day1 = visible(page, "day-0");
  await expect(day1.getByRole("textbox", { name: "Day name", exact: true })).toHaveValue("Chest · shoulders · triceps");
  await expect(visible(page, "day-1").getByRole("textbox", { name: "Day name", exact: true })).toHaveValue("Lats · back · biceps");
  await day1.getByRole("button", { name: "Add exercise", exact: true }).click();
  await exercise(page, 0, 0, { Exercise: "Bench press", Sets: "2", Reps: "10", "Weight (kg)": "60", "Rest (sec)": "4" });
  await day1.getByRole("button", { name: "Add exercise", exact: true }).click();
  await exercise(page, 0, 1, { Exercise: "Dips", Sets: "1", Reps: "12", "Rest (sec)": "0" });
  const day3 = visible(page, "day-2");
  await day3.getByRole("button", { name: "Add exercise", exact: true }).click();
  const plank = await exercise(page, 2, 0, { Exercise: "Plank" });
  await plank.getByRole("button", { name: "Time", exact: true }).click();
  await exercise(page, 2, 0, { Sets: "1", Seconds: "2" });
  await button(page, "Save").click();

  const startCard = visible(page, "start-card");
  await expect(startCard).toContainText("Next: Chest · shoulders · triceps");

  // Check in. The bench is taken, so dips first.
  await button(page, "Start workout").click();
  await expect(visible(page, "exercise-list")).toBeVisible();
  await button(page, "Dips").click();
  await expect(visible(page, "set-counter")).toHaveText("Set 1 of 1");
  await expect(page.getByText("12 reps · bodyweight").filter({ visible: true })).toBeVisible();
  await button(page, "Set done").click();
  await expect(visible(page, "exercise-list")).toContainText("✓ Dips");

  // Bench: set 1 → rest (says the next set) → fix the reps during the rest → set 2 comes back by itself.
  await button(page, "Bench press").click();
  await expect(visible(page, "set-counter")).toHaveText("Set 1 of 2");
  await button(page, "Set done · rest").click();
  await expect(visible(page, "set-counter")).toHaveText("Next: set 2 of 2");
  await expect(visible(page, "rest-timer")).toHaveText(/^0:0[1-4]$/);
  const justDid = visible(page, "just-did");
  await justDid.getByRole("button", { name: "Fewer reps", exact: true }).click();
  await justDid.getByRole("button", { name: "Fewer reps", exact: true }).click();
  await expect(justDid).toContainText("8 reps");
  // Closing the page doesn't lose the workout.
  await page.reload();
  await expect(visible(page, "set-counter")).toHaveText("Set 2 of 2", { timeout: 15_000 });
  await button(page, "Set done").click();

  await button(page, "Finish workout").click();
  const done = visible(page, "workout-done");
  await expect(done).toContainText("Chest · shoulders · triceps done");
  await expect(done).toContainText("3"); // sets
  await expect(visible(page, "next-cycle")).toContainText("Lats · back · biceps");
  await button(page, "Back to the group").click();

  // Home: next day of the cycle, this week's attendance, the check-in.
  await expect(visible(page, "start-card")).toContainText("Next: Lats · back · biceps");
  await expect(visible(page, "start-card")).toContainText("Last time: Chest · shoulders · triceps");
  await expect(visible(page, "week-board")).toContainText("1 of 3");
  await expect(visible(page, "checkin").first()).toContainText("Lifter · Chest · shoulders · triceps");
  await expect(visible(page, "checkin").first()).toContainText("3 sets");

  const mine = await (await page.request.get(`/api/groups/${groupId}/workouts`)).json();
  const bench = mine.workouts[0].sets.filter((s: { name: string }) => s.name === "Bench press");
  expect(bench.map((s: { set: number; reps: number; weight: number }) => [s.set, s.reps, s.weight])).toEqual([
    [1, 8, 60],
    [2, 10, 60],
  ]);

  // Another day than the suggested one: legs, with a timed plank that finishes by itself.
  await button(page, "Legs · abs").click();
  await expect(visible(page, "start-card")).toContainText("Next: Legs · abs");
  await button(page, "Start workout").click();
  await button(page, "Plank").click();
  await button(page, "Start (2 s)").click();
  await expect(visible(page, "timed-timer")).toBeVisible();
  await expect(visible(page, "exercise-list")).toContainText("✓ Plank", { timeout: 10_000 });
  await button(page, "Finish workout").click();
  await expect(visible(page, "next-cycle")).toContainText("Chest · shoulders · triceps");
  await button(page, "Back to the group").click();
  await expect(visible(page, "week-board")).toContainText("2 of 3");

  // A friend in the group sees the check-ins, never the weights.
  const invite = await (await page.request.post(`/api/groups/${groupId}/invites`, { headers: WEB, data: {} })).json();
  const friend = await browser.newContext();
  const fp = await friend.newPage();
  await signIn(fp, "Buddy");
  expect((await fp.request.post(`/api/invites/${invite.token}/accept`, { headers: WEB, data: {} })).ok()).toBeTruthy();
  const seen = await (await fp.request.get(`/api/groups/${groupId}/fitness`)).json();
  expect(seen.feed.map((f: { name: string; dayName: string }) => `${f.name} · ${f.dayName}`)).toEqual(["Lifter · Legs · abs", "Lifter · Chest · shoulders · triceps"]);
  expect(JSON.stringify(seen.feed)).not.toContain("Bench press");
  expect(seen.routine).toBeNull();
  expect((await (await fp.request.get(`/api/groups/${groupId}/workouts`)).json()).workouts).toEqual([]);
  await fp.goto(`/group/${groupId}`);
  await expect(visible(fp, "week-board")).toContainText("Buddy");
  await expect(fp.getByText("Set up your split first", { exact: false }).filter({ visible: true })).toBeVisible();
  await friend.close();
});
