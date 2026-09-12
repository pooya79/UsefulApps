import { z } from "zod";

export const periodSchema = z.enum(["daily", "weekly"]);

export const metricIconNames = [
  "activity", "bike", "book-open", "brain", "briefcase", "clock", "coffee", "droplets",
  "dumbbell", "flame", "footprints", "graduation-cap", "heart-pulse", "languages", "medal",
  "moon", "music", "notebook-pen", "person-standing", "smartphone", "target", "timer", "trophy", "zap",
] as const;
export type MetricIconName = (typeof metricIconNames)[number];

export const metricSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers, and hyphens"),
  name: z.string().min(1).max(60),
  category: z.string().min(1).max(40),
  unit: z.string().min(1).max(20),
  precision: z.number().int().min(0).max(2).default(0),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.enum(metricIconNames),
  quickAdd: z.array(z.number().positive()).max(5).default([]),
  target: z.object({
    period: periodSchema,
    value: z.number().positive(),
  }),
});

export const configSchema = z.object({
  version: z.literal(1),
  settings: z.object({
    timezone: z.string().min(1),
    weekStartsOn: z.literal("saturday"),
  }),
  metrics: z.array(metricSchema).min(1).superRefine((metrics, ctx) => {
    const ids = new Set<string>();
    metrics.forEach((metric, index) => {
      if (ids.has(metric.id)) {
        ctx.addIssue({ code: "custom", message: "Metric IDs must be unique", path: [index, "id"] });
      }
      ids.add(metric.id);
    });
  }),
});

export type MetricDefinition = z.infer<typeof metricSchema>;
export type ScoreboardConfig = z.infer<typeof configSchema>;

export interface Entry {
  metricId: string;
  date: string;
  value: number;
}

export interface MetricStats {
  metricId: string;
  periodValue: number;
  progress: number;
  currentStreak: number;
  bestStreak: number;
}

export interface DashboardResponse {
  config: ScoreboardConfig;
  date: string;
  today: string;
  entries: Record<string, number>;
  stats: Record<string, MetricStats>;
  score: number;
  configError?: string;
}

export interface HistoryPoint {
  date: string;
  value: number;
}
