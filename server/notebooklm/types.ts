export type NotebookCategory =
  | "real-estate"
  | "system"
  | "trading"
  | "learning"
  | "legal"
  | "personal"
  | "research"
  | "business"
  | "health"
  | "mongolia";

export type NotebookStatus = "active" | "paused" | "archived";

export interface NotebookEntry {
  notebook_name: string;
  project: string;
  display_name: string;
  category: NotebookCategory;
  status: NotebookStatus;
  notes?: string;
  tags?: string[];
  created_at?: string;
}

export interface NotebookMapping {
  notebooks: NotebookEntry[];
}

export const CATEGORY_LABELS: Record<NotebookCategory, string> = {
  "real-estate": "부동산 PF",
  system: "시스템·자동화",
  trading: "트레이딩",
  learning: "학습·AI",
  legal: "법무",
  personal: "개인",
  research: "리서치·매크로",
  business: "회사·사업",
  health: "건강",
  mongolia: "몽골",
};

export const VALID_CATEGORIES = new Set<string>([
  "real-estate",
  "system",
  "trading",
  "learning",
  "legal",
  "personal",
  "research",
  "business",
  "health",
  "mongolia",
]);

export const VALID_STATUSES = new Set<string>(["active", "paused", "archived"]);
