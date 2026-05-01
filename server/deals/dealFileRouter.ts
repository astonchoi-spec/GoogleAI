import type { DealCategory, DealStatus } from "./dealTypes.ts";

export type DealCommand =
  | { action: "create"; dealName: string }
  | { action: "list" }
  | { action: "detail"; dealName: string }
  | { action: "save"; dealName: string; category: DealCategory }
  | { action: "notebook"; dealName: string; notebookUrl: string }
  | { action: "status"; dealName: string; status: DealStatus }
  | { action: "unknown"; reason: string };

const FORBIDDEN_WINDOWS_CHARS = /[\\/:*?"<>|]/g;

const CATEGORY_KEYWORDS: Array<[DealCategory, string[]]> = [
  ["contract", ["계약서", "계약", "매매계약", "신탁계약"]],
  ["feasibility", ["사업수지", "수지", "수지표", "사업성", "재무"]],
  ["legal", ["법률", "검토", "자문", "의견서", "변호사"]],
  ["market", ["시장", "입지", "조사", "리서치", "시장조사"]],
  ["disclosure", ["공시", "dart", "등기", "고시", "공고"]],
];

const STATUS_KEYWORDS: Record<string, DealStatus> = {
  검토중: "reviewing",
  검토: "reviewing",
  진행중: "active",
  진행: "active",
  대기: "pending",
  완료: "completed",
  끝: "completed",
  거절: "rejected",
  반려: "rejected",
};

export function normalizeDealName(input: string): string {
  return input
    .replace(FORBIDDEN_WINDOWS_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export function sanitizeFileName(input: string): string {
  const sanitized = input.replace(FORBIDDEN_WINDOWS_CHARS, "").replace(/\s+/g, " ").trim();
  return sanitized || "deal-file";
}

export function mapCategory(keyword?: string): DealCategory {
  const normalized = (keyword ?? "").trim().toLowerCase();
  if (!normalized) return "misc";
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((entry) => normalized.includes(entry.toLowerCase()))) {
      return category;
    }
  }
  return "misc";
}

export function parseDealStatus(input: string): DealStatus | null {
  const compact = input.replace(/\s+/g, "").toLowerCase();
  return STATUS_KEYWORDS[compact] ?? null;
}

export function parseDealCommand(text: string): DealCommand {
  const message = text.trim();
  if (!message.startsWith("딜")) {
    return { action: "unknown", reason: "딜 명령이 아닙니다" };
  }

  const listMatch = message.match(/^딜\s*목록\s*$/);
  if (listMatch) return { action: "list" };

  const createMatch = message.match(/^딜\s*추가\s+(.+)$/);
  if (createMatch) {
    const dealName = normalizeDealName(createMatch[1]);
    return dealName ? { action: "create", dealName } : { action: "unknown", reason: "딜명을 입력해주세요" };
  }

  const saveMatch = message.match(/^딜\s*저장\s+(.+?)(?:\s+(계약서|계약|매매계약|신탁계약|사업수지|수지|수지표|사업성|재무|법률|검토|자문|의견서|변호사|시장|입지|조사|리서치|시장조사|공시|DART|dart|등기|고시|공고|기타))?\s*$/);
  if (saveMatch) {
    const dealName = normalizeDealName(saveMatch[1]);
    return dealName ? { action: "save", dealName, category: mapCategory(saveMatch[2]) } : { action: "unknown", reason: "딜명을 입력해주세요" };
  }

  const notebookMatch = message.match(/^딜\s*노트북\s+(.+?)\s+(https?:\/\/notebooklm\.google\.com\/\S+)\s*$/i);
  if (notebookMatch) {
    const dealName = normalizeDealName(notebookMatch[1]);
    return dealName
      ? { action: "notebook", dealName, notebookUrl: notebookMatch[2] }
      : { action: "unknown", reason: "딜명을 입력해주세요" };
  }

  const statusMatch = message.match(/^딜\s*상태\s+(.+?)\s+(\S+)\s*$/);
  if (statusMatch) {
    const dealName = normalizeDealName(statusMatch[1]);
    const status = parseDealStatus(statusMatch[2]);
    if (!dealName) return { action: "unknown", reason: "딜명을 입력해주세요" };
    if (!status) return { action: "unknown", reason: "상태는 검토중/진행중/대기/완료/거절 중 하나입니다" };
    return { action: "status", dealName, status };
  }

  const detailMatch = message.match(/^딜\s+(.+)$/);
  if (detailMatch) {
    const dealName = normalizeDealName(detailMatch[1]);
    return dealName ? { action: "detail", dealName } : { action: "unknown", reason: "딜명을 입력해주세요" };
  }

  return { action: "unknown", reason: "지원하지 않는 딜 명령입니다" };
}
