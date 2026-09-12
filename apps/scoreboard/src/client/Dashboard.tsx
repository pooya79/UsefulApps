import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Flame, RotateCcw, Sparkles } from "lucide-react";
import type { DashboardResponse, MetricDefinition } from "../shared/schema";
import { api } from "./api";
import { addDays, friendlyDate } from "./dateUtils";
import { metricIcons } from "./icons";

function ScoreRing({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="score-ring" style={{ "--score": Math.min(score, 100) } as React.CSSProperties}>
      <svg viewBox="0 0 124 124" aria-hidden="true">
        <circle className="ring-track" cx="62" cy="62" r={radius} />
        <circle className="ring-value" cx="62" cy="62" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.min(score, 100) / 100)} />
      </svg>
      <div><strong>{score}</strong><span>YOUR SCORE</span></div>
    </div>
  );
}

function MetricCard({ metric, value, periodValue, progress, currentStreak, bestStreak, onSave }: {
  metric: MetricDefinition; value: number; periodValue: number; progress: number; currentStreak: number; bestStreak: number;
  onSave: (value: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const previous = useRef(value);
  const Icon = metricIcons[metric.icon];
  useEffect(() => { setDraft(String(value)); previous.current = value; }, [value]);

  const commit = async (next: number) => {
    if (!Number.isFinite(next) || next < 0 || next === value) return;
    previous.current = value;
    setDraft(String(next)); setSaving(true); setSaved(false);
    try { await onSave(next); setSaved(true); setTimeout(() => setSaved(false), 1600); }
    catch { setDraft(String(value)); }
    finally { setSaving(false); }
  };

  const targetLabel = metric.target.period === "daily" ? "daily target" : "weekly target";
  const displayProgress = Math.round(progress * 100);
  return (
    <article className="metric-card" style={{ "--metric": metric.color } as React.CSSProperties}>
      <div className="metric-card-head">
        <span className="metric-icon"><Icon /></span>
        <div><span className="eyebrow">{metric.category}</span><h3>{metric.name}</h3></div>
        <span className="period-pill">{metric.target.period}</span>
      </div>
      <div className="entry-row">
        <label><span className="sr-only">{metric.name} value</span><input type="number" min="0" step={10 ** -metric.precision} value={draft}
          onChange={(event) => setDraft(event.target.value)} onBlur={() => void commit(Number(draft))}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
        <span className="entry-unit">{metric.unit}</span>
        <span className={`save-state ${saving || saved ? "visible" : ""}`}>{saving ? "Saving…" : "Saved"}</span>
      </div>
      <div className="quick-actions">
        {metric.quickAdd.map((amount) => <button key={amount} onClick={() => void commit(Number(draft || 0) + amount)}>+{amount}</button>)}
        {Number(draft) !== value && <button className="undo" onClick={() => setDraft(String(value))}><RotateCcw /> Reset</button>}
      </div>
      <div className="progress-meta"><span>{metric.target.period === "weekly" ? periodValue : Number(draft || 0)} / {metric.target.value} {metric.unit}</span><strong>{displayProgress}% <small>{targetLabel}</small></strong></div>
      <div className="progress-track"><span style={{ width: `${Math.min(100, displayProgress)}%` }} /></div>
      <div className="streak-row"><span><Flame /> {currentStreak} {metric.target.period === "daily" ? "day" : "week"} streak</span><span>Best {bestStreak}</span></div>
    </article>
  );
}

export function Dashboard({ data, onDateChange, onRefresh }: { data: DashboardResponse; onDateChange: (date: string) => void; onRefresh: () => Promise<void> }) {
  const [celebrate, setCelebrate] = useState(false);
  const priorScore = useRef(data.score);
  useEffect(() => {
    if (data.date === data.today && data.score >= 100 && priorScore.current < 100) {
      setCelebrate(true); setTimeout(() => setCelebrate(false), 2400);
    }
    priorScore.current = data.score;
  }, [data.score, data.date, data.today]);

  const save = async (metricId: string, value: number) => {
    await api.saveEntries(data.date, { [metricId]: value });
    await onRefresh();
  };
  return (
    <div className="page dashboard-page">
      {celebrate && <div className="celebration" aria-live="polite"><Sparkles /><strong>Goal crushed!</strong><span>You hit 100 today.</span></div>}
      <section className="hero-panel">
        <div>
          <span className="eyebrow">Daily momentum</span>
          <h1>Keep the promise<br />you made to yourself.</h1>
          <p>Small actions. Measured daily. Compounded for life.</p>
        </div>
        <ScoreRing score={data.score} />
      </section>
      <div className="date-switcher">
        <button onClick={() => onDateChange(addDays(data.date, -1))} aria-label="Previous day"><ChevronLeft /></button>
        <div><strong>{friendlyDate(data.date, data.today)}</strong><span>{data.date}</span></div>
        <button disabled={data.date >= data.today} onClick={() => onDateChange(addDays(data.date, 1))} aria-label="Next day"><ChevronRight /></button>
      </div>
      <section className="metrics-grid">
        {data.config.metrics.map((metric) => {
          const stat = data.stats[metric.id];
          return <MetricCard key={metric.id} metric={metric} value={data.entries[metric.id] ?? 0} periodValue={stat.periodValue}
            progress={stat.progress} currentStreak={stat.currentStreak} bestStreak={stat.bestStreak} onSave={(value) => save(metric.id, value)} />;
        })}
      </section>
    </div>
  );
}
