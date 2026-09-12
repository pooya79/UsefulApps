const DAY_MS = 86_400_000;

export function todayInTimezone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function parseDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Date must use YYYY-MM-DD");
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Invalid calendar date");
  }
  return parsed;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, amount: number): string {
  return formatDate(new Date(parseDate(date).getTime() + amount * DAY_MS));
}

export function diffDays(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / DAY_MS);
}

export function startOfSaturdayWeek(date: string): string {
  const parsed = parseDate(date);
  const daysSinceSaturday = (parsed.getUTCDay() + 1) % 7;
  return addDays(date, -daysSinceSaturday);
}

export function endOfSaturdayWeek(date: string): string {
  return addDays(startOfSaturdayWeek(date), 6);
}

export function enumerateDates(from: string, to: string): string[] {
  const count = diffDays(from, to);
  if (count < 0) return [];
  return Array.from({ length: count + 1 }, (_, index) => addDays(from, index));
}
