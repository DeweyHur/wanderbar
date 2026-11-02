/** Lifecycle of a stop in a plan. */
export type StopStatus =
  /** Not visited yet. */
  | "pending"
  /** The destination we're heading to now. At most one per plan. */
  | "current"
  /** Visited / finished. */
  | "done"
  /** Dropped for this trip ("이번엔 안 가기"). Can be restored. */
  | "skipped";

/** Minimal view of a stop for flow decisions. The list order IS the plan order. */
export type FlowItem = { id: string; status: StopStatus };

const promoteNext = <T extends FlowItem>(items: T[], start: number): T[] => {
  const cleared = items.map((it) => (it.status === "current" ? { ...it, status: "pending" as const } : it));
  const n = cleared.length;
  if (n === 0) return cleared;
  const from = Math.min(Math.max(start, 0), n);
  for (let k = 0; k < n; k++) {
    const i = (from + k) % n;
    if (cleared[i].status === "pending") return cleared.map((it, j) => (j === i ? { ...it, status: "current" as const } : it));
  }
  return cleared;
};

/**
 * The "naive scheduler": ordered stops, exactly one current while anything is pending.
 * Every function takes the plan in order and returns the new plan in order; callers persist
 * positions as orderIndex and the statuses as given.
 */
export const PlanFlow = {
  /** Guarantees at most one current, and one current whenever any pending exists. */
  normalize<T extends FlowItem>(items: T[]): T[] {
    let seen = false;
    const fixed = items.map((it) => {
      if (it.status !== "current") return it;
      if (seen) return { ...it, status: "pending" as const };
      seen = true;
      return it;
    });
    return seen ? fixed : promoteNext(fixed, 0);
  },

  add<T extends FlowItem>(items: T[], item: T): T[] {
    return PlanFlow.normalize([...items, { ...item, status: "pending" as const }]);
  },

  remove<T extends FlowItem>(items: T[], id: string): T[] {
    const index = items.findIndex((it) => it.id === id);
    if (index < 0) return items;
    const wasCurrent = items[index].status === "current";
    const rest = items.filter((_, i) => i !== index);
    return wasCurrent ? promoteNext(rest, index) : PlanFlow.normalize(rest);
  },

  /** "완료": mark done, the next pending after it becomes current (wrapping to the top). */
  complete<T extends FlowItem>(items: T[], id: string): T[] {
    const index = items.findIndex((it) => it.id === id);
    if (index < 0) return items;
    const wasCurrent = items[index].status === "current";
    const updated = items.map((it, i) => (i === index ? { ...it, status: "done" as const } : it));
    return wasCurrent ? promoteNext(updated, index + 1) : PlanFlow.normalize(updated);
  },

  /** "건너뛰기": push this stop to the end as pending and move on to the next one. */
  postpone<T extends FlowItem>(items: T[], id: string): T[] {
    const index = items.findIndex((it) => it.id === id);
    if (index < 0) return items;
    const item = items[index];
    const wasCurrent = item.status === "current";
    const updated = [...items.filter((_, i) => i !== index), { ...item, status: "pending" as const }];
    // The element that followed the postponed one now sits at `index`.
    return wasCurrent ? promoteNext(updated, index) : PlanFlow.normalize(updated);
  },

  /** "이번엔 안 가기": drop for this trip, keep it visible (dimmed). */
  drop<T extends FlowItem>(items: T[], id: string): T[] {
    const index = items.findIndex((it) => it.id === id);
    if (index < 0) return items;
    const wasCurrent = items[index].status === "current";
    const updated = items.map((it, i) => (i === index ? { ...it, status: "skipped" as const } : it));
    return wasCurrent ? promoteNext(updated, index + 1) : PlanFlow.normalize(updated);
  },

  /** Jump straight to a stop ("지금 여기로"). Any previous current goes back to pending. */
  setCurrent<T extends FlowItem>(items: T[], id: string): T[] {
    if (!items.some((it) => it.id === id)) return items;
    return items.map((it) =>
      it.id === id
        ? { ...it, status: "current" as const }
        : it.status === "current"
          ? { ...it, status: "pending" as const }
          : it,
    );
  },

  /** Bring a done/skipped stop back as pending. */
  restore<T extends FlowItem>(items: T[], id: string): T[] {
    return PlanFlow.normalize(items.map((it) => (it.id === id ? { ...it, status: "pending" as const } : it)));
  },

  /** Drag-and-drop reorder. Statuses are untouched. */
  move<T extends FlowItem>(items: T[], from: number, to: number): T[] {
    if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return items;
    const out = [...items];
    const [it] = out.splice(from, 1);
    out.splice(to, 0, it);
    return out;
  },

  /** Reset the whole plan for another run: everything pending, first one current. */
  restart<T extends FlowItem>(items: T[]): T[] {
    return PlanFlow.normalize(items.map((it) => ({ ...it, status: "pending" as const })));
  },
};
