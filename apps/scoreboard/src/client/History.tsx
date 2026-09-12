import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Edit3 } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardResponse, Entry } from "../shared/schema";
import { api } from "./api";
import { addDays, shortDate } from "./dateUtils";

export function History({ data, onEditDate }: { data: DashboardResponse; onEditDate: (date: string) => void }) {
  const [metricId, setMetricId] = useState(data.config.metrics[0].id);
  const [range, setRange] = useState<7 | 30>(30);
  const [entries, setEntries] = useState<Entry[]>([]);
  const metric = data.config.metrics.find((item) => item.id === metricId) ?? data.config.metrics[0];
  const from = addDays(data.today, -(range - 1));
  useEffect(() => { void api.history(from, data.today, metricId).then(setEntries); }, [from, data.today, metricId]);
  const chart = useMemo(() => Array.from({ length: range }, (_, index) => {
    const date = addDays(from, index);
    return { date, label: shortDate(date), value: entries.find((entry) => entry.date === date)?.value ?? 0 };
  }), [entries, from, range]);
  const total = chart.reduce((sum, item) => sum + item.value, 0);
  const activeDays = chart.filter((item) => item.value > 0).length;

  return (
    <div className="page">
      <div className="page-heading"><div><span className="eyebrow">Look back. Move forward.</span><h1>Your history</h1><p>Patterns make progress visible.</p></div><a className="export-button" href="/api/export.csv">Export CSV</a></div>
      <div className="history-controls">
        <label>Metric<select value={metricId} onChange={(event) => setMetricId(event.target.value)}>{data.config.metrics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="range-toggle"><button className={range === 7 ? "active" : ""} onClick={() => setRange(7)}>7 days</button><button className={range === 30 ? "active" : ""} onClick={() => setRange(30)}>30 days</button></div>
      </div>
      <section className="chart-card" style={{ "--metric": metric.color } as React.CSSProperties}>
        <div className="chart-summary"><div><span>Total</span><strong>{total.toFixed(metric.precision)} <small>{metric.unit}</small></strong></div><div><span>Active days</span><strong>{activeDays}<small> / {range}</small></strong></div></div>
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
          <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={metric.color} stopOpacity={0.45}/><stop offset="95%" stopColor={metric.color} stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262a33"/><XAxis dataKey="label" tick={{ fill: "#848b9b", fontSize: 11 }} axisLine={false} tickLine={false} interval={range === 30 ? 5 : 0}/><YAxis tick={{ fill: "#848b9b", fontSize: 11 }} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={{ background: "#171a21", border: "1px solid #303541", borderRadius: 12 }} labelStyle={{ color: "#f5f7fa" }}/><Area type="monotone" dataKey="value" stroke={metric.color} strokeWidth={3} fill="url(#chartFill)" />
        </AreaChart></ResponsiveContainer></div>
      </section>
      <section className="history-list"><h2><CalendarDays /> Recent entries</h2>{[...entries].reverse().slice(0, 12).map((entry) => <button key={entry.date} onClick={() => onEditDate(entry.date)}><span><strong>{shortDate(entry.date)}</strong><small>{entry.date}</small></span><span>{entry.value} {metric.unit}<Edit3 /></span></button>)}{entries.length === 0 && <p className="empty-state">No entries yet. Your first check-in will appear here.</p>}</section>
    </div>
  );
}
