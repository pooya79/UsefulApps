import { describe, expect, it } from "vitest";
import type { MetricDefinition } from "../shared/schema.js";
import { ScoreboardDatabase } from "./database.js";

const metric: MetricDefinition = { id: "pages", name: "Pages", category: "English", unit: "pages", precision: 0, color: "#22c997", icon: "book-open", quickAdd: [5], target: { period: "daily", value: 10 } };

describe("database", () => {
  it("upserts corrections without duplicate rows", () => {
    const db = new ScoreboardDatabase(":memory:");
    db.syncMetrics([metric]);
    db.upsertEntries("2026-07-10", { pages: 5 });
    db.upsertEntries("2026-07-10", { pages: 12 });
    expect(db.getEntries("2026-07-10", "2026-07-10")).toEqual([{ metricId: "pages", date: "2026-07-10", value: 12 }]);
    db.close();
  });

  it("archives removed metrics while retaining entries", () => {
    const db = new ScoreboardDatabase(":memory:");
    db.syncMetrics([metric]);
    db.upsertEntries("2026-07-10", { pages: 10 });
    db.syncMetrics([]);
    expect(db.getAllEntries("pages")).toHaveLength(1);
    expect(db.getCatalog()[0].active).toBe(0);
    expect(() => db.upsertEntries("2026-07-11", { pages: 10 })).toThrow("Unknown active metric");
    db.close();
  });
});
