import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Entry, MetricDefinition } from "../shared/schema.js";

export class ScoreboardDatabase {
  readonly db: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metric_catalog (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        unit TEXT NOT NULL,
        definition_json TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS entries (
        metric_id TEXT NOT NULL,
        entry_date TEXT NOT NULL,
        value REAL NOT NULL CHECK(value >= 0),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(metric_id, entry_date),
        FOREIGN KEY(metric_id) REFERENCES metric_catalog(id)
      );
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS entries_date_idx ON entries(entry_date);
    `);
  }

  syncMetrics(metrics: MetricDefinition[]) {
    const deactivate = this.db.prepare("UPDATE metric_catalog SET active = 0");
    const upsert = this.db.prepare(`
      INSERT INTO metric_catalog(id, name, category, unit, definition_json, active)
      VALUES (@id, @name, @category, @unit, @json, 1)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, category = excluded.category, unit = excluded.unit,
        definition_json = excluded.definition_json, active = 1, updated_at = CURRENT_TIMESTAMP
    `);
    this.db.transaction(() => {
      deactivate.run();
      for (const metric of metrics) upsert.run({ ...metric, json: JSON.stringify(metric) });
    })();
  }

  saveConfigSnapshot(json: string) {
    this.db.prepare(`
      INSERT INTO app_state(key, value) VALUES ('last_valid_config', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(json);
  }

  getConfigSnapshot(): string | undefined {
    return (this.db.prepare("SELECT value FROM app_state WHERE key = 'last_valid_config'").get() as { value: string } | undefined)?.value;
  }

  upsertEntries(date: string, values: Record<string, number>) {
    const active = new Set(
      (this.db.prepare("SELECT id FROM metric_catalog WHERE active = 1").all() as { id: string }[]).map((row) => row.id),
    );
    const upsert = this.db.prepare(`
      INSERT INTO entries(metric_id, entry_date, value) VALUES (?, ?, ?)
      ON CONFLICT(metric_id, entry_date) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    this.db.transaction(() => {
      for (const [metricId, value] of Object.entries(values)) {
        if (!active.has(metricId)) throw new Error(`Unknown active metric: ${metricId}`);
        if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid value for ${metricId}`);
        upsert.run(metricId, date, value);
      }
    })();
  }

  getEntries(from: string, to: string, metricId?: string): Entry[] {
    const params: unknown[] = [from, to];
    let filter = "";
    if (metricId) {
      filter = " AND metric_id = ?";
      params.push(metricId);
    }
    return this.db.prepare(`
      SELECT metric_id AS metricId, entry_date AS date, value
      FROM entries WHERE entry_date BETWEEN ? AND ?${filter} ORDER BY entry_date, metric_id
    `).all(...params) as Entry[];
  }

  getAllEntries(metricId: string): Entry[] {
    return this.db.prepare(`
      SELECT metric_id AS metricId, entry_date AS date, value
      FROM entries WHERE metric_id = ? ORDER BY entry_date
    `).all(metricId) as Entry[];
  }

  getCatalog() {
    return this.db.prepare("SELECT id, name, category, unit, definition_json AS definitionJson, active FROM metric_catalog ORDER BY name").all() as Array<{
      id: string; name: string; category: string; unit: string; definitionJson: string; active: number;
    }>;
  }

  close() {
    this.db.close();
  }
}
