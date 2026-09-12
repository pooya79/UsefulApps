import { useRef, useState } from "react";
import { AlertTriangle, Plus, Save, Trash2 } from "lucide-react";
import type { MetricDefinition, ScoreboardConfig } from "../shared/schema";
import { metricIconOptions, metricIcons } from "./icons";

const colors = ["#ff5c35", "#ffb020", "#22c997", "#6c63ff", "#31a8ff", "#ef5da8"];

function newMetric(index: number): MetricDefinition {
  return { id: `new-metric-${index}`, name: "New metric", category: "Personal", unit: "units", precision: 0, color: colors[index % colors.length], icon: "target", quickAdd: [1, 5, 10], target: { period: "daily", value: 10 } };
}

export function Settings({ initial, onSave }: { initial: ScoreboardConfig; onSave: (config: ScoreboardConfig) => Promise<void> }) {
  const [config, setConfig] = useState<ScoreboardConfig>(() => structuredClone(initial));
  const [metricKeys, setMetricKeys] = useState(() => initial.metrics.map((_, index) => `metric-${index}`));
  const nextMetricKey = useRef(initial.metrics.length);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const update = (index: number, patch: Partial<MetricDefinition>) => setConfig((current) => ({ ...current, metrics: current.metrics.map((metric, itemIndex) => itemIndex === index ? { ...metric, ...patch } : metric) }));
  const submit = async () => {
    setSaving(true); setMessage(undefined);
    try { await onSave(config); setMessage("Metric configuration saved."); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  return (
    <div className="page">
      <div className="page-heading"><div><span className="eyebrow">Make it yours</span><h1>Metric setup</h1><p>These changes update <code>config/metrics.json</code>.</p></div><button className="primary-button" disabled={saving} onClick={() => void submit()}><Save /> {saving ? "Saving…" : "Save changes"}</button></div>
      <div className="info-banner"><AlertTriangle /><span>Metric IDs connect entries to their history. Rename the label freely, but changing an ID starts a new history series. Removing a metric preserves its old data.</span></div>
      {message && <div className={message.includes("saved") ? "success-banner" : "error-banner"}>{message}</div>}
      <section className="settings-list">
        {config.metrics.map((metric, index) => {
          const CurrentIcon = metricIcons[metric.icon];
          return <article className="settings-card" key={metricKeys[index]}>
          <div className="settings-card-title"><span className="settings-card-icon" style={{ "--metric": metric.color } as React.CSSProperties}><CurrentIcon /></span><strong>{metric.name}</strong><button aria-label={`Remove ${metric.name}`} disabled={config.metrics.length === 1} onClick={() => { setConfig((current) => ({ ...current, metrics: current.metrics.filter((_, itemIndex) => itemIndex !== index) })); setMetricKeys((current) => current.filter((_, itemIndex) => itemIndex !== index)); }}><Trash2 /></button></div>
          <div className="form-grid">
            <label>Name<input value={metric.name} onChange={(event) => update(index, { name: event.target.value })}/></label>
            <label>Stable ID<input value={metric.id} onChange={(event) => update(index, { id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}/></label>
            <label>Category<input value={metric.category} onChange={(event) => update(index, { category: event.target.value })}/></label>
            <label>Unit<input value={metric.unit} onChange={(event) => update(index, { unit: event.target.value })}/></label>
            <label>Target period<select value={metric.target.period} onChange={(event) => update(index, { target: { ...metric.target, period: event.target.value as "daily" | "weekly" } })}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
            <label>Target value<input type="number" min="0.01" value={metric.target.value} onChange={(event) => update(index, { target: { ...metric.target, value: Number(event.target.value) } })}/></label>
            <label>Decimal places<select value={metric.precision} onChange={(event) => update(index, { precision: Number(event.target.value) })}><option value="0">0</option><option value="1">1</option><option value="2">2</option></select></label>
            <label>Color<select value={metric.color} onChange={(event) => update(index, { color: event.target.value })}>{colors.map((color) => <option key={color} value={color}>{color}</option>)}</select></label>
            <fieldset className="icon-picker full-field">
              <legend>Icon</legend>
              <div>
                {metricIconOptions.map(({ name, label }) => {
                  const Icon = metricIcons[name];
                  return <button type="button" key={name} className={metric.icon === name ? "selected" : ""} aria-label={label} aria-pressed={metric.icon === name} title={label} onClick={() => update(index, { icon: name })}><Icon /><span>{label}</span></button>;
                })}
              </div>
            </fieldset>
            <label className="full-field">Quick-add values<input value={metric.quickAdd.join(", ")} onChange={(event) => update(index, { quickAdd: event.target.value.split(",").map(Number).filter((value) => value > 0).slice(0, 5) })}/><small>Separate up to five positive numbers with commas.</small></label>
          </div>
        </article>})}
      </section>
      <button className="add-metric" onClick={() => { const key = `metric-${nextMetricKey.current++}`; setConfig((current) => ({ ...current, metrics: [...current.metrics, newMetric(current.metrics.length + 1)] })); setMetricKeys((current) => [...current, key]); }}><Plus /> Add another metric</button>
    </div>
  );
}
