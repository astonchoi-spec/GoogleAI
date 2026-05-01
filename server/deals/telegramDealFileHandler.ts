import path from "node:path";
import type { Context, Telegraf } from "telegraf";
import type { DealCategory, DealMatch, DealMeta } from "./dealTypes.ts";
import {
  DEAL_CATEGORY_DIRS,
  DEAL_CATEGORY_LABELS,
  DEAL_CATEGORIES,
  DEAL_STATUS_EMOJIS,
  DEAL_STATUS_LABELS,
} from "./dealTypes.ts";
import {
  addMilestone,
  clearDealDeadline,
  completeMilestone,
  createDeal,
  findDealByPartialName,
  getDeal,
  listDeals,
  removeMilestone,
  saveFile,
  setDealDeadline,
  toFileUrl,
  updateDealMeta,
} from "./dealStore.ts";
import { parseDealCommand } from "./dealFileRouter.ts";
import { calcDday, formatKstShortDate, parseDealDate } from "./dateParser.ts";

type TelegramLikeBot = Telegraf<any>["telegram"];

type FilePayload = {
  fileId: string;
  fileName: string;
};

function totalFiles(meta: DealMeta): number {
  return Object.values(meta.fileCount).reduce((sum, count) => sum + count, 0);
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
}

function detailDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAmbiguous(match: Extract<DealMatch, { type: "ambiguous" }>): string {
  return [
    `❓ "${match.query}"는 어느 딜인가요?`,
    ...match.candidates.map((deal, index) => `(${index + 1}) ${deal.name}`),
    "",
    "정확한 딜명으로 다시 입력해주세요.",
  ].join("\n");
}

function formatCreateDeal(meta: DealMeta): string {
  return [
    "✅ 딜 추가 완료",
    `📁 ${meta.name}`,
    "📂 카테고리 폴더 6개 생성됨",
    `🔗 NotebookLM 링크: ${meta.notebookUrl ?? "미등록"}`,
    '   ("딜 노트북 한남동644 [URL]" 로 등록 가능)',
    "",
    "다음:",
    "1. NotebookLM에서 새 노트북 생성",
    "2. Google Drive 소스 추가 → 딜 폴더 선택",
    "3. URL을 위 명령으로 등록",
  ].join("\n");
}

function formatSaved(meta: DealMeta, category: DealCategory, originalName: string): string {
  return [
    "✅ 딜 자료 저장 완료",
    `📁 딜: ${meta.name}`,
    `📂 분류: ${DEAL_CATEGORY_LABELS[category]} (${DEAL_CATEGORY_DIRS[category]})`,
    `📄 파일: ${originalName}`,
    "",
    `🔗 NotebookLM에서 열기: ${meta.notebookUrl ?? "미등록"}`,
  ].join("\n");
}

function formatDealList(metas: DealMeta[]): string {
  const lines = [`📋 딜 목록 (${metas.length}건)`, ""];
  for (const status of ["reviewing", "active", "completed", "rejected", "pending"] as const) {
    const deals = metas.filter((deal) => deal.status === status);
    if (deals.length === 0) continue;
    lines.push(`${DEAL_STATUS_EMOJIS[status]} ${DEAL_STATUS_LABELS[status]} (${deals.length})`);
    lines.push(...deals.map((deal) => `• ${deal.name} — 자료 ${totalFiles(deal)}건 (${shortDate(deal.updatedAt)})`));
    lines.push("");
  }
  return lines.join("\n").trim();
}

function ddayEmoji(dday: number): string {
  if (dday < 0) return "⌛";
  if (dday <= 3) return "🚨";
  if (dday <= 7) return "⏰";
  if (dday <= 30) return "📌";
  return "🗓";
}

function formatDdayText(dday: number): string {
  if (dday > 0) return `D-${dday}`;
  if (dday === 0) return "D-DAY";
  return `D+${Math.abs(dday)}`;
}

function formatDeadlineLine(meta: DealMeta, now: Date = new Date()): string | null {
  if (!meta.deadline) return null;
  const dday = calcDday(meta.deadline, now);
  const labelText = meta.deadlineLabel ? ` — ${meta.deadlineLabel}` : "";
  return `${ddayEmoji(dday)} 마감: ${formatKstShortDate(meta.deadline)} (${formatDdayText(dday)})${labelText}`;
}

function formatMilestonesBlock(meta: DealMeta, now: Date = new Date()): string[] {
  const list = meta.milestones ?? [];
  if (list.length === 0) return [];
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
  const lines = [`📌 이정표 (${sorted.length}건)`];
  for (const m of sorted) {
    if (m.done) {
      lines.push(`  ✅ ${formatKstShortDate(m.date)} ${m.label} (완료)`);
      continue;
    }
    const dday = calcDday(m.date, now);
    lines.push(`  ⏳ ${formatKstShortDate(m.date)} ${m.label} (${formatDdayText(dday)})`);
  }
  return lines;
}

function formatDealDetail(meta: DealMeta, now: Date = new Date()): string {
  const drivePath = path.join(meta.drivePath, path.sep);
  const lines = [
    `📁 ${meta.name}`,
    "━━━━━━━━━━",
    `상태: ${DEAL_STATUS_EMOJIS[meta.status]} ${DEAL_STATUS_LABELS[meta.status]}`,
    `생성: ${detailDate(meta.createdAt).slice(0, 12).trim()}`,
    `최근 갱신: ${detailDate(meta.updatedAt)}`,
  ];
  const deadlineLine = formatDeadlineLine(meta, now);
  if (deadlineLine) lines.push(deadlineLine);
  lines.push("", `📂 자료 (${totalFiles(meta)}건)`, ...DEAL_CATEGORIES.map((category) => `• ${DEAL_CATEGORY_DIRS[category]}: ${meta.fileCount[category]}`));
  const milestonesBlock = formatMilestonesBlock(meta, now);
  if (milestonesBlock.length > 0) {
    lines.push("", ...milestonesBlock);
  }
  lines.push(
    "",
    `🔗 NotebookLM: ${meta.notebookUrl ?? "미등록"}`,
    "📂 Drive 경로:",
    `   ${toFileUrl(meta.drivePath)}/`,
    `   ${drivePath}`
  );
  return lines.join("\n");
}

async function resolveDeal(query: string): Promise<DealMeta | string> {
  const match = await findDealByPartialName(query);
  if (match.type === "none") return `🚫 "${match.query}" 딜을 찾지 못했습니다.\n먼저 "딜 추가 ${match.query}" 명령으로 생성해주세요.`;
  if (match.type === "ambiguous") return formatAmbiguous(match);
  return match.deal;
}

async function executeDealCommandText(text: string): Promise<string> {
  const command = parseDealCommand(text);
  if (command.action === "unknown") return `⚠️ ${command.reason}`;
  if (command.action === "create") return formatCreateDeal(await createDeal(command.dealName));
  if (command.action === "list") {
    const { all } = await listDeals();
    return formatDealList(all);
  }
  if (command.action === "detail") {
    const resolved = await resolveDeal(command.dealName);
    return typeof resolved === "string" ? resolved : formatDealDetail(await getDeal(resolved.name));
  }
  if (command.action === "notebook") {
    const resolved = await resolveDeal(command.dealName);
    if (typeof resolved === "string") return resolved;
    const meta = await updateDealMeta(resolved.name, { notebookUrl: command.notebookUrl });
    return `✅ NotebookLM 링크 등록 완료\n📁 ${meta.name}\n🔗 ${meta.notebookUrl}`;
  }
  if (command.action === "status") {
    const resolved = await resolveDeal(command.dealName);
    if (typeof resolved === "string") return resolved;
    const meta = await updateDealMeta(resolved.name, { status: command.status });
    return `✅ 딜 상태 변경 완료\n📁 ${meta.name}\n상태: ${DEAL_STATUS_EMOJIS[meta.status]} ${DEAL_STATUS_LABELS[meta.status]}`;
  }
  if (command.action === "deadline_set") {
    const resolved = await resolveDeal(command.dealName);
    if (typeof resolved === "string") return resolved;
    const iso = parseDealDate(command.dateText);
    if (!iso) return `⚠️ 날짜를 인식하지 못했습니다: "${command.dateText}"`;
    const meta = await setDealDeadline(resolved.name, iso, command.label);
    const dday = calcDday(iso);
    const past = dday < 0 ? "\n⚠️ 과거 날짜입니다." : "";
    const labelText = command.label ? `\n📝 ${command.label}` : "";
    return `✅ 딜 마감일 등록\n📁 ${meta.name}\n${ddayEmoji(dday)} ${formatKstShortDate(iso)} (${formatDdayText(dday)})${labelText}${past}`;
  }
  if (command.action === "deadline_clear") {
    const resolved = await resolveDeal(command.dealName);
    if (typeof resolved === "string") return resolved;
    const meta = await clearDealDeadline(resolved.name);
    return `✅ 딜 마감일 해제\n📁 ${meta.name}`;
  }
  if (command.action === "milestone_add") {
    const resolved = await resolveDeal(command.dealName);
    if (typeof resolved === "string") return resolved;
    const iso = parseDealDate(command.dateText);
    if (!iso) return `⚠️ 날짜를 인식하지 못했습니다: "${command.dateText}"`;
    const { meta, milestone } = await addMilestone(resolved.name, command.label, iso);
    const dday = calcDday(iso);
    const past = dday < 0 ? "\n⚠️ 과거 날짜입니다." : "";
    return `✅ 이정표 추가\n📁 ${meta.name}\n📌 ${milestone.label}\n${ddayEmoji(dday)} ${formatKstShortDate(iso)} (${formatDdayText(dday)})${past}`;
  }
  if (command.action === "milestone_complete") {
    const resolved = await resolveDeal(command.dealName);
    if (typeof resolved === "string") return resolved;
    try {
      const { meta, milestone } = await completeMilestone(resolved.name, command.query);
      return `✅ 이정표 완료\n📁 ${meta.name}\n✔️ ${milestone.label} (${formatKstShortDate(milestone.date)})`;
    } catch (err) {
      console.error("[telegramDealFileHandler] milestone_complete:", err);
      return `🚫 이정표 "${command.query}"를 찾지 못했습니다.`;
    }
  }
  if (command.action === "milestone_remove") {
    const resolved = await resolveDeal(command.dealName);
    if (typeof resolved === "string") return resolved;
    try {
      const { meta, milestone } = await removeMilestone(resolved.name, command.query);
      return `✅ 이정표 삭제\n📁 ${meta.name}\n🗑 ${milestone.label}`;
    } catch (err) {
      console.error("[telegramDealFileHandler] milestone_remove:", err);
      return `🚫 이정표 "${command.query}"를 찾지 못했습니다.`;
    }
  }
  return "⚠️ 파일 첨부와 함께 사용해주세요.";
}

async function downloadTelegramFile(telegram: TelegramLikeBot, fileId: string): Promise<Buffer> {
  try {
    const fileUrl = await telegram.getFileLink(fileId);
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    console.error("[telegramDealFileHandler] downloadTelegramFile:", err);
    throw new Error("텔레그램 파일을 다운로드하지 못했습니다.");
  }
}

export function extractDealFilePayload(ctx: Context): FilePayload | null {
  const message = ctx.message as any;
  if (message?.document?.file_id) {
    return {
      fileId: message.document.file_id,
      fileName: message.document.file_name || "document",
    };
  }
  const photos = Array.isArray(message?.photo) ? message.photo : [];
  if (photos.length > 0) {
    const photo = photos[photos.length - 1];
    return {
      fileId: photo.file_id,
      fileName: `photo-${message.message_id ?? Date.now()}.jpg`,
    };
  }
  return null;
}

export function getDealCaption(ctx: Context): string {
  const message = ctx.message as any;
  return typeof message?.caption === "string" ? message.caption : "";
}

export function isDealFileMessage(ctx: Context): boolean {
  const caption = getDealCaption(ctx);
  return caption.includes("딜 저장") && extractDealFilePayload(ctx) !== null;
}

export async function handleDealFile(ctx: Context, telegram: TelegramLikeBot): Promise<string> {
  const caption = getDealCaption(ctx);
  const payload = extractDealFilePayload(ctx);
  if (!payload) return "⚠️ 저장할 파일을 찾지 못했습니다.";

  const command = parseDealCommand(caption);
  if (command.action !== "save") return "⚠️ 파일 첨부 시 캡션은 \"딜 저장 [딜명] [분류]\" 형식으로 입력해주세요.";

  const resolved = await resolveDeal(command.dealName);
  if (typeof resolved === "string") return resolved;

  const buffer = await downloadTelegramFile(telegram, payload.fileId);
  const { meta } = await saveFile(resolved.name, command.category, payload.fileName, buffer);
  return formatSaved(meta, command.category, payload.fileName);
}

export const dealTextHandler = {
  execute: executeDealCommandText,
};
