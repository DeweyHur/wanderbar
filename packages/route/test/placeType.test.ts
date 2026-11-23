import { describe, expect, it } from "vitest";
import { placeTypeFromGoogle } from "../src/restaurant";

describe("placeTypeFromGoogle", () => {
  it.each([
    ["ramen_restaurant", "food"],
    ["coffee_shop", "food"],
    ["bar", "food"],
    ["park", "sight"],
    ["hiking_area", "sight"],
    ["tourist_attraction", "sight"],
    ["museum", "sight"],
    ["bridge", "sight"],
    ["concert_hall", "venue"],
    ["stadium", "venue"],
    ["performing_arts_theater", "venue"],
    ["event_venue", "venue"],
    ["lodging", "stay"],
    ["hotel", "stay"],
    ["resort_hotel", "stay"],
    ["gas_station", "other"],
  ])("%s → %s", (type, want) => expect(placeTypeFromGoogle(type)).toBe(want));

  it("looks at the other types when the main one is vague, and gives null for nothing", () => {
    expect(placeTypeFromGoogle("point_of_interest", ["establishment", "natural_feature"])).toBe("sight");
    expect(placeTypeFromGoogle("", ["lodging", "point_of_interest"])).toBe("stay");
    expect(placeTypeFromGoogle(null)).toBeNull();
  });
});
