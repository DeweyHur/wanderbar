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
  // Before typing anything: places already added (day 1's park), nearest the hotel first.
  const known = page.getByTestId("visited-suggestion").filter({ visible: true });
  await expect(known).toHaveCount(1);
  await expect(known).toContainText("Golden Gate Park");
  await expect(known).toContainText("on your routes");
  await known.click();
  await expect(page.getByTestId("current-card").filter({ visible: true })).toContainText("Golden Gate Park");
  // Already on this day's route: not offered again.
  await expect(page.getByTestId("visited-suggestion").filter({ visible: true })).toHaveCount(0);
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

// The trip as a prompt for an AI: hotels by night, what each day has, and our bookmarks near each hotel.
test("trip: make an AI planning prompt from the hotels and our bookmarked places", async ({ page }) => {
  await signIn(page, "Planner");
  await openHome(page);
  const groupId = (await me(page.request)).groups[0].id;
  const post = (url: string, data: unknown) => page.request.post(url, { headers: WEB, data }).then((r) => r.json());
  const trip = await post(`/api/groups/${groupId}/trips`, { title: "Sedona", startDate: "2026-12-05", endDate: "2026-12-07", transport: "flight", rentalCar: true });
  await post(`/api/trips/${trip.id}/hotels`, { name: "Pinon Pointe", address: "1 AZ-89A, Sedona, AZ", lat: 34.8697, lng: -111.7609, checkIn: "2026-12-05", checkOut: "2026-12-07" });
  // Day 2 already has a place; another route bookmarked a cafe nearby.
  await post(`/api/plans/${trip.days[1].planId}/stops`, { stops: [{ name: "Wildflower", address: "101 AZ-89A, Sedona", lat: 34.8702, lng: -111.7615 }] });
  const other = await post(`/api/groups/${groupId}/plans`, { date: "2026-11-01" });
  await post(`/api/plans/${other.id}/stops`, { stops: [{ name: "Cafe Uno", address: "12 Main St, Sedona", lat: 34.8705, lng: -111.7612 }] });

  await page.goto(`/trip/${trip.id}`);
  const card = page.getByTestId("trip-prompt-card").filter({ visible: true });
  await card.getByRole("button", { name: "Make the prompt" }).click();
  const prompt = card.getByTestId("trip-prompt");
  await expect(prompt).toContainText("Please plan this trip day by day.");
  await expect(prompt).toContainText("Getting around: flying in, with a rental car there");
  await expect(prompt).toContainText("2 nights: Pinon Pointe (1 AZ-89A, Sedona, AZ)");
  await expect(prompt).toContainText("Already planned: Wildflower");
  await expect(prompt).toContainText("Near 🏨 Pinon Pointe");
  await expect(prompt).toContainText("Cafe Uno — 12 Main St, Sedona");
  await expect(prompt).toContainText("heading home");

  // Opens Claude with the prompt filled in (answered locally: outside sites aren't reachable here).
  await page.context().route("https://claude.ai/**", (r) => r.fulfill({ body: "claude" }));
  const popup = page.waitForEvent("popup");
  await card.getByRole("button", { name: "Open in Claude" }).click();
  const claude = await popup;
  await claude.waitForLoadState();
  expect(decodeURIComponent(new URL(claude.url()).searchParams.get("q") ?? "")).toContain("Cafe Uno");
  await claude.close();
});
