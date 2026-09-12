import { resolve } from "node:path";
import { buildApp } from "./app.js";
import { ConfigService } from "./config.js";
import { ScoreboardDatabase } from "./database.js";

const database = new ScoreboardDatabase(resolve(process.env.DATA_PATH ?? "data/scoreboard.db"));
const config = new ConfigService(resolve(process.env.CONFIG_PATH ?? "config/metrics.json"), database);
await config.initialize();

const app = buildApp(database, config);
const port = Number(process.env.PORT ?? (process.env.NODE_ENV === "production" ? 3000 : 3001));

const shutdown = async () => {
  await app.close();
  await config.close();
  database.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

await app.listen({ port, host: "0.0.0.0" });
