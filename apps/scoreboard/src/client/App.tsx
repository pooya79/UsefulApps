import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { BarChart3, Download, LayoutDashboard, Settings2, Trophy } from "lucide-react";
import type { DashboardResponse, ScoreboardConfig } from "../shared/schema";
import { api } from "./api";
import { Dashboard } from "./Dashboard";

const History = lazy(() => import("./History").then((module) => ({ default: module.History })));
const Settings = lazy(() => import("./Settings").then((module) => ({ default: module.Settings })));

type View = "dashboard" | "history" | "settings";

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [data, setData] = useState<DashboardResponse>();
  const [date, setDate] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (selected?: string) => {
    try {
      setError(undefined);
      const result = await api.dashboard(selected);
      setData(result);
      setDate(result.date);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(date); }, [date, load]);

  const updateDate = (next: string) => { setLoading(true); setDate(next); };
  const saveConfig = async (config: ScoreboardConfig) => {
    await api.saveConfig(config);
    await load(date);
  };

  if (loading && !data) return <div className="splash"><Trophy /><span>Building your score…</span></div>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("dashboard")}><span className="brand-mark"><Trophy /></span><span>SCOREBOARD</span></button>
        <a className="icon-button desktop-export" href="/api/export.csv" title="Export CSV"><Download /></a>
      </header>

      {error && <div className="error-banner" role="alert">{error}<button onClick={() => void load(date)}>Retry</button></div>}
      {data?.configError && <div className="warning-banner" role="alert"><strong>Configuration warning:</strong> {data.configError}</div>}

      <main>
        {data && view === "dashboard" && <Dashboard data={data} onDateChange={updateDate} onRefresh={() => load(date)} />}
        <Suspense fallback={<div className="splash inline-splash"><span>Loading view…</span></div>}>
          {data && view === "history" && <History data={data} onEditDate={(value) => { updateDate(value); setView("dashboard"); }} />}
          {data && view === "settings" && <Settings initial={data.config} onSave={saveConfig} />}
        </Suspense>
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}><LayoutDashboard /><span>Today</span></button>
        <button className={view === "history" ? "active" : ""} onClick={() => setView("history")}><BarChart3 /><span>History</span></button>
        <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Settings2 /><span>Metrics</span></button>
      </nav>
    </div>
  );
}
