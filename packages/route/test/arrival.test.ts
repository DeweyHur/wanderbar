import { describe, expect, it } from "vitest";
import { arrivalPrompt, type ArrivalStop } from "../src/arrival";

// Sedona: Wildflower and Sedona Beer Company are ~300 m apart; Bell Rock is ~8 km south.
const wildflower: ArrivalStop = { id: "w", name: "Wildflower", lat: 34.8702, lng: -111.7615, status: "current" };
const beer: ArrivalStop = { id: "b", name: "Sedona Beer Company", lat: 34.8727, lng: -111.7625, status: "pending" };
const bell: ArrivalStop = { id: "r", name: "Bell Rock", lat: 34.7988, lng: -111.7646, status: "pending" };
const typed: ArrivalStop = { id: "t", name: "Somewhere", lat: null, lng: null, status: "pending" };
const stops = [wildflower, beer, bell, typed];
const at = (s: ArrivalStop) => ({ lat: s.lat!, lng: s.lng! });

describe("arrivalPrompt", () => {
  it("asks nothing while you're at the current stop, and remembers you were there", () => {
    const seen = new Set<string>();
    expect(arrivalPrompt(stops, at(wildflower), seen, new Set())).toBeNull();
    expect(seen.has("w")).toBe(true);
  });

  it("at another stop: offers to switch to it, finishing the current one if you'd been there", () => {
    expect(arrivalPrompt(stops, at(bell), new Set(), new Set())).toEqual({ kind: "here", key: "here:r", stop: bell, finish: null });
    expect(arrivalPrompt(stops, at(bell), new Set(["w"]), new Set())).toEqual({ kind: "here", key: "here:r", stop: bell, finish: wildflower });
  });

  it("left the current stop after being there: offers to mark it done", () => {
    const halfway = { lat: 34.835, lng: -111.763 }; // between town and Bell Rock, near nothing
    expect(arrivalPrompt(stops, halfway, new Set(), new Set())).toBeNull(); // never was there
    expect(arrivalPrompt(stops, halfway, new Set(["w"]), new Set())).toEqual({ kind: "left", key: "left:w", stop: wildflower });
  });

  it("'not now' keeps that question from coming back, and stops without a location never match", () => {
    expect(arrivalPrompt(stops, at(bell), new Set(), new Set(["here:r"]))).toBeNull();
    expect(arrivalPrompt([typed], { lat: 0, lng: 0 }, new Set(), new Set())).toBeNull();
  });

  it("done or skipped stops aren't offered", () => {
    expect(arrivalPrompt([wildflower, { ...bell, status: "done" }], at(bell), new Set(), new Set())).toBeNull();
  });
});
