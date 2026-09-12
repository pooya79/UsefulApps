import {
  ArrowDownToLine, BarChart3, CalendarDays, Check, ChevronLeft, ChevronRight,
  Clock3, Flame, Focus, LayoutDashboard, Link2, ListChecks,
  LoaderCircle, Menu, Moon, MoreHorizontal, Pencil, Plus, RotateCcw, Settings,
  Sparkles, Sun, Target, Trash2, Trophy, X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip,
  XAxis, YAxis
} from "recharts";
import {
  formatJalali, formatJalaliShort, jalaliParts, jalaliToIso, periodInfo,
  shiftPeriod, todayIso
} from "../shared/calendar";
import type {
  BootstrapResponse, ItemStatus, PlanItem, PlanType, Priority
} from "../shared/types";
import { api } from "./api";

type View = "dashboard" | PlanType | "insights" | "settings";
type Theme = "light" | "dark";

const statusCopy: Record<ItemStatus, string> = {
  todo: "To do", in_progress: "In progress", done: "Done"
};
const typeCopy: Record<PlanType, { singular: string; item: string; accent: string }> = {
  month: { singular: "Month", item: "goal", accent: "violet" },
  week: { singular: "Week", item: "priority", accent: "amber" },
  day: { singular: "Day", item: "task", accent: "teal" }
};

function ProgressRing({ value, size = 74 }: { value: number; size?: number }) {
  const radius = 28;
  const circumference = Math.PI * 2 * radius;
  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 68 68" aria-hidden="true">
        <circle className="ring-track" cx="34" cy="34" r={radius} />
        <circle
          className="ring-value"
          cx="34" cy="34" r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
        />
      </svg>
      <span>{value}%</span>
    </div>
  );
}

function Logo() {
  return (
    <div className="logo">
      <div className="logo-mark"><span /><span /><span /></div>
      <div><strong>Rooznegaar</strong><small>plan with intention</small></div>
    </div>
  );
}

function Sidebar({
  view, onView, theme, onTheme, open, onClose
}: {
  view: View; onView: (view: View) => void; theme: Theme;
  onTheme: () => void; open: boolean; onClose: () => void;
}) {
  const links: Array<{ id: View; label: string; icon: typeof Target }> = [
    { id: "dashboard", label: "Overview", icon: LayoutDashboard },
    { id: "month", label: "Monthly plan", icon: Target },
    { id: "week", label: "Weekly plan", icon: CalendarDays },
    { id: "day", label: "Daily focus", icon: Focus },
    { id: "insights", label: "Insights", icon: BarChart3 }
  ];
  return (
    <>
      {open && <button className="scrim" aria-label="Close menu" onClick={onClose} />}
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="sidebar-head"><Logo /><button className="icon-button mobile-only" onClick={onClose}><X size={20} /></button></div>
        <nav>
          <p className="eyebrow">Workspace</p>
          {links.map(link => (
            <button
              key={link.id}
              className={view === link.id ? "active" : ""}
              onClick={() => { onView(link.id); onClose(); }}
            >
              <link.icon size={19} /><span>{link.label}</span>
              {view === link.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className={view === "settings" ? "active" : ""} onClick={() => onView("settings")}>
            <Settings size={19} /><span>Settings</span>
          </button>
          <button onClick={onTheme}>
            {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
          </button>
          <div className="quote">
            <Sparkles size={18} />
            <p>Small, intentional steps become remarkable seasons.</p>
          </div>
        </div>
      </aside>
    </>
  );
}

function Topbar({
  data, onMenu, onToday
}: { data: BootstrapResponse; onMenu: () => void; onToday: () => void }) {
  return (
    <header className="topbar">
      <button className="icon-button menu-button" onClick={onMenu}><Menu size={21} /></button>
      <div>
        <span className="topbar-day">{formatJalali(data.today)}</span>
        <span className="today-mark">Tehran · Today</span>
      </div>
      {data.selectedDate !== data.today && (
        <button className="soft-button" onClick={onToday}><RotateCcw size={15} /> Back to today</button>
      )}
      <div className="avatar" aria-label="Local profile">P</div>
    </header>
  );
}

function StatusControl({
  status, onChange
}: { status: ItemStatus; onChange: (status: ItemStatus) => void }) {
  const next: Record<ItemStatus, ItemStatus> = {
    todo: "in_progress", in_progress: "done", done: "todo"
  };
  return (
    <button
      className={`status-check ${status}`}
      aria-label={`Status: ${statusCopy[status]}. Click for next status`}
      title={statusCopy[status]}
      onClick={() => onChange(next[status])}
    >
      {status === "done" && <Check size={14} strokeWidth={2.6} />}
    </button>
  );
}

function ItemCard({
  item, childCount, childProgress, onStatus, onEdit, onDelete, draggable, onDragStart, onDrop
}: {
  item: PlanItem; childCount: number; childProgress: number;
  onStatus: (status: ItemStatus) => void; onEdit: () => void; onDelete: () => void;
  draggable?: boolean; onDragStart?: () => void; onDrop?: () => void;
}) {
  return (
    <article
      className={`item-card ${item.status === "done" ? "is-done" : ""}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={event => event.preventDefault()}
      onDrop={onDrop}
    >
      <StatusControl status={item.status} onChange={onStatus} />
      <div className="item-body">
        <div className="item-title-row">
          <h4>{item.title}</h4>
          <span className={`priority ${item.priority}`}>{item.priority}</span>
        </div>
        {item.notes && <p className="item-notes">{item.notes}</p>}
        <div className="item-meta">
          {item.dueDate && <span><Clock3 size={13} /> {formatJalaliShort(item.dueDate)}</span>}
          {item.parentId && <span><Link2 size={13} /> Aligned</span>}
          {childCount > 0 && <span><ListChecks size={13} /> {childCount} linked · {childProgress}%</span>}
        </div>
      </div>
      <div className="item-actions">
        <button aria-label="Edit item" onClick={onEdit}><Pencil size={15} /></button>
        <button aria-label="Delete item" onClick={onDelete}><Trash2 size={15} /></button>
        <span className="drag-handle"><MoreHorizontal size={18} /></span>
      </div>
    </article>
  );
}

function EmptyState({ type, onAdd }: { type: PlanType; onAdd: () => void }) {
  const copy = {
    month: ["Set the direction", "What would make this month feel meaningful?"],
    week: ["Shape the week", "Choose a few priorities that move your goals forward."],
    day: ["Make today count", "Add one clear task and give it your attention."]
  }[type];
  return (
    <div className="empty-state">
      <div className={`empty-illustration ${typeCopy[type].accent}`}>
        {type === "month" ? <Target /> : type === "week" ? <CalendarDays /> : <Sun />}
      </div>
      <h3>{copy[0]}</h3><p>{copy[1]}</p>
      <button className="primary-button" onClick={onAdd}><Plus size={17} /> Add first {typeCopy[type].item}</button>
    </div>
  );
}

function PlanPanel({
  type, data, allData, onAdd, onEdit, onStatus, onDelete, onReorder, compact = false
}: {
  type: PlanType; data: BootstrapResponse["periods"][PlanType]; allData: BootstrapResponse;
  onAdd: () => void; onEdit: (item: PlanItem) => void;
  onStatus: (item: PlanItem, status: ItemStatus) => void;
  onDelete: (item: PlanItem) => void;
  onReorder: (type: PlanType, source: string, target: string) => void;
  compact?: boolean;
}) {
  const [filter, setFilter] = useState<"all" | ItemStatus>("all");
  const [dragged, setDragged] = useState<string | null>(null);
  const items = data.items.filter(item => filter === "all" || item.status === filter);
  const childItems = type === "month" ? allData.periods.week.items : type === "week" ? allData.periods.day.items : [];
  const heading = type === "day" ? "Today’s focus" : type === "week" ? "This week’s priorities" : "Monthly direction";
  return (
    <section className={`plan-panel accent-${typeCopy[type].accent} ${compact ? "compact" : ""}`}>
      <div className="panel-heading">
        <div>
          <span className="section-kicker">{typeCopy[type].singular} plan</span>
          <h2>{heading}</h2>
          <p>{data.plan.title}</p>
        </div>
        <ProgressRing value={data.progress} size={compact ? 64 : 74} />
      </div>
      {!compact && data.items.length > 0 && (
        <div className="filter-row">
          {(["all", "todo", "in_progress", "done"] as const).map(value => (
            <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
              {value === "all" ? "All" : statusCopy[value]}
            </button>
          ))}
          <button className="primary-button small" onClick={onAdd}><Plus size={16} /> New {typeCopy[type].item}</button>
        </div>
      )}
      {data.items.length === 0 ? <EmptyState type={type} onAdd={onAdd} /> : (
        <div className="item-list">
          {items.map(item => {
            const children = childItems.filter(child => child.parentId === item.id);
            const childProgress = children.length
              ? Math.round(children.filter(child => child.status === "done").length / children.length * 100)
              : 0;
            return (
              <ItemCard
                key={item.id}
                item={item}
                childCount={children.length}
                childProgress={childProgress}
                onStatus={status => onStatus(item, status)}
                onEdit={() => onEdit(item)}
                onDelete={() => onDelete(item)}
                draggable={!compact}
                onDragStart={() => { setDragged(item.id); }}
                onDrop={() => {
                  if (dragged && dragged !== item.id) onReorder(type, dragged, item.id);
                  setDragged(null);
                }}
              />
            );
          })}
          {compact && (
            <button className="add-row" onClick={onAdd}><Plus size={16} /> Add {typeCopy[type].item}</button>
          )}
        </div>
      )}
    </section>
  );
}

function DateNavigator({
  type, date, onChange
}: { type: PlanType; date: string; onChange: (date: string) => void }) {
  const info = periodInfo(type, date);
  return (
    <div className="date-navigator">
      <button className="icon-button" onClick={() => onChange(shiftPeriod(type, date, -1))}><ChevronLeft /></button>
      <div><span>{typeCopy[type].singular}</span><strong>{info.title}</strong></div>
      <button className="icon-button" onClick={() => onChange(shiftPeriod(type, date, 1))}><ChevronRight /></button>
    </div>
  );
}

function MetricCard({
  icon: Icon, label, value, note, tone
}: { icon: typeof Target; label: string; value: string; note: string; tone: string }) {
  return (
    <div className="metric-card">
      <span className={`metric-icon ${tone}`}><Icon size={19} /></span>
      <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
    </div>
  );
}

function Dashboard({
  data, actions
}: {
  data: BootstrapResponse;
  actions: {
    add: (type: PlanType) => void; edit: (item: PlanItem) => void;
    status: (item: PlanItem, status: ItemStatus) => void; remove: (item: PlanItem) => void;
    reorder: (type: PlanType, source: string, target: string) => void;
    openRollover: () => void;
  }
}) {
  const day = data.periods.day;
  const completed = day.items.filter(item => item.status === "done").length;
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <span className="section-kicker">Daily intention</span>
          <h1>Make space for what <em>matters.</em></h1>
          <p>{formatJalali(data.selectedDate)} · You have {day.items.length - completed} open {day.items.length - completed === 1 ? "task" : "tasks"} today.</p>
        </div>
        <div className="hero-orbit">
          <ProgressRing value={day.progress} size={112} />
          <span className="orbit-dot one" /><span className="orbit-dot two" />
        </div>
      </section>

      {data.rollover.available && (
        <button className="rollover-banner" onClick={actions.openRollover}>
          <span><RotateCcw size={18} /></span>
          <div><strong>Unfinished intentions are waiting</strong><small>Review and carry selected items forward.</small></div>
          <ChevronRight size={18} />
        </button>
      )}

      <div className="metric-grid">
        <MetricCard icon={Check} label="Completed" value={String(data.insights.completedTotal)} note="all-time items" tone="teal" />
        <MetricCard icon={Flame} label="Current streak" value={`${data.insights.currentStreak} days`} note={`best: ${data.insights.bestStreak} days`} tone="amber" />
        <MetricCard icon={Target} label="Monthly progress" value={`${data.periods.month.progress}%`} note="toward your goals" tone="violet" />
        <MetricCard icon={Trophy} label="Big wins" value={String(data.insights.highPriorityDone)} note="high-priority done" tone="rose" />
      </div>

      <div className="dashboard-layout">
        <PlanPanel type="day" data={data.periods.day} allData={data} compact
          onAdd={() => actions.add("day")} onEdit={actions.edit} onStatus={actions.status}
          onDelete={actions.remove} onReorder={actions.reorder} />
        <section className="rhythm-card">
          <div className="card-heading"><div><span className="section-kicker">Rhythm</span><h3>Last seven days</h3></div><BarChart3 size={20} /></div>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={data.insights.days} margin={{ top: 15, right: 5, left: -25, bottom: 0 }}>
              <defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#24796c" stopOpacity={0.35} /><stop offset="100%" stopColor="#24796c" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12 }} formatter={(value) => [`${value}%`, "Completed"]} />
              <Area type="monotone" dataKey="rate" stroke="#24796c" strokeWidth={2.5} fill="url(#areaFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </section>
      </div>
      <div className="alignment-grid">
        <PlanPanel type="month" data={data.periods.month} allData={data} compact
          onAdd={() => actions.add("month")} onEdit={actions.edit} onStatus={actions.status}
          onDelete={actions.remove} onReorder={actions.reorder} />
        <PlanPanel type="week" data={data.periods.week} allData={data} compact
          onAdd={() => actions.add("week")} onEdit={actions.edit} onStatus={actions.status}
          onDelete={actions.remove} onReorder={actions.reorder} />
      </div>
    </div>
  );
}

function InsightsView({ data }: { data: BootstrapResponse }) {
  const horizonData = (["month", "week", "day"] as PlanType[]).map(type => ({
    name: typeCopy[type].singular,
    completion: data.periods[type].progress
  }));
  return (
    <div className="page">
      <div className="page-title"><span className="section-kicker">Your patterns</span><h1>Insights</h1><p>A gentle look at your momentum—not a judgment.</p></div>
      <div className="metric-grid">
        <MetricCard icon={Flame} label="Current streak" value={`${data.insights.currentStreak} days`} note="one completed daily task" tone="amber" />
        <MetricCard icon={Trophy} label="Best streak" value={`${data.insights.bestStreak} days`} note="your personal record" tone="rose" />
        <MetricCard icon={Check} label="Total completed" value={String(data.insights.completedTotal)} note="intentions honored" tone="teal" />
        <MetricCard icon={Target} label="High-impact wins" value={String(data.insights.highPriorityDone)} note="high-priority items" tone="violet" />
      </div>
      <div className="charts-grid">
        <section className="chart-card">
          <div className="card-heading"><div><span className="section-kicker">Consistency</span><h3>Seven-day completion</h3></div></div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.insights.days} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)" }} />
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)" }} />
              <Tooltip cursor={{ fill: "var(--subtle)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12 }} />
              <Bar dataKey="rate" fill="#24796c" radius={[8, 8, 2, 2]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
        <section className="chart-card">
          <div className="card-heading"><div><span className="section-kicker">Alignment</span><h3>Current horizons</h3></div></div>
          <div className="horizon-bars">
            {horizonData.map((entry, index) => (
              <div key={entry.name}>
                <div><span>{entry.name}</span><strong>{entry.completion}%</strong></div>
                <span className="bar-track"><span style={{ width: `${entry.completion}%`, background: ["#7767a8", "#c68b2c", "#24796c"][index] }} /></span>
              </div>
            ))}
          </div>
          <div className="insight-note"><Sparkles /><p>Progress across horizons is calculated from the intentions you mark complete.</p></div>
        </section>
      </div>
    </div>
  );
}

function SettingsView({ theme, onTheme }: { theme: Theme; onTheme: () => void }) {
  const download = () => { window.location.href = "/api/export"; };
  return (
    <div className="page narrow-page">
      <div className="page-title"><span className="section-kicker">Your space</span><h1>Settings</h1><p>Rooznegaar is private, local, and yours.</p></div>
      <section className="settings-card">
        <div className="setting-row">
          <span className="setting-icon"><CalendarDays /></span>
          <div><strong>Calendar</strong><p>Jalali dates · Saturday-first weeks · Tehran time</p></div>
          <span className="setting-value">Persian</span>
        </div>
        <div className="setting-row">
          <span className="setting-icon">{theme === "light" ? <Sun /> : <Moon />}</span>
          <div><strong>Appearance</strong><p>Choose a comfortable theme for your space.</p></div>
          <button className="soft-button" onClick={onTheme}>{theme === "light" ? "Use dark" : "Use light"}</button>
        </div>
        <div className="setting-row">
          <span className="setting-icon"><ArrowDownToLine /></span>
          <div><strong>Export your data</strong><p>Download a complete JSON backup of plans and items.</p></div>
          <button className="soft-button" onClick={download}>Download</button>
        </div>
      </section>
      <div className="privacy-note"><span className="status-dot" /><div><strong>Stored locally</strong><p>Your data lives in the SQLite volume attached to this Docker app. Nothing is sent to a cloud service.</p></div></div>
    </div>
  );
}

function JalaliDateField({
  value, onChange
}: { value: string; onChange: (value: string) => void }) {
  const initial = value ? jalaliParts(value) : jalaliParts(todayIso());
  const [text, setText] = useState(value ? `${initial.jy}/${initial.jm}/${initial.jd}` : "");
  const commit = (next: string) => {
    setText(next);
    const match = next.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!match) { if (!next) onChange(""); return; }
    try { onChange(jalaliToIso(Number(match[1]), Number(match[2]), Number(match[3]))); } catch { /* keep draft */ }
  };
  return <input value={text} onChange={event => commit(event.target.value)} placeholder="1405/05/08" inputMode="numeric" />;
}

function ItemModal({
  type, item, data, onClose, onSave
}: {
  type: PlanType; item: PlanItem | null; data: BootstrapResponse;
  onClose: () => void;
  onSave: (payload: {
    title: string; notes: string; priority: Priority; dueDate: string | null; parentId: string | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [priority, setPriority] = useState<Priority>(item?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(item?.dueDate ?? "");
  const [parentId, setParentId] = useState(item?.parentId ?? "");
  const [saving, setSaving] = useState(false);
  const parents = type === "week" ? data.periods.month.items : type === "day" ? data.periods.week.items : [];
  return (
    <div className="modal-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="modal" onSubmit={async event => {
        event.preventDefault();
        setSaving(true);
        try {
          await onSave({ title, notes, priority, dueDate: dueDate || null, parentId: parentId || null });
        } finally { setSaving(false); }
      }}>
        <div className="modal-head">
          <div><span className="section-kicker">{item ? "Refine intention" : `New ${typeCopy[type].item}`}</span><h2>{item ? "Edit item" : `Add to your ${type}`}</h2></div>
          <button type="button" className="icon-button" onClick={onClose}><X /></button>
        </div>
        <label className="field"><span>Title</span><input autoFocus required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} placeholder={`What is this ${typeCopy[type].item}?`} /></label>
        <label className="field"><span>Notes <small>optional</small></span><textarea rows={4} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Add context, your reason, or the next step…" /></label>
        <div className="field-row">
          <label className="field"><span>Priority</span><select value={priority} onChange={event => setPriority(event.target.value as Priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label className="field"><span>Due date <small>Jalali</small></span><JalaliDateField value={dueDate} onChange={setDueDate} /></label>
        </div>
        {type !== "month" && (
          <label className="field">
            <span>Align with {type === "week" ? "monthly goal" : "weekly priority"} <small>optional</small></span>
            <select value={parentId} onChange={event => setParentId(event.target.value)}>
              <option value="">No parent — keep independent</option>
              {parents.map(parent => <option key={parent.id} value={parent.id}>{parent.title}</option>)}
            </select>
          </label>
        )}
        <div className="modal-actions"><button type="button" className="soft-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!title.trim() || saving}>{saving && <LoaderCircle className="spin" size={16} />}{item ? "Save changes" : `Add ${typeCopy[type].item}`}</button></div>
      </form>
    </div>
  );
}

function RolloverModal({
  data, onClose, onCarry, onDelete
}: {
  data: BootstrapResponse;
  onClose: () => void;
  onCarry: (ids: string[]) => Promise<void>;
  onDelete: (item: PlanItem) => Promise<void>;
}) {
  const [selected, setSelected] = useState(() => new Set(data.rollover.items.map(item => item.id)));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const availableIds = new Set(data.rollover.items.map(item => item.id));
    setSelected(current => new Set([...current].filter(id => availableIds.has(id))));
    if (!data.rollover.items.length) onClose();
  }, [data.rollover.items, onClose]);

  return (
    <div className="modal-layer">
      <div className="modal rollover-modal">
        <div className="modal-head"><div><span className="section-kicker">Fresh start, intentional history</span><h2>Carry intentions forward</h2><p>Select what still deserves your attention, or permanently remove what no longer does.</p></div><button className="icon-button" onClick={onClose}><X /></button></div>
        <div className="rollover-list">
          {data.rollover.items.map(item => (
            <div key={item.id} className={`rollover-item ${selected.has(item.id) ? "is-selected" : ""}`}>
              <label>
                <input type="checkbox" checked={selected.has(item.id)} onChange={() => {
                  const next = new Set(selected);
                  next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                  setSelected(next);
                }} />
                <span><strong>{item.title}</strong><small>{typeCopy[item.sourcePlanType].singular} · {item.sourcePlanTitle}</small></span>
              </label>
              <span className={`priority ${item.priority}`}>{item.priority}</span>
              <button
                className="rollover-delete"
                aria-label={`Permanently delete ${item.title}`}
                title="Delete permanently"
                disabled={saving || deleting !== null}
                onClick={async () => {
                  if (!window.confirm(`Permanently delete “${item.title}”? This cannot be undone.`)) return;
                  setDeleting(item.id);
                  try { await onDelete(item); }
                  finally { setDeleting(null); }
                }}
              >
                {deleting === item.id ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
              </button>
            </div>
          ))}
        </div>
        <div className="modal-actions"><button className="soft-button" onClick={onClose}>Not now</button><button className="primary-button" disabled={!selected.size || saving || deleting !== null} onClick={async () => { setSaving(true); try { await onCarry([...selected]); } finally { setSaving(false); } }}>{saving && <LoaderCircle className="spin" size={16} />}Carry {selected.size} forward</button></div>
      </div>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return <div className="toast"><Check size={16} /> {message}</div>;
}

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [date, setDate] = useState(todayIso());
  const [data, setData] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("theme") as Theme) || "light");
  const [menuOpen, setMenuOpen] = useState(false);
  const [editor, setEditor] = useState<{ type: PlanType; item: PlanItem | null } | null>(null);
  const [rolloverOpen, setRolloverOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [celebrate, setCelebrate] = useState(false);

  const load = useCallback(async (targetDate = date) => {
    setLoading(true); setError("");
    try { setData(await api.bootstrap(targetDate)); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load your plans"); }
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { void load(date); }, [date, load]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const mutate = async (work: () => Promise<unknown>, message?: string) => {
    try { await work(); await load(); if (message) setToast(message); }
    catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
  };

  const saveItem = async (payload: {
    title: string; notes: string; priority: Priority; dueDate: string | null; parentId: string | null;
  }) => {
    if (!editor || !data) return;
    if (editor.item) await api.updateItem(editor.item.id, payload);
    else await api.createItem({ ...payload, planId: data.periods[editor.type].plan.id });
    setEditor(null);
    await load();
    setToast(editor.item ? "Intention updated" : "Intention added");
  };

  const setStatus = (item: PlanItem, status: ItemStatus) => void mutate(async () => {
    await api.updateItem(item.id, { status });
    if (status === "done") {
      setCelebrate(true);
      window.setTimeout(() => setCelebrate(false), 900);
    }
  }, status === "done" ? "Beautiful work — intention complete" : undefined);

  const remove = (item: PlanItem) => {
    if (!window.confirm(`Delete “${item.title}”? Linked children will remain and become unlinked.`)) return;
    void mutate(() => api.deleteItem(item.id), "Item deleted");
  };

  const reorder = (type: PlanType, source: string, target: string) => {
    if (!data) return;
    const ids = data.periods[type].items.map(item => item.id);
    const from = ids.indexOf(source); const to = ids.indexOf(target);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    void mutate(() => api.reorder(data.periods[type].plan.id, ids));
  };

  const actions = useMemo(() => ({
    add: (type: PlanType) => setEditor({ type, item: null }),
    edit: (item: PlanItem) => {
      if (!data) return;
      const type = (Object.keys(data.periods) as PlanType[]).find(key => data.periods[key].plan.id === item.planId);
      if (type) setEditor({ type, item });
    },
    status: setStatus,
    remove,
    reorder,
    openRollover: () => setRolloverOpen(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data]);

  if (loading && !data) return <div className="loading-screen"><Logo /><LoaderCircle className="spin" /><span>Preparing your day…</span></div>;
  if (!data) return <div className="loading-screen error-screen"><Logo /><p>{error || "The planner could not start."}</p><button className="primary-button" onClick={() => load()}>Try again</button></div>;

  const planView = view === "month" || view === "week" || view === "day" ? view : null;
  return (
    <div className="app-shell">
      <Sidebar view={view} onView={setView} theme={theme} onTheme={() => setTheme(theme === "light" ? "dark" : "light")} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main>
        <Topbar data={data} onMenu={() => setMenuOpen(true)} onToday={() => setDate(data.today)} />
        {error && <div className="error-banner">{error}<button onClick={() => setError("")}><X size={16} /></button></div>}
        {view === "dashboard" && <Dashboard data={data} actions={actions} />}
        {planView && (
          <div className="page">
            <div className="plan-page-head">
              <div className="page-title"><span className="section-kicker">{typeCopy[planView].singular} planning</span><h1>{planView === "month" ? "Set your direction" : planView === "week" ? "Shape the week" : "Focus your day"}</h1><p>{planView === "month" ? "Choose the outcomes that deserve your energy." : planView === "week" ? "Translate your bigger goals into clear priorities." : "Keep today small, honest, and achievable."}</p></div>
              <DateNavigator type={planView} date={date} onChange={setDate} />
            </div>
            <PlanPanel type={planView} data={data.periods[planView]} allData={data}
              onAdd={() => actions.add(planView)} onEdit={actions.edit} onStatus={actions.status}
              onDelete={actions.remove} onReorder={actions.reorder} />
          </div>
        )}
        {view === "insights" && <InsightsView data={data} />}
        {view === "settings" && <SettingsView theme={theme} onTheme={() => setTheme(theme === "light" ? "dark" : "light")} />}
      </main>
      <nav className="mobile-nav">
        {([
          ["dashboard", LayoutDashboard], ["month", Target], ["week", CalendarDays],
          ["day", Focus], ["insights", BarChart3]
        ] as Array<[View, typeof Target]>).map(([id, Icon]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon size={19} /><span>{id === "dashboard" ? "Home" : id}</span></button>)}
      </nav>
      {editor && <ItemModal type={editor.type} item={editor.item} data={data} onClose={() => setEditor(null)} onSave={saveItem} />}
      {rolloverOpen && <RolloverModal data={data} onClose={() => setRolloverOpen(false)} onDelete={async item => {
        try {
          await api.deleteItem(item.id);
          await load();
          setToast("Intention permanently deleted");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not delete intention");
        }
      }} onCarry={async ids => {
        const copies = ids.map(id => {
          const item = data.rollover.items.find(candidate => candidate.id === id)!;
          return { itemId: id, targetPlanId: data.periods[item.sourcePlanType].plan.id };
        });
        await api.rollover(copies); setRolloverOpen(false); await load(); setToast("Intentions carried forward");
      }} />}
      {toast && <Toast message={toast} />}
      {celebrate && <div className="celebration" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties} />)}</div>}
    </div>
  );
}
