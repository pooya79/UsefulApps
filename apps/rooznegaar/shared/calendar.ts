import jalaali from "jalaali-js";
import type { PlanType } from "./types";

const { jalaaliMonthLength, toGregorian, toJalaali } = jalaali;
const TEHRAN = "Asia/Tehran";
const JALALI_MONTHS = [
  "Farvardin", "Ordibehesht", "Khordad", "Tir", "Mordad", "Shahrivar",
  "Mehr", "Aban", "Azar", "Dey", "Bahman", "Esfand"
];

export function isoDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TEHRAN, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

export function todayIso(): string {
  return isoDate(new Date());
}

export function fromIso(value: string): Date {
  return new Date(`${value}T12:00:00+03:30`);
}

export function shiftDays(value: string, amount: number): string {
  const date = fromIso(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDate(date);
}

export function jalaliParts(value: string) {
  const [gy, gm, gd] = value.split("-").map(Number);
  return toJalaali(gy, gm, gd);
}

export function jalaliToIso(jy: number, jm: number, jd: number): string {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

export function formatJalali(value: string, includeWeekday = true): string {
  const { jy, jm, jd } = jalaliParts(value);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: TEHRAN, weekday: "long"
  }).format(fromIso(value));
  return `${includeWeekday ? `${weekday}, ` : ""}${JALALI_MONTHS[jm - 1]} ${jd}, ${jy}`;
}

export function formatJalaliShort(value: string): string {
  const { jy, jm, jd } = jalaliParts(value);
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

export interface PeriodInfo {
  key: string;
  start: string;
  end: string;
  title: string;
}

export function periodInfo(type: PlanType, value: string): PeriodInfo {
  const parts = jalaliParts(value);
  if (type === "day") {
    return { key: value, start: value, end: value, title: formatJalali(value) };
  }
  if (type === "month") {
    const start = jalaliToIso(parts.jy, parts.jm, 1);
    const end = jalaliToIso(parts.jy, parts.jm, jalaaliMonthLength(parts.jy, parts.jm));
    return {
      key: `${parts.jy}-${String(parts.jm).padStart(2, "0")}`,
      start,
      end,
      title: `${JALALI_MONTHS[parts.jm - 1]} ${parts.jy}`
    };
  }
  const day = fromIso(value).getUTCDay();
  const daysSinceSaturday = (day + 1) % 7;
  const start = shiftDays(value, -daysSinceSaturday);
  const end = shiftDays(start, 6);
  return {
    key: start,
    start,
    end,
    title: `${formatJalaliShort(start)} — ${formatJalaliShort(end)}`
  };
}

export function shiftPeriod(type: PlanType, value: string, amount: number): string {
  if (type === "day") return shiftDays(value, amount);
  if (type === "week") return shiftDays(value, amount * 7);
  const { jy, jm, jd } = jalaliParts(value);
  const absolute = jy * 12 + (jm - 1) + amount;
  const nextYear = Math.floor(absolute / 12);
  const nextMonth = ((absolute % 12) + 12) % 12 + 1;
  const safeDay = Math.min(jd, jalaaliMonthLength(nextYear, nextMonth));
  return jalaliToIso(nextYear, nextMonth, safeDay);
}

export function englishWeekdayShort(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TEHRAN, weekday: "short"
  }).format(fromIso(value));
}
