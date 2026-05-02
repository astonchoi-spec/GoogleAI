import type { DealCategory, DealStatus } from "./dealTypes.ts";
import { parseDealDate } from "./dateParser.ts";

export type DealCommand =
  | { action: "create"; dealName: string }
  | { action: "list" }
  | { action: "sheet" }
  | { action: "detail"; dealName: string }
  | { action: "save"; dealName: string; category: DealCategory }
  | { action: "notebook"; dealName: string; notebookUrl: string }
  | { action: "status"; dealName: string; status: DealStatus }
  | { action: "deadline_set"; dealName: string; dateText: string; label?: string }
  | { action: "deadline_clear"; dealName: string }
  | { action: "milestone_add"; dealName: string; label: string; dateText: string }
  | { action: "milestone_complete"; dealName: string; query: string }
  | { action: "milestone_remove"; dealName: string; query: string }
  | { action: "unknown"; reason: string };

const FORBIDDEN_WINDOWS_CHARS = /[\\/:*?"<>|]/g;
const DEAL_PREFIX = "\uB51C";

const CATEGORY_KEYWORDS: Array<[DealCategory, string[]]> = [
  ["contract", ["\uACC4\uC57D", "\uACC4\uC57D\uC11C", "\uB9E4\uB9E4\uACC4\uC57D", "\uC6B0\uC120\uACC4\uC57D"]],
  ["feasibility", ["\uC0AC\uC5C5\uC131", "\uC218\uC9C0", "\uC218\uC775\uC131", "\uC7AC\uBB34"]],
  ["legal", ["\uBC95\uB960", "\uAC80\uD1A0", "\uC790\uBB38", "\uC18C\uC1A1", "\uBCC0\uD638\uC0AC", "\uC758\uACAC\uC11C"]],
  ["market", ["\uC2DC\uC7A5", "\uC785\uC9C0", "\uC870\uC0AC", "\uB9AC\uC11C\uCE58", "\uC2DC\uC7A5\uC870\uC0AC"]],
  ["disclosure", ["\uACF5\uC2DC", "dart", "\uB4F1\uAE30", "\uACE0\uC2DC", "\uACF5\uACE0"]],
];

const STATUS_KEYWORDS: Record<string, DealStatus> = {
  "\uAC80\uD1A0\uC911": "reviewing",
  "\uAC80\uD1A0": "reviewing",
  "\uC9C4\uD589\uC911": "active",
  "\uC9C4\uD589": "active",
  "\uB300\uAE30": "pending",
  "\uC644\uB8CC": "completed",
  "\uC885\uACB0": "completed",
  "\uAC70\uC808": "rejected",
  "\uBC18\uB824": "rejected",
};

export function normalizeDealName(input: string): string {
  return input.replace(FORBIDDEN_WINDOWS_CHARS, "").replace(/\s+/g, " ").trim().slice(0, 100);
}

export function sanitizeFileName(input: string): string {
  const sanitized = input.replace(FORBIDDEN_WINDOWS_CHARS, "").replace(/\s+/g, " ").trim();
  return sanitized || "deal-file";
}

export function mapCategory(keyword?: string): DealCategory {
  const normalized = (keyword ?? "").trim().toLowerCase();
  if (!normalized) return "misc";
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((entry) => normalized.includes(entry.toLowerCase()))) return category;
  }
  return "misc";
}

export function parseDealStatus(input: string): DealStatus | null {
  return STATUS_KEYWORDS[input.replace(/\s+/g, "").toLowerCase()] ?? null;
}

type SplitResult = { dealName: string; label: string; dateText: string };

function splitTrailingDate(rest: string): SplitResult | null {
  const tokens = rest.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  for (const dateLen of [2, 1]) {
    if (tokens.length < dateLen + 1) continue;
    const dateText = tokens.slice(-dateLen).join(" ");
    if (!parseDealDate(dateText)) continue;
    const head = tokens.slice(0, -dateLen);
    return { dealName: normalizeDealName(head[0] ?? ""), label: head.slice(1).join(" ").trim(), dateText };
  }
  return null;
}

export function parseDealCommand(text: string): DealCommand {
  const message = text.trim();
  if (!message.startsWith(DEAL_PREFIX)) return { action: "unknown", reason: "\uB51C \uBA85\uB839\uC5B4\uAC00 \uC544\uB2D9\uB2C8\uB2E4" };

  if (/^\uB51C\s*\uBAA9\uB85D\s*$/.test(message)) return { action: "list" };
  if (/^\uB51C\s*\uC2DC\uD2B8\s*$/.test(message)) return { action: "sheet" };

  const createMatch = message.match(/^\uB51C\s*\uCD94\uAC00\s+(.+)$/);
  if (createMatch) {
    const dealName = normalizeDealName(createMatch[1]);
    return dealName ? { action: "create", dealName } : { action: "unknown", reason: "\uB51C\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694" };
  }

  const saveMatch = message.match(/^\uB51C\s*\uC800\uC7A5\s+(.+?)(?:\s+(\uACC4\uC57D|\uACC4\uC57D\uC11C|\uB9E4\uB9E4\uACC4\uC57D|\uC6B0\uC120\uACC4\uC57D|\uC0AC\uC5C5\uC131|\uC218\uC9C0|\uC218\uC775\uC131|\uC7AC\uBB34|\uBC95\uB960|\uAC80\uD1A0|\uC790\uBB38|\uC18C\uC1A1|\uBCC0\uD638\uC0AC|\uC758\uACAC\uC11C|\uC2DC\uC7A5|\uC785\uC9C0|\uC870\uC0AC|\uB9AC\uC11C\uCE58|\uC2DC\uC7A5\uC870\uC0AC|\uACF5\uC2DC|DART|dart|\uB4F1\uAE30|\uACE0\uC2DC|\uACF5\uACE0|\uAE30\uD0C0))?\s*$/);
  if (saveMatch) {
    const dealName = normalizeDealName(saveMatch[1]);
    return dealName ? { action: "save", dealName, category: mapCategory(saveMatch[2]) } : { action: "unknown", reason: "\uB51C\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694" };
  }

  const notebookMatch = message.match(/^\uB51C\s*\uB178\uD2B8\uBD81\s+(.+?)\s+(https?:\/\/notebooklm\.google\.com\/\S+)\s*$/i);
  if (notebookMatch) {
    const dealName = normalizeDealName(notebookMatch[1]);
    return dealName ? { action: "notebook", dealName, notebookUrl: notebookMatch[2] } : { action: "unknown", reason: "\uB51C\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694" };
  }

  const statusMatch = message.match(/^\uB51C\s*\uC0C1\uD0DC\s+(.+?)\s+(\S+)\s*$/);
  if (statusMatch) {
    const dealName = normalizeDealName(statusMatch[1]);
    const status = parseDealStatus(statusMatch[2]);
    if (!dealName) return { action: "unknown", reason: "\uB51C\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694" };
    if (!status) return { action: "unknown", reason: "\uC0C1\uD0DC\uB294 \uAC80\uD1A0\uC911/\uC9C4\uD589\uC911/\uB300\uAE30/\uC644\uB8CC/\uAC70\uC808 \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4" };
    return { action: "status", dealName, status };
  }

  const deadlineClearMatch = message.match(/^\uB51C\s*\uB9C8\uAC10\s*(?:\uD574\uC81C|\uC81C\uAC70|\uCDE8\uC18C)\s+(.+?)\s*$/);
  if (deadlineClearMatch) {
    const dealName = normalizeDealName(deadlineClearMatch[1]);
    return dealName ? { action: "deadline_clear", dealName } : { action: "unknown", reason: "\uB51C\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694" };
  }

  const deadlineMatch = message.match(/^\uB51C\s*\uB9C8\uAC10\s+(.+)$/);
  if (deadlineMatch) {
    const split = splitTrailingDate(deadlineMatch[1]);
    if (!split) return { action: "unknown", reason: "\uB9C8\uAC10 \uB0A0\uC9DC\uB97C \uC778\uC2DD\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC608: \uB51C \uB9C8\uAC10 \uC131\uB0A844 2026-06-30" };
    if (!split.dealName) return { action: "unknown", reason: "\uB51C\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694" };
    return { action: "deadline_set", dealName: split.dealName, dateText: split.dateText, label: split.label || undefined };
  }

  const milestoneCompleteMatch = message.match(/^\uB51C\s*\uC774\uC815\uD45C\s*\uC644\uB8CC\s+(\S+)\s+(.+?)\s*$/);
  if (milestoneCompleteMatch) {
    const dealName = normalizeDealName(milestoneCompleteMatch[1]);
    const query = milestoneCompleteMatch[2].trim();
    if (!dealName) return { action: "unknown", reason: "\uB51C\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694" };
    if (!query) return { action: "unknown", reason: "\uC774\uC815\uD45C \uC774\uB984\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694" };
    return { action: "milestone_complete", dealName, query };
  }

  const milestoneRemoveMatch = message.match(/^\uB51C\s*\uC774\uC815\uD45C\s*(?:\uC81C\uAC70|\uC0AD\uC81C)\s+(\S+)\s+(.+?)\s*$/);
  if (milestoneRemoveMatch) {
    const dealName = normalizeDealName(milestoneRemoveMatch[1]);
    const query = milestoneRemoveMatch[2].trim();
    if (!dealName) return { action: "unknown", reason: "\uB51C\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694" };
    if (!query) return { action: "unknown", reason: "\uC774\uC815\uD45C \uC774\uB984\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694" };
    return { action: "milestone_remove", dealName, query };
  }

  const milestoneAddMatch = message.match(/^\uB51C\s*\uC774\uC815\uD45C\s+(.+)$/);
  if (milestoneAddMatch) {
    const split = splitTrailingDate(milestoneAddMatch[1]);
    if (!split) return { action: "unknown", reason: "\uC774\uC815\uD45C \uB0A0\uC9DC\uB97C \uC778\uC2DD\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC608: \uB51C \uC774\uC815\uD45C \uC131\uB0A844 \uD5C8\uAC00\uC694\uCCAD 2026-05-15" };
    if (!split.dealName) return { action: "unknown", reason: "\uB51C\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694" };
    if (!split.label) return { action: "unknown", reason: "\uC774\uC815\uD45C \uC774\uB984\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694" };
    return { action: "milestone_add", dealName: split.dealName, label: split.label, dateText: split.dateText };
  }

  const detailMatch = message.match(/^\uB51C\s+(.+)$/);
  if (detailMatch) {
    const dealName = normalizeDealName(detailMatch[1]);
    return dealName ? { action: "detail", dealName } : { action: "unknown", reason: "\uB51C\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694" };
  }

  return { action: "unknown", reason: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uB51C \uBA85\uB839\uC785\uB2C8\uB2E4" };
}
