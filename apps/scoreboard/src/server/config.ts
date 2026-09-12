import { watch, type FSWatcher } from "chokidar";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { configSchema, type ScoreboardConfig } from "../shared/schema.js";
import type { ScoreboardDatabase } from "./database.js";

export class ConfigService {
  private current!: ScoreboardConfig;
  private error?: string;
  private watcher?: FSWatcher;

  constructor(private readonly path: string, private readonly database: ScoreboardDatabase) {}

  async initialize() {
    await mkdir(dirname(this.path), { recursive: true });
    try {
      await this.reload();
    } catch (error) {
      const snapshot = this.database.getConfigSnapshot();
      if (!snapshot) throw error;
      this.current = configSchema.parse(JSON.parse(snapshot));
      this.database.syncMetrics(this.current.metrics);
      this.error = this.message(error);
    }
    this.watcher = watch(this.path, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 } });
    this.watcher.on("add", () => void this.safeReload()).on("change", () => void this.safeReload());
  }

  private message(error: unknown) {
    if (error && typeof error === "object" && "issues" in error) {
      const issues = (error as { issues: Array<{ path: PropertyKey[]; message: string }> }).issues;
      return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    }
    return error instanceof Error ? error.message : String(error);
  }

  private async safeReload() {
    try {
      await this.reload();
    } catch (error) {
      this.error = this.message(error);
    }
  }

  async reload() {
    const json = await readFile(this.path, "utf8");
    const parsed = configSchema.parse(JSON.parse(json));
    this.current = parsed;
    this.error = undefined;
    this.database.syncMetrics(parsed.metrics);
    this.database.saveConfigSnapshot(JSON.stringify(parsed));
  }

  async save(value: unknown) {
    const parsed = configSchema.parse(value);
    const json = `${JSON.stringify(parsed, null, 2)}\n`;
    const temporary = `${this.path}.tmp`;
    await writeFile(temporary, json, "utf8");
    await rename(temporary, this.path);
    this.current = parsed;
    this.error = undefined;
    this.database.syncMetrics(parsed.metrics);
    this.database.saveConfigSnapshot(JSON.stringify(parsed));
    return parsed;
  }

  get config() { return this.current; }
  get configError() { return this.error; }
  async close() { await this.watcher?.close(); }
}
