// Phase B-1 공통 입력 파이프라인 타입.
// 본 파일은 docs/knowledge-core/phase-b0-interfaces.md 명세를 코드로 옮긴 것.

export type SourceType =
  | "telegram"
  | "voice"
  | "gmail"
  | "kakao_manual"
  | "kakao_mcp"
  | "meeting"
  | "manual"
  | "notebooklm";

export type Category =
  | "real-estate"
  | "trading"
  | "system"
  | "legal"
  | "finance"
  | "personal"
  | "research"
  | "meeting"
  | "other";

export type Importance = "low" | "normal" | "high";
export type PrivacyLevel = "public" | "private" | "sensitive";
export type Quality = "complete" | "partial" | "minimal";
export type Status = "draft" | "active" | "archived" | "done";

export type Attachment = {
  kind: "image" | "audio" | "pdf" | "doc" | "spreadsheet" | "other";
  source_path: string;
  size_bytes?: number;
  mime?: string;
};

export type SourceHints = Record<string, string | number | boolean | undefined>;

export type CommandHints = {
  explicit_project?: string;
  explicit_command?: string;
  permanent_knowledge?: boolean;
  importance?: Importance;
  unknown_tokens?: string[];
};

export type PipelineInput = {
  source_type: SourceType;
  source_ref: string;
  raw_text: string;
  attachments?: Attachment[];
  hints?: SourceHints;
  command_hints?: CommandHints;
  received_at: string; // ISO 8601 KST
};

export type CleanedDocument = PipelineInput & {
  cleaned_text: string;
  cleaning_notes?: string[];
};

export type ClassifiedDocument = CleanedDocument & {
  category: Category;
  suggested_projects: string[];
  classification_confidence: number;
};

export type ActionItemDraft = {
  text: string;
  due_date?: string;
  assignee?: string;
};

export type SummarizedDocument = ClassifiedDocument & {
  title: string;
  summary: string;
  key_points: string[];
  action_item_candidates: ActionItemDraft[];
};

export type TaggedDocument = SummarizedDocument & {
  tags: string[];
  people: string[];
  companies: string[];
  importance: Importance;
  permanent_knowledge: boolean;
  privacy_level: PrivacyLevel;
  step_failures: string[]; // 어느 단계가 폴백되었는지 (LLM 실패 추적)
  quality: Quality;
};

export type RoutingReason =
  | "explicit_command"
  | "single_high_confidence"
  | "keyword_hint_suggested"
  | "inbox_fallback";

export type RoutingDecision = {
  target_folder: string; // Wiki 내 절대 경로
  routing_reason: RoutingReason;
  suggested_alternative?: string;
};

export type WikiEntry = {
  id: string;
  saved_path: string;
  url?: string;
  raw_text_hash: string; // 멱등성 키
  was_skipped?: boolean; // 멱등성으로 skip된 경우 true
};

export type PendingItem = {
  source_ref: string;
  doc: TaggedDocument;
  route: RoutingDecision;
  attempts: number;
  last_error: string;
  first_failed_at: string;
  last_attempt_at: string;
};

export type PipelineEvent = {
  event_type: "wiki_entry_saved";
  entry: WikiEntry;
  metadata: {
    source_type: SourceType;
    routing_reason: RoutingReason;
    is_permanent_knowledge: boolean;
  };
  timestamp: string;
};

// 이번 단계에서 텔레그램 어댑터가 받는 raw event (텔레그래프 의존성 없이 단순화)
export type TelegramRawEvent = {
  chat_id: number;
  message_id: number;
  text: string;
  from?: { id?: number; username?: string };
  chat_title?: string;
  received_at: string;
};
