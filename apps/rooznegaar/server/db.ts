import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { periodInfo, shiftDays } from "../shared/calendar";
import type {
  BootstrapResponse, ItemStatus, Plan, PlanItem, PlanType, Priority
} from "../shared/types";

type Row = Record<string, unknown>;

function now() {
  return new Date().toISOString();
}

function planFromRow(row: Row): Plan {
  return {
    id: String(row.id),
    type: row.type as PlanType,
    periodKey: String(row.period_key),
    startsOn: String(row.starts_on),
    endsOn: String(row.ends_on),
    title: String(row.title),
    createdAt: String(row.created_at)
  };
}

function itemFromRow(row: Row): PlanItem {
  return {
    id: String(row.id),
    planId: String(row.plan_id),
    parentId: row.parent_id ? String(row.parent_id) : null,
    title: String(row.title),
    notes: String(row.notes ?? ""),
    priority: row.priority as Priority,
    status: row.status as ItemStatus,
    dueDate: row.due_date ? String(row.due_date) : null,
    sortOrder: Number(row.sort_order),
    sourceItemId: row.source_item_id ? String(row.source_item_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : null
  };
}

export class PlannerStore {
  private db: Database.Database;

  constructor(filename: string) {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('month', 'week', 'day')),
        period_key TEXT NOT NULL,
        starts_on TEXT NOT NULL,
        ends_on TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(type, period_key)
      );
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES items(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
        status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done')),
        due_date TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        source_item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_items_plan ON items(plan_id, sort_order);
      CREATE INDEX IF NOT EXISTS idx_items_parent ON items(parent_id);
      CREATE INDEX IF NOT EXISTS idx_plans_dates ON plans(type, starts_on, ends_on);
    `);
  }

  close() {
    this.db.close();
  }

  exportData() {
    return {
      exportedAt: now(),
      version: 1,
      plans: this.db.prepare("SELECT * FROM plans ORDER BY starts_on").all(),
      items: this.db.prepare("SELECT * FROM items ORDER BY created_at").all()
    };
  }

  ensurePlan(type: PlanType, date: string): Plan {
    const info = periodInfo(type, date);
    const existing = this.db.prepare(
      "SELECT * FROM plans WHERE type = ? AND period_key = ?"
    ).get(type, info.key) as Row | undefined;
    if (existing) return planFromRow(existing);
    const plan: Plan = {
      id: randomUUID(),
      type,
      periodKey: info.key,
      startsOn: info.start,
      endsOn: info.end,
      title: info.title,
      createdAt: now()
    };
    this.db.prepare(`
      INSERT INTO plans (id, type, period_key, starts_on, ends_on, title, created_at)
      VALUES (@id, @type, @periodKey, @startsOn, @endsOn, @title, @createdAt)
    `).run(plan);
    return plan;
  }

  getPlan(id: string): Plan | null {
    const row = this.db.prepare("SELECT * FROM plans WHERE id = ?").get(id) as Row | undefined;
    return row ? planFromRow(row) : null;
  }

  listItems(planId: string): PlanItem[] {
    return (this.db.prepare(
      "SELECT * FROM items WHERE plan_id = ? ORDER BY sort_order, created_at"
    ).all(planId) as Row[]).map(itemFromRow);
  }

  getItem(id: string): PlanItem | null {
    const row = this.db.prepare("SELECT * FROM items WHERE id = ?").get(id) as Row | undefined;
    return row ? itemFromRow(row) : null;
  }

  createItem(input: {
    planId: string;
    parentId?: string | null;
    title: string;
    notes?: string;
    priority?: Priority;
    status?: ItemStatus;
    dueDate?: string | null;
  }): PlanItem {
    const plan = this.getPlan(input.planId);
    if (!plan) throw new Error("Plan not found");
    if (input.parentId) this.validateParent(input.parentId, plan.type);
    const orderRow = this.db.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM items WHERE plan_id = ?"
    ).get(input.planId) as { next: number };
    const stamp = now();
    const item: PlanItem = {
      id: randomUUID(),
      planId: input.planId,
      parentId: input.parentId ?? null,
      title: input.title.trim(),
      notes: input.notes?.trim() ?? "",
      priority: input.priority ?? "medium",
      status: input.status ?? "todo",
      dueDate: input.dueDate ?? null,
      sortOrder: orderRow.next,
      sourceItemId: null,
      createdAt: stamp,
      updatedAt: stamp,
      completedAt: input.status === "done" ? stamp : null
    };
    this.insertItem(item);
    return item;
  }

  private insertItem(item: PlanItem) {
    this.db.prepare(`
      INSERT INTO items (
        id, plan_id, parent_id, title, notes, priority, status, due_date,
        sort_order, source_item_id, created_at, updated_at, completed_at
      ) VALUES (
        @id, @planId, @parentId, @title, @notes, @priority, @status, @dueDate,
        @sortOrder, @sourceItemId, @createdAt, @updatedAt, @completedAt
      )
    `).run(item);
  }

  private validateParent(parentId: string, childType: PlanType) {
    const row = this.db.prepare(`
      SELECT i.id, p.type FROM items i JOIN plans p ON p.id = i.plan_id WHERE i.id = ?
    `).get(parentId) as { id: string; type: PlanType } | undefined;
    if (!row) throw new Error("Parent item not found");
    const allowed: Record<PlanType, PlanType[]> = {
      month: [],
      week: ["month"],
      day: ["week"]
    };
    if (!allowed[childType].includes(row.type)) {
      throw new Error(`A ${childType} item can only link to a ${allowed[childType][0] ?? "no"} parent`);
    }
  }

  updateItem(id: string, patch: Partial<{
    title: string;
    notes: string;
    priority: Priority;
    status: ItemStatus;
    dueDate: string | null;
    parentId: string | null;
  }>): PlanItem {
    const current = this.getItem(id);
    if (!current) throw new Error("Item not found");
    const plan = this.getPlan(current.planId);
    if (!plan) throw new Error("Plan not found");
    if (patch.parentId) this.validateParent(patch.parentId, plan.type);
    if (patch.parentId === id) throw new Error("An item cannot be its own parent");
    const next = {
      ...current,
      ...patch,
      title: patch.title?.trim() ?? current.title,
      notes: patch.notes?.trim() ?? current.notes,
      updatedAt: now(),
      completedAt: patch.status === "done"
        ? current.completedAt ?? now()
        : patch.status ? null : current.completedAt
    };
    this.db.prepare(`
      UPDATE items SET parent_id=@parentId, title=@title, notes=@notes,
        priority=@priority, status=@status, due_date=@dueDate, updated_at=@updatedAt,
        completed_at=@completedAt WHERE id=@id
    `).run(next);
    return this.getItem(id)!;
  }

  deleteItem(id: string) {
    const result = this.db.prepare("DELETE FROM items WHERE id = ?").run(id);
    if (!result.changes) throw new Error("Item not found");
  }

  reorder(planId: string, ids: string[]) {
    const transaction = this.db.transaction(() => {
      const statement = this.db.prepare(
        "UPDATE items SET sort_order = ?, updated_at = ? WHERE id = ? AND plan_id = ?"
      );
      ids.forEach((id, index) => statement.run(index, now(), id, planId));
    });
    transaction();
  }

  rollover(copies: Array<{ itemId: string; targetPlanId: string }>): PlanItem[] {
    const created: PlanItem[] = [];
    const idMap = new Map<string, string>();
    const transaction = this.db.transaction(() => {
      for (const copy of copies) {
        const source = this.getItem(copy.itemId);
        const target = this.getPlan(copy.targetPlanId);
        const sourcePlan = source && this.getPlan(source.planId);
        if (!source || !target || !sourcePlan) throw new Error("Rollover source or target not found");
        if (target.type !== sourcePlan.type) throw new Error("Rollover must stay in the same planning level");
        if (source.status === "done") throw new Error("Completed items cannot be carried forward");
        const stamp = now();
        const item: PlanItem = {
          ...source,
          id: randomUUID(),
          planId: target.id,
          parentId: source.parentId ? idMap.get(source.parentId) ?? null : null,
          status: "todo",
          sortOrder: this.listItems(target.id).length + created.filter(i => i.planId === target.id).length,
          sourceItemId: source.id,
          createdAt: stamp,
          updatedAt: stamp,
          completedAt: null
        };
        this.insertItem(item);
        idMap.set(source.id, item.id);
        created.push(item);
      }
    });
    transaction();
    return created;
  }

  bootstrap(selectedDate: string, today: string): BootstrapResponse {
    const types: PlanType[] = ["month", "week", "day"];
    const plans = Object.fromEntries(types.map(type => {
      const plan = this.ensurePlan(type, selectedDate);
      const items = this.listItems(plan.id);
      return [type, {
        plan,
        items,
        progress: items.length ? Math.round(items.filter(i => i.status === "done").length / items.length * 100) : 0
      }];
    })) as BootstrapResponse["periods"];
    return {
      selectedDate,
      today,
      periods: plans,
      insights: this.insights(today),
      rollover: this.rolloverCandidates(plans)
    };
  }

  private rolloverCandidates(current: BootstrapResponse["periods"]): BootstrapResponse["rollover"] {
    const items: BootstrapResponse["rollover"]["items"] = [];
    for (const type of ["month", "week", "day"] as PlanType[]) {
      const previous = this.db.prepare(`
        SELECT * FROM plans WHERE type = ? AND ends_on < ?
        ORDER BY ends_on DESC LIMIT 1
      `).get(type, current[type].plan.startsOn) as Row | undefined;
      if (!previous) continue;
      const plan = planFromRow(previous);
      for (const item of this.listItems(plan.id).filter(entry => entry.status !== "done")) {
        const alreadyCopied = this.db.prepare(
          "SELECT 1 FROM items WHERE source_item_id = ? AND plan_id = ?"
        ).get(item.id, current[type].plan.id);
        if (!alreadyCopied) items.push({ ...item, sourcePlanType: type, sourcePlanTitle: plan.title });
      }
    }
    return { available: items.length > 0, items };
  }

  private insights(today: string): BootstrapResponse["insights"] {
    const days = Array.from({ length: 7 }, (_, index) => shiftDays(today, index - 6)).map(date => {
      const planRow = this.db.prepare(
        "SELECT * FROM plans WHERE type = 'day' AND period_key = ?"
      ).get(date) as Row | undefined;
      const rows = planRow ? this.listItems(String(planRow.id)) : [];
      const completed = rows.filter(item => item.status === "done").length;
      return {
        date,
        label: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Tehran" })
          .format(new Date(`${date}T12:00:00+03:30`)),
        completed,
        total: rows.length,
        rate: rows.length ? Math.round(completed / rows.length * 100) : 0
      };
    });
    const completedTotal = Number((this.db.prepare(
      "SELECT COUNT(*) AS count FROM items WHERE status = 'done'"
    ).get() as { count: number }).count);
    const highPriorityDone = Number((this.db.prepare(
      "SELECT COUNT(*) AS count FROM items WHERE status = 'done' AND priority = 'high'"
    ).get() as { count: number }).count);
    const productiveDates = new Set((this.db.prepare(`
      SELECT p.period_key AS date FROM plans p JOIN items i ON i.plan_id = p.id
      WHERE p.type = 'day' AND i.status = 'done' GROUP BY p.period_key
    `).all() as Array<{ date: string }>).map(row => row.date));
    let currentStreak = 0;
    let cursor = today;
    while (productiveDates.has(cursor)) {
      currentStreak++;
      cursor = shiftDays(cursor, -1);
    }
    const sorted = [...productiveDates].sort();
    let bestStreak = 0;
    let running = 0;
    let previous = "";
    for (const date of sorted) {
      running = previous && shiftDays(previous, 1) === date ? running + 1 : 1;
      bestStreak = Math.max(bestStreak, running);
      previous = date;
    }
    return { days, completedTotal, currentStreak, bestStreak, highPriorityDone };
  }
}
