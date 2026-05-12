// Aston 통합 지식 RAG (Track A 외부 NotebookLM ↔ Track B 내부 Discovery Engine) 타입 정의.
// Phase 1 — 외부 NotebookLM 카탈로그 + Track B 데이터 스토어 매핑 표현.

export type RagCategory =
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

export type RagStatus = "active" | "paused" | "archived";

export type RagDataStoreId =
  | "ds-real-estate-deals"
  | "ds-trading-research"
  | "ds-learning-ai"
  | "ds-research-macro"
  | "ds-legal-contracts"
  | "ds-business-operations"
  | "ds-mongolia-business"
  | "ds-personal-strategy"
  | "ds-personal-health";

export interface RagMappingEntry {
  notebook_name: string;
  project: string;
  display_name: string;
  category: RagCategory;
  status: RagStatus;
  data_store: RagDataStoreId;
  data_store_filter: string;
  notebook_url?: string;
  notes?: string;
  tags?: string[];
  created_at?: string;
}

export interface RagMapping {
  notebooks: RagMappingEntry[];
}

export const RAG_CATEGORY_LABELS: Record<RagCategory, string> = {
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

export const RAG_DATA_STORE_LABELS: Record<RagDataStoreId, string> = {
  "ds-real-estate-deals": "부동산 PF 딜",
  "ds-trading-research": "트레이딩·시스템",
  "ds-learning-ai": "학습·AI 에이전트",
  "ds-research-macro": "리서치·매크로",
  "ds-legal-contracts": "법무·계약",
  "ds-business-operations": "회사·사업 운영",
  "ds-mongolia-business": "몽골 사업",
  "ds-personal-strategy": "개인 전략·여행",
  "ds-personal-health": "가족·건강",
};

export const VALID_RAG_CATEGORIES = new Set<string>(
  Object.keys(RAG_CATEGORY_LABELS),
);
export const VALID_RAG_STATUSES = new Set<string>([
  "active",
  "paused",
  "archived",
]);
export const VALID_DATA_STORES = new Set<string>(
  Object.keys(RAG_DATA_STORE_LABELS),
);
