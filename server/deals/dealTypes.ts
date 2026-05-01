export type DealStatus = "reviewing" | "active" | "pending" | "completed" | "rejected";

export type DealCategory = "contract" | "feasibility" | "legal" | "market" | "disclosure" | "misc";

export type DealFileCount = Record<DealCategory, number>;

export type DealRecentFile = {
  originalName: string;
  savedName: string;
  category: DealCategory;
  savedAt: string;
  path: string;
};

export type DealMeta = {
  id: string;
  name: string;
  status: DealStatus;
  notebookUrl?: string;
  drivePath: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  memo?: string;
  fileCount: DealFileCount;
  recentFiles: DealRecentFile[];
};

export type DealListResult = {
  all: DealMeta[];
  grouped: Record<DealStatus, DealMeta[]>;
};

export type DealMatch =
  | { type: "none"; query: string }
  | { type: "exact"; deal: DealMeta }
  | { type: "single"; deal: DealMeta }
  | { type: "ambiguous"; query: string; candidates: DealMeta[] };

export const DEAL_STATUSES: DealStatus[] = ["reviewing", "active", "pending", "completed", "rejected"];

export const DEAL_CATEGORIES: DealCategory[] = ["contract", "feasibility", "legal", "market", "disclosure", "misc"];

export const DEAL_CATEGORY_DIRS: Record<DealCategory, string> = {
  contract: "01_계약서",
  feasibility: "02_사업수지",
  legal: "03_법률검토",
  market: "04_시장조사",
  disclosure: "05_공시자료",
  misc: "99_기타",
};

export const DEAL_CATEGORY_LABELS: Record<DealCategory, string> = {
  contract: "계약서",
  feasibility: "사업수지",
  legal: "법률검토",
  market: "시장조사",
  disclosure: "공시자료",
  misc: "기타",
};

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  reviewing: "검토 중",
  active: "진행 중",
  pending: "대기",
  completed: "완료",
  rejected: "거절",
};

export const DEAL_STATUS_EMOJIS: Record<DealStatus, string> = {
  reviewing: "🟢",
  active: "🟡",
  pending: "⏸",
  completed: "✅",
  rejected: "❌",
};
