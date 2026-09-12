import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shiftDays } from "../shared/calendar";
import { PlannerStore } from "./db";

describe("PlannerStore", () => {
  let store: PlannerStore;
  const today = "2026-07-30";

  beforeEach(() => {
    store = new PlannerStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("creates linked monthly, weekly, and daily items", () => {
    const data = store.bootstrap(today, today);
    const goal = store.createItem({
      planId: data.periods.month.plan.id,
      title: "Ship a meaningful project",
      priority: "high"
    });
    const priority = store.createItem({
      planId: data.periods.week.plan.id,
      parentId: goal.id,
      title: "Finish the first release"
    });
    const task = store.createItem({
      planId: data.periods.day.plan.id,
      parentId: priority.id,
      title: "Run the final checks",
      status: "done"
    });

    expect(task.parentId).toBe(priority.id);
    expect(store.bootstrap(today, today).periods.day.progress).toBe(100);
  });

  it("rejects invalid hierarchy links", () => {
    const data = store.bootstrap(today, today);
    const daily = store.createItem({
      planId: data.periods.day.plan.id,
      title: "A daily task"
    });
    expect(() => store.createItem({
      planId: data.periods.week.plan.id,
      parentId: daily.id,
      title: "Invalid weekly child"
    })).toThrow("week item");
  });

  it("offers unfinished work for selective rollover and preserves its source", () => {
    const previous = shiftDays(today, -1);
    const oldData = store.bootstrap(previous, today);
    const source = store.createItem({
      planId: oldData.periods.day.plan.id,
      title: "Continue tomorrow"
    });
    const current = store.bootstrap(today, today);

    expect(current.rollover.items.some(item => item.id === source.id)).toBe(true);
    const [copy] = store.rollover([{
      itemId: source.id,
      targetPlanId: current.periods.day.plan.id
    }]);
    expect(copy.sourceItemId).toBe(source.id);
    expect(copy.status).toBe("todo");
    expect(store.getItem(source.id)?.status).toBe("todo");
  });
});
