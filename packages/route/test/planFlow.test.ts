// Ported from legacy-android PlanFlowTest.kt (same scenarios and expectations).
import { describe, expect, it } from "vitest";
import { PlanFlow, type FlowItem, type StopStatus } from "../src";

const plan = (...s: StopStatus[]): FlowItem[] => s.map((status, i) => ({ id: String(i + 1), status }));
const ids = (p: FlowItem[]) => p.map((i) => i.id);
const st = (p: FlowItem[]) => p.map((i) => i.status);

describe("PlanFlow", () => {
  it("first added becomes current", () => {
    const p = PlanFlow.add([], { id: "1", status: "pending" });
    expect(st(p)).toEqual(["current"]);
    expect(st(PlanFlow.add(p, { id: "2", status: "pending" }))).toEqual(["current", "pending"]);
  });
  it("complete moves to next", () => {
    expect(st(PlanFlow.complete(plan("current", "pending", "pending"), "1"))).toEqual(["done", "current", "pending"]);
  });
  it("complete wraps to an earlier pending", () => {
    expect(st(PlanFlow.complete(plan("pending", "done", "current"), "3"))).toEqual(["current", "done", "done"]);
  });
  it("completing the last leaves no current", () => {
    expect(st(PlanFlow.complete(plan("done", "current"), "2"))).toEqual(["done", "done"]);
  });
  it("postpone moves to the end and advances", () => {
    const p = PlanFlow.postpone(plan("done", "current", "pending", "pending"), "2");
    expect(ids(p)).toEqual(["1", "3", "4", "2"]);
    expect(st(p)).toEqual(["done", "current", "pending", "pending"]);
  });
  it("postponing the only remaining stop keeps it current", () => {
    const p = PlanFlow.postpone(plan("done", "current", "done"), "2");
    expect(ids(p)).toEqual(["1", "3", "2"]);
    expect(st(p)).toEqual(["done", "done", "current"]);
  });
  it("drop skips and advances", () => {
    expect(st(PlanFlow.drop(plan("current", "pending"), "1"))).toEqual(["skipped", "current"]);
  });
  it("setCurrent demotes the old one", () => {
    expect(st(PlanFlow.setCurrent(plan("current", "pending", "pending"), "3"))).toEqual(["pending", "pending", "current"]);
  });
  it("restore promotes when nothing is current", () => {
    expect(st(PlanFlow.restore(plan("done", "skipped"), "2"))).toEqual(["done", "current"]);
  });
  it("removing the current promotes the following stop", () => {
    const p = PlanFlow.remove(plan("pending", "current", "pending"), "2");
    expect(ids(p)).toEqual(["1", "3"]);
    expect(st(p)).toEqual(["pending", "current"]);
  });
  it("move keeps statuses", () => {
    const p = PlanFlow.move(plan("current", "pending", "pending"), 0, 2);
    expect(ids(p)).toEqual(["2", "3", "1"]);
    expect(st(p)).toEqual(["pending", "pending", "current"]);
  });
  it("normalize fixes a double current", () => {
    expect(st(PlanFlow.normalize(plan("current", "current")))).toEqual(["current", "pending"]);
  });
  it("restart resets all", () => {
    expect(st(PlanFlow.restart(plan("done", "skipped", "current")))).toEqual(["current", "pending", "pending"]);
  });
  it("keeps extra fields on items", () => {
    const p = PlanFlow.complete([{ id: "a", status: "current", name: "Cafe" }, { id: "b", status: "pending", name: "Park" }], "a");
    expect(p[1]).toEqual({ id: "b", status: "current", name: "Park" });
  });
});
