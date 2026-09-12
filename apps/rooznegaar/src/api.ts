import type { BootstrapResponse, ItemStatus, Priority } from "../shared/types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (options?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Something went wrong" }));
    throw new Error(body.error ?? "Something went wrong");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  bootstrap: (date: string) => request<BootstrapResponse>(`/api/bootstrap?date=${date}`),
  createItem: (data: {
    planId: string;
    parentId?: string | null;
    title: string;
    notes?: string;
    priority?: Priority;
    status?: ItemStatus;
    dueDate?: string | null;
  }) => request("/api/items", { method: "POST", body: JSON.stringify(data) }),
  updateItem: (id: string, data: Record<string, unknown>) =>
    request(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteItem: (id: string) => request(`/api/items/${id}`, { method: "DELETE" }),
  reorder: (planId: string, ids: string[]) =>
    request("/api/items/reorder", { method: "POST", body: JSON.stringify({ planId, ids }) }),
  rollover: (copies: Array<{ itemId: string; targetPlanId: string }>) =>
    request("/api/rollover", { method: "POST", body: JSON.stringify({ copies }) })
};
