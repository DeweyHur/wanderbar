import { expect, test } from "@playwright/test";
import { addInput, me, openHome, pickDay, signIn, WEB } from "./helpers";

// A trip: dates, how you get there (rental car?), a hotel for a stretch of nights, and a route per day
// that ends at that night's hotel, with place search starting around the hotel.
test("trip: flight with a rental car, a hotel stay, each day's route ends at the hotel", async ({ page }) => {
  await signIn(page, "Traveler");
  await openHome(page);
  await page.getByRole("button", { name: "New trip" }).click();
  await page.getByLabel("Trip name").fill("Bay weekend");
  await page.getByRole("button", { name: "First day" }).click();
  await pickDay(page, "Today");
  await expect(page.getByTestId("day-picker")).toHaveCount(0);
  await page.getByRole("button", { name: "Last day" }).click();
  await pickDay(page, "Tomorrow");
  // Rental car is only asked when not driving your own car.
  await expect(page.getByTestId("trip-rental")).toHaveCount(0);
  await page.getByRole("button", { name: "Flight" }).click();
  await page.getByTestId("trip-rental").getByRole("button", { name: "Rental car" }).click();
  await page.getByRole("button", { name: "Create trip" }).click();

  const trip = page.getByTestId("trip-screen").filter({ visible: true });
  await expect(trip.getByTestId("trip-day")).toHaveCount(2);
  await expect(trip.getByTestId("trip-day").nth(1)).toContainText("heading home");

  // The hotel: found with search; by default you stay until the last day.
  await trip.getByLabel("Add a hotel").fill("blue");
  await page.getByText("Blue Bottle Coffee").click();
  await expect(trip.getByText("1 night")).toBeVisible();
  await trip.getByRole("button", { name: "Add hotel" }).click();
  await expect(trip.getByTestId("hotel-card")).toContainText("Blue Bottle Coffee");
  await expect(trip.getByTestId("trip-day").nth(0)).toContainText("ends at 🏨 Blue Bottle Coffee");

  // Day 1: the hotel is the fixed last stop, and search starts around it.
  await trip.getByTestId("trip-day").nth(0).click();
  await expect(page.getByTestId("end-hotel").filter({ visible: true })).toContainText("Blue Bottle Coffee");
  await expect(page.getByTestId("place-origin").filter({ visible: true })).toHaveText("Nearest to 🏨 Blue Bottle Coffee first");
  await expect(page.getByTestId("place-zip").filter({ visible: true })).toHaveCount(0);
  await addInput(page).fill("golden");
  await page.getByText("Golden Gate Park").first().click();
  await expect(page.getByTestId("current-card").filter({ visible: true })).toContainText("Golden Gate Park");
  await page.goBack();

  // Day 2 starts from the hotel and heads home (no hotel that night).
  await page.getByTestId("trip-screen").filter({ visible: true }).getByTestId("trip-day").nth(1).click();
  await expect(page.getByTestId("start-hotel").filter({ visible: true })).toContainText("Starting from 🏨 Blue Bottle Coffee");
  await expect(page.getByTestId("end-hotel").filter({ visible: true })).toHaveCount(0);
  await page.goBack();
  await page.goBack();

  // The routes tab lists the trip (its days aren't listed as separate routes).
  await page.reload();
  await expect(page.getByTestId("trip-card").filter({ visible: true })).toContainText("Bay weekend");
  await expect(page.getByTestId("trip-card").filter({ visible: true })).toContainText("rental car");
  await expect(page.getByTestId("route-card").filter({ visible: true })).toHaveCount(0);
});

test("trip API: overlapping hotel stays are refused", async ({ page }) => {
  await signIn(page, "Overlap");
  await openHome(page);
  const groupId = (await me(page.request)).groups[0].id;
  const h = WEB;
  const trip = await (await page.request.post(`/api/groups/${groupId}/trips`, { headers: h, data: { startDate: "2026-12-01", endDate: "2026-12-04" } })).json();
  expect(trip.days).toHaveLength(4);
  expect((await page.request.post(`/api/trips/${trip.id}/hotels`, { headers: h, data: { name: "A", checkIn: "2026-12-01", checkOut: "2026-12-03" } })).status()).toBe(201);
  const r = await page.request.post(`/api/trips/${trip.id}/hotels`, { headers: h, data: { name: "B", checkIn: "2026-12-02", checkOut: "2026-12-04" } });
  expect([r.status(), (await r.json()).error]).toEqual([400, "trip.hotel_overlap"]);
});
