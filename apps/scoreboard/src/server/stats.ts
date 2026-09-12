import type { MetricDefinition, MetricStats } from "../shared/schema.js";
import type { ScoreboardDatabase } from "./database.js";
import { addDays, diffDays, endOfSaturdayWeek, enumerateDates, startOfSaturdayWeek } from "./dates.js";

function streak(values: Map<string, number>, target: number, dates: string[], currentKey: string) {
  let best = 0;
  let run = 0;
  let current = 0;
  for (const date of dates) {
    if ((values.get(date) ?? 0) >= target) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
    if (date === currentKey) current = run;
  }
  return { current, best };
}

export function calculateMetricStats(database: ScoreboardDatabase, metric: MetricDefinition, date: string, today: string): MetricStats {
  const all = database.getAllEntries(metric.id);
  const byDate = new Map(all.map((entry) => [entry.date, entry.value]));
  if (metric.target.period === "daily") {
    const first = all[0]?.date ?? today;
    const end = today;
    const dates = enumerateDates(first, end);
    const result = streak(byDate, metric.target.value, dates, today);
    const value = byDate.get(date) ?? 0;
    return {
      metricId: metric.id,
      periodValue: value,
      progress: value / metric.target.value,
      currentStreak: result.current,
      bestStreak: result.best,
    };
  }

  const selectedStart = startOfSaturdayWeek(date);
  const selectedEnd = endOfSaturdayWeek(date);
  const periodValue = all
    .filter((entry) => entry.date >= selectedStart && entry.date <= selectedEnd)
    .reduce((sum, entry) => sum + entry.value, 0);
  const elapsed = selectedEnd < today ? 7 : selectedStart > today ? 1 : Math.min(7, diffDays(selectedStart, today) + 1);
  const expected = metric.target.value * (elapsed / 7);

  const weekTotals = new Map<string, number>();
  for (const entry of all) {
    const week = startOfSaturdayWeek(entry.date);
    weekTotals.set(week, (weekTotals.get(week) ?? 0) + entry.value);
  }
  const currentWeek = startOfSaturdayWeek(today);
  const firstWeek = all[0] ? startOfSaturdayWeek(all[0].date) : currentWeek;
  const completedWeeks: string[] = [];
  for (let week = firstWeek; week < currentWeek; week = addDays(week, 7)) completedWeeks.push(week);
  const completed = streak(weekTotals, metric.target.value, completedWeeks, addDays(currentWeek, -7));
  const currentTotal = weekTotals.get(currentWeek) ?? 0;
  const currentStreak = currentTotal >= metric.target.value ? completed.current + 1 : completed.current;
  const bestStreak = Math.max(completed.best, currentTotal >= metric.target.value ? completed.current + 1 : 0);

  return {
    metricId: metric.id,
    periodValue,
    progress: expected > 0 ? periodValue / expected : 0,
    currentStreak,
    bestStreak,
  };
}
