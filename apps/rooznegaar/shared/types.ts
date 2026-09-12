export type PlanType = "month" | "week" | "day";
export type ItemStatus = "todo" | "in_progress" | "done";
export type Priority = "low" | "medium" | "high";

export interface Plan {
  id: string;
  type: PlanType;
  periodKey: string;
  startsOn: string;
  endsOn: string;
  title: string;
  createdAt: string;
}

export interface PlanItem {
  id: string;
  planId: string;
  parentId: string | null;
  title: string;
  notes: string;
  priority: Priority;
  status: ItemStatus;
  dueDate: string | null;
  sortOrder: number;
  sourceItemId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface PeriodBundle {
  plan: Plan;
  items: PlanItem[];
  progress: number;
}

export interface InsightDay {
  date: string;
  label: string;
  completed: number;
  total: number;
  rate: number;
}

export interface BootstrapResponse {
  selectedDate: string;
  today: string;
  periods: Record<PlanType, PeriodBundle>;
  insights: {
    days: InsightDay[];
    completedTotal: number;
    currentStreak: number;
    bestStreak: number;
    highPriorityDone: number;
  };
  rollover: {
    available: boolean;
    items: Array<PlanItem & { sourcePlanType: PlanType; sourcePlanTitle: string }>;
  };
}
