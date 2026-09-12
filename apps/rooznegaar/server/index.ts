import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { todayIso } from "../shared/calendar";
import { PlannerStore } from "./db";

const dataPath = process.env.DATA_DIR ?? join(process.cwd(), "data");
const store = new PlannerStore(process.env.DATABASE_PATH ?? join(dataPath, "planner.db"));
const app = Fastify({ logger: true });

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const itemInput = z.object({
  planId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(160),
  notes: z.string().max(2000).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  dueDate: isoDateSchema.nullable().optional()
});
const itemPatch = itemInput.omit({ planId: true }).partial();

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof z.ZodError) {
    return reply.status(400).send({ error: "Validation failed", details: error.flatten() });
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = message.includes("not found") ? 404 : 400;
  app.log.error(error);
  return reply.status(status).send({ error: message });
});

app.get("/api/health", async () => ({ status: "ok" }));

app.get("/api/bootstrap", async request => {
  const query = z.object({ date: isoDateSchema.optional() }).parse(request.query);
  const today = todayIso();
  return store.bootstrap(query.date ?? today, today);
});

app.get("/api/export", async (_request, reply) => {
  return reply
    .header("Content-Disposition", `attachment; filename="rooznegaar-backup-${todayIso()}.json"`)
    .send(store.exportData());
});

app.post("/api/items", async (request, reply) => {
  const body = itemInput.parse(request.body);
  return reply.status(201).send(store.createItem(body));
});

app.patch("/api/items/:id", async request => {
  const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
  return store.updateItem(id, itemPatch.parse(request.body));
});

app.delete("/api/items/:id", async (request, reply) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
  store.deleteItem(id);
  return reply.status(204).send();
});

app.post("/api/items/reorder", async (request, reply) => {
  const body = z.object({
    planId: z.string().uuid(),
    ids: z.array(z.string().uuid())
  }).parse(request.body);
  store.reorder(body.planId, body.ids);
  return reply.status(204).send();
});

app.post("/api/rollover", async (request, reply) => {
  const body = z.object({
    copies: z.array(z.object({
      itemId: z.string().uuid(),
      targetPlanId: z.string().uuid()
    })).min(1)
  }).parse(request.body);
  return reply.status(201).send(store.rollover(body.copies));
});

const currentDir = fileURLToPath(new URL(".", import.meta.url));
const staticRoot = join(currentDir, "../dist");
if (existsSync(staticRoot)) {
  await app.register(fastifyStatic, { root: staticRoot });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) return reply.status(404).send({ error: "Not found" });
    return reply.sendFile("index.html");
  });
}

const port = Number(process.env.PORT ?? 8787);
await app.listen({ host: "0.0.0.0", port });

const shutdown = async () => {
  await app.close();
  store.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
