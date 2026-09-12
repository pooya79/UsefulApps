import type { DashboardResponse, Entry, ScoreboardConfig } from "../shared/schema";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: options?.body ? { "Content-Type": "application/json", ...options.headers } : options?.headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

export const api = {
  dashboard: (date?: string) => request<DashboardResponse>(`/api/dashboard${date ? `?date=${date}` : ""}`),
  saveEntries: (date: string, values: Record<string, number>) => request<{ ok: true }>(`/api/entries/${date}`, {
    method: "PUT", body: JSON.stringify({ values }),
  }),
  history: (from: string, to: string, metricId: string) => request<Entry[]>(`/api/history?from=${from}&to=${to}&metricId=${encodeURIComponent(metricId)}`),
  saveConfig: (config: ScoreboardConfig) => request<{ config: ScoreboardConfig }>("/api/config", {
    method: "PUT", body: JSON.stringify(config),
  }),
};
