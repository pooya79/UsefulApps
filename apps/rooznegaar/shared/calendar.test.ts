import { describe, expect, it } from "vitest";
import {
  formatJalaliShort, jalaliParts, jalaliToIso, periodInfo, shiftPeriod
} from "./calendar";

describe("Jalali calendar helpers", () => {
  it("round-trips a Jalali date through ISO storage", () => {
    const iso = jalaliToIso(1405, 5, 8);
    expect(jalaliParts(iso)).toEqual({ jy: 1405, jm: 5, jd: 8 });
    expect(formatJalaliShort(iso)).toBe("1405/05/08");
  });

  it("builds Saturday through Friday weeks", () => {
    const thursday = jalaliToIso(1405, 5, 8);
    const week = periodInfo("week", thursday);
    expect(new Date(`${week.start}T12:00:00Z`).getUTCDay()).toBe(6);
    expect(new Date(`${week.end}T12:00:00Z`).getUTCDay()).toBe(5);
  });

  it("moves across Jalali month boundaries safely", () => {
    const esfandEnd = jalaliToIso(1404, 12, 29);
    const next = shiftPeriod("month", esfandEnd, 1);
    expect(jalaliParts(next)).toEqual({ jy: 1405, jm: 1, jd: 29 });
  });
});
