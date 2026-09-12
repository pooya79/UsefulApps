import { describe, expect, it } from "vitest";
import type { MetricDefinition } from "../shared/schema.js";
import { ScoreboardDatabase } from "./database.js";
import { calculateMetricStats } from "./stats.js";

const daily: MetricDefinition = { id: "push-ups", name: "Push-ups", category: "Exercise", unit: "reps", precision: 0, color: "#ff5c35", icon: "dumbbell", quickAdd: [10], target: { period: "daily", value: 50 } };
const weekly: MetricDefinition = { ...daily, id: "exercise", name: "Exercise", unit: "minutes", target: { period: "weekly", value: 140 } };

describe("score and streak calculations", () => {
  it("calculates daily progress and consecutive streaks", () => {
    const db = new ScoreboardDatabase(":memory:");
    db.syncMetrics([daily]);
    db.upsertEntries("2026-07-08", { "push-ups": 50 });
    db.upsertEntries("2026-07-09", { "push-ups": 70 });
    db.upsertEntries("2026-07-10", { "push-ups": 25 });
    const stats = calculateMetricStats(db, daily, "2026-07-10", "2026-07-10");
    expect(stats.progress).toBe(.5);
    expect(stats.currentStreak).toBe(0);
    expect(stats.bestStreak).toBe(2);
    db.close();
  });

  it("normalizes weekly progress against elapsed pace", () => {
    const db = new ScoreboardDatabase(":memory:");
    db.syncMetrics([weekly]);
    db.upsertEntries("2026-07-04", { exercise: 20 });
    db.upsertEntries("2026-07-05", { exercise: 20 });
    const stats = calculateMetricStats(db, weekly, "2026-07-05", "2026-07-05");
    expect(stats.periodValue).toBe(40);
    expect(stats.progress).toBe(1);
    db.close();
  });

  it("does not break a weekly streak during an unfinished current week", () => {
    const db = new ScoreboardDatabase(":memory:");
    db.syncMetrics([weekly]);
    db.upsertEntries("2026-06-27", { exercise: 140 });
    db.upsertEntries("2026-07-04", { exercise: 140 });
    const stats = calculateMetricStats(db, weekly, "2026-07-10", "2026-07-10");
    expect(stats.currentStreak).toBe(2);
    expect(stats.bestStreak).toBe(2);
    db.close();
  });
});
