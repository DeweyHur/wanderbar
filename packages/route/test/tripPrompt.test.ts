import { describe, expect, it } from "vitest";
import { tripPlanPrompt, type PromptTrip } from "../src/tripPrompt";

const sedona = { lat: 34.8697, lng: -111.7609 };
const phoenix = { lat: 33.5826, lng: -112.1135 };
const trip: PromptTrip = {
  title: "Arizona",
  startDate: "2026-11-21",
  endDate: "2026-11-25",
  transport: "flight",
  rentalCar: true,
  hotels: [
    { name: "Hyatt Place Phoenix-North", address: "10838 N 25th Ave, Phoenix, AZ", checkIn: "2026-11-23", checkOut: "2026-11-25", ...phoenix },
    { name: "Hyatt Piñon Pointe", address: "1 AZ-89A, Sedona, AZ", checkIn: "2026-11-21", checkOut: "2026-11-23", ...sedona },
  ],
  days: [
    { date: "2026-11-21", stops: [] },
    { date: "2026-11-22", stops: [{ name: "Wildflower" }, { name: "Bell Rock Trail", done: true }] },
    { date: "2026-11-23", stops: [] },
    { date: "2026-11-24", stops: [] },
    { date: "2026-11-25", stops: [] },
  ],
  places: [
    { name: "The Hudson", address: "671 AZ-179, Sedona", lat: 34.8655, lng: -111.7625, kind: "saved", hoursRaw: "Mon-Sun 11:00-21:00" },
    { name: "Sedona Beer Company", address: "465 Jordan Rd, Sedona", lat: 34.8705, lng: -111.7612, kind: "saved" },
    { name: "Pizzeria Bianco", address: "623 E Adams St, Phoenix", lat: 33.4492, lng: -112.0653, kind: "planned" },
    { name: "Grand Canyon South Rim", address: "Grand Canyon Village, AZ", lat: 36.0544, lng: -112.1401, kind: "been" },
    { name: "Somewhere in Seattle", address: "Seattle, WA", lat: 47.6, lng: -122.3, kind: "saved" },
  ],
};

describe("tripPlanPrompt", () => {
  const ko = tripPlanPrompt(trip, "ko");
  const en = tripPlanPrompt(trip, "en");

  it("states the trip, how you get around, and the hotels by night", () => {
    expect(ko).toContain("여행: Arizona · 11/21(토) ~ 11/25(수) (4박 5일)");
    expect(ko).toContain("이동: 비행기 + 현지 렌터카");
    // Hotels in date order, whatever order they were added.
    expect(ko.indexOf("Hyatt Piñon Pointe (1 AZ-89A")).toBeLessThan(ko.indexOf("Hyatt Place Phoenix-North (10838"));
    expect(ko).toContain("- 11/21(토) ~ 11/23(월) · 2박: Hyatt Piñon Pointe (1 AZ-89A, Sedona, AZ)");
    expect(en).toContain("Getting around: flying in, with a rental car there");
  });

  it("says where each day starts and ends, and what's already on it (not what's done)", () => {
    expect(ko).toContain("- 11/21(토): 도착/출발 → 🏨 Hyatt Piñon Pointe");
    expect(ko).toContain("- 11/22(일): 🏨 Hyatt Piñon Pointe → 🏨 Hyatt Piñon Pointe\n  이미 넣은 곳: Wildflower");
    expect(ko).toContain("- 11/23(월): 🏨 Hyatt Piñon Pointe → 🏨 Hyatt Place Phoenix-North");
    expect(ko).toContain("- 11/25(수): 🏨 Hyatt Place Phoenix-North → 집으로");
    expect(ko).not.toContain("Bell Rock Trail");
  });

  it("lists bookmarks under the nearest hotel, nearest first; far-off ones under elsewhere; unrelated ones dropped", () => {
    const sedonaBlock = ko.slice(ko.indexOf("[🏨 Hyatt Piñon Pointe 근처]"), ko.indexOf("[🏨 Hyatt Place Phoenix-North 근처]"));
    expect(sedonaBlock.indexOf("Sedona Beer Company")).toBeLessThan(sedonaBlock.indexOf("The Hudson"));
    expect(sedonaBlock).toContain("- The Hudson — 671 AZ-179, Sedona · 490 m · 저장한 맛집 · 영업 Mon-Sun 11:00-21:00");
    expect(ko).toMatch(/\[🏨 Hyatt Place Phoenix-North 근처\]\n- Pizzeria Bianco — 623 E Adams St, Phoenix · 15 km · 가고 싶은 곳/);
    expect(ko).toContain("[그 밖 (가는 길 등)]\n- Grand Canyon South Rim — Grand Canyon Village, AZ · 가 본 곳");
    expect(ko).not.toContain("Seattle");
    expect(en).toMatch(/Near 🏨 Hyatt Piñon Pointe\]\n- Sedona Beer Company — 465 Jordan Rd, Sedona · [\d.]+ (ft|mi) · saved restaurant/);
  });

  it("ends with what to ask for", () => {
    expect(ko).toContain("1. 날짜마다 아침부터 저녁까지 동선을 짜줘.");
    expect(ko).toContain("(새로운 곳)");
    expect(en).toContain("mark it (new)");
  });
});
