import { describe, expect, it } from "vitest";
import { addDays, startOfSaturdayWeek, todayInTimezone } from "./dates.js";

describe("date helpers", () => {
  it("uses Saturday as the start of the week", () => {
    expect(startOfSaturdayWeek("2026-07-10")).toBe("2026-07-04");
    expect(startOfSaturdayWeek("2026-07-11")).toBe("2026-07-11");
  });

  it("crosses month boundaries", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
  });

  it("derives Tehran local dates", () => {
    expect(todayInTimezone("Asia/Tehran", new Date("2026-07-10T21:00:00Z"))).toBe("2026-07-11");
  });
});
