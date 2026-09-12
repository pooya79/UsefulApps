import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { ConfigService } from "./config.js";
import type { ScoreboardDatabase } from "./database.js";
import { parseDate, todayInTimezone } from "./dates.js";
import { calculateMetricStats } from "./stats.js";

const dateQuery = z.object({ date: z.string().refine((value) => { try { parseDate(value); return true; } catch { return false; } }) });
const historyQuery = z.object({ from: z.string(), to: z.string(), metricId: z.string().optional() });
const entriesBody = z.object({ values: z.record(z.string(), z.number().nonnegative()) });

function csvCell(value: unknown) {
  const string = String(value ?? "");
  return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

export function buildApp(database: ScoreboardDatabase, configService: ConfigService) {
  const app = Fastify({ logger: true });

  app.setErrorHandler((error, _request, reply) => {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof z.ZodError || message.startsWith("Invalid") || message.startsWith("Unknown") ? 400 : 500;
    reply.status(status).send({ error: error instanceof z.ZodError ? z.prettifyError(error) : message });
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/api/dashboard", async (request) => {
    const today = todayInTimezone(configService.config.settings.timezone);
    const { date } = dateQuery.parse({ date: (request.query as { date?: string }).date ?? today });
    const dayEntries = database.getEntries(date, date);
    const entries = Object.fromEntries(dayEntries.map((entry) => [entry.metricId, entry.value]));
    const stats = Object.fromEntries(configService.config.metrics.map((metric) => {
      const value = calculateMetricStats(database, metric, date, today);
      return [metric.id, value];
    }));
    const contributions = Object.values(stats).map((stat) => Math.min(1, stat.progress));
    const score = contributions.length ? Math.round(contributions.reduce((sum, value) => sum + value, 0) / contributions.length * 100) : 0;
    return { config: configService.config, configError: configService.configError, date, today, entries, stats, score };
  });

  app.put("/api/entries/:date", async (request) => {
    const { date } = dateQuery.parse(request.params);
    const { values } = entriesBody.parse(request.body);
    database.upsertEntries(date, values);
    return { ok: true };
  });

  app.get("/api/history", async (request) => {
    const query = historyQuery.parse(request.query);
    parseDate(query.from); parseDate(query.to);
    return database.getEntries(query.from, query.to, query.metricId);
  });

  app.get("/api/config", async () => ({ config: configService.config, error: configService.configError }));
  app.put("/api/config", async (request) => ({ config: await configService.save(request.body) }));

  app.get("/api/export.csv", async (_request, reply) => {
    const catalog = database.getCatalog();
    const definitions = new Map(catalog.map((item) => [item.id, JSON.parse(item.definitionJson)]));
    const rows = ["date,metric_id,metric_name,category,unit,value,target_period,target_value,active"];
    for (const item of catalog) {
      const definition = definitions.get(item.id);
      for (const entry of database.getAllEntries(item.id)) {
        rows.push([entry.date, item.id, item.name, item.category, item.unit, entry.value, definition.target.period, definition.target.value, item.active].map(csvCell).join(","));
      }
    }
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="scoreboard-${todayInTimezone(configService.config.settings.timezone)}.csv"`);
    return `${rows.join("\n")}\n`;
  });

  const staticRoot = resolve(process.cwd(), "dist");
  if (existsSync(staticRoot)) {
    void app.register(fastifyStatic, { root: staticRoot, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) return reply.status(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  }
  return app;
}
