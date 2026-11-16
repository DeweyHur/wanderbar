import { describe, expect, it } from "vitest";
import { compareVersions, needsUpdate } from "../src/appVersion";

describe("app versions", () => {
  it("compares number by number, not as text", () => {
    expect(compareVersions("0.4.0", "0.4.0")).toBe(0);
    expect(compareVersions("0.3.9", "0.4.0")).toBe(-1);
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.4.1", "0.4")).toBe(1);
  });
  it("an app older than the minimum must update; unknown versions are let through", () => {
    expect(needsUpdate("0.3.0", "0.4.0")).toBe(true);
    expect(needsUpdate("0.4.0", "0.4.0")).toBe(false);
    expect(needsUpdate("0.5.0", "0.4.0")).toBe(false);
    expect(needsUpdate(null, "0.4.0")).toBe(false);
    expect(needsUpdate("0.3.0", undefined)).toBe(false);
  });
});
