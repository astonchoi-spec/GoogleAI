import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { getTelegramBot } from "../telegram-service.ts";
import type { DealCategory, DealMeta } from "./dealTypes.ts";
import { DEAL_CATEGORIES, DEAL_CATEGORY_DIRS, DEAL_CATEGORY_LABELS } from "./dealTypes.ts";
import { findDealCandidates, findMatchingDeal, inferCategory } from "./dealMatcher.ts";
import { listDeals, saveFile } from "./dealStore.ts";

export type FileSource = "kakao" | "gmail" | "download";
export type FileMetadata = { sender?: string; subject?: string; sizeBytes?: number };
export type ReplyMarkup = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };

export type ClassifyFileOptions = {
  source: FileSource;
  filepath: string;
  originalName: string;
  metadata?: FileMetadata;
  notifyText?: (text: string) => Promise<void>;
  notifyPrompt?: (text: string, replyMarkup: ReplyMarkup) => Promise<void>;
  ttlMs?: number;
  now?: () => number;
};

export type PendingFile = {
  id: string;
  source: FileSource;
  filePath: string;
  fileName: string;
  metadata?: FileMetadata;
  candidates: DealMeta[];
  createdAt: number;
  timeout: ReturnType<typeof setTimeout> | null;
};

export type ClassifyFileResult =
  | { status: "ignored"; fileName: string; reason: string }
  | { status: "saved"; fileName: string; dealName: string; category: DealCategory; filePath: string }
  | { status: "pending"; fileName: string; tempId: string; candidates: DealMeta[] };

const PENDING_TTL_MS = 10 * 60 * 1000;
const pendingFiles = new Map<string, PendingFile>();

const SOURCE_LABELS: Record<FileSource, string> = {
  kakao: "📥 카톡",
  gmail: "📧 Gmail",
  download: "💾 다운로드",
};

const SOURCE_PREFIX: Record<FileSource, string> = {
  kakao: "kakao",
  gmail: "gmail",
  download: "dl",
};

const IGNORE_PATTERNS: Record<FileSource, RegExp[]> = {
  kakao: [/^KakaoTalk_\d+/i, /검진|의원|진료|병원/i, /\.(tmp|crdownload|part)$/i],
  gmail: [/광고|할인|쿠폰/i, /noreply|no-reply|automated/i],
  download: [/\.(tmp|crdownload|part)$/i, /^Screenshot[_-]/i, /^image[_-]/i, /\.(png|jpe?g|gif|webp)$/i, /installer|setup|update\.exe/i],
};

function callbackPrefix(source: FileSource): string {
  return SOURCE_PREFIX[source];
}

function categoryLabel(category: DealCategory): string {
  return `${DEAL_CATEGORY_LABELS[category]} (${DEAL_CATEGORY_DIRS[category]})`;
}

function sourceLabel(source: FileSource): string {
  return SOURCE_LABELS[source];
}

export function shouldIgnoreFile(source: FileSource, fileName: string, metadata: FileMetadata = {}): string | null {
  const target = `${fileName} ${metadata.sender ?? ""} ${metadata.subject ?? ""}`.trim();
  const matched = IGNORE_PATTERNS[source].find((pattern) => pattern.test(target));
  if (matched) return matched.source;
  if (source === "download" && metadata.sizeBytes !== undefined && metadata.sizeBytes < 1024 * 1024) return "small-file";
  return null;
}

export function buildCategoryButtons(source: FileSource, tempId: string, dealIndex: number): ReplyMarkup {
  const rows: ReplyMarkup["inline_keyboard"] = [];
  for (let index = 0; index < DEAL_CATEGORIES.length; index += 2) {
    rows.push(DEAL_CATEGORIES.slice(index, index + 2).map((category) => ({
      text: DEAL_CATEGORY_LABELS[category],
      callback_data: `${callbackPrefix(source)}:${tempId}:c:${dealIndex}:${category}`,
    })));
  }
  rows.push([{ text: "무시", callback_data: `${callbackPrefix(source)}:${tempId}:ignore` }]);
  return { inline_keyboard: rows };
}

function buildDealButtons(source: FileSource, tempId: string, candidates: DealMeta[]): ReplyMarkup {
  const rows: ReplyMarkup["inline_keyboard"] = [];
  for (let index = 0; index < candidates.length; index += 2) {
    rows.push(candidates.slice(index, index + 2).map((deal, offset) => ({
      text: deal.name,
      callback_data: `${callbackPrefix(source)}:${tempId}:d:${index + offset}`,
    })));
  }
  rows.push([
    { text: "기타", callback_data: `${callbackPrefix(source)}:${tempId}:other` },
    { text: "무시", callback_data: `${callbackPrefix(source)}:${tempId}:ignore` },
  ]);
  return { inline_keyboard: rows };
}

function buildAutoMessage(source: FileSource, dealName: string, category: DealCategory, fileName: string, filePath: string): string {
  const sourceText = source === "kakao" ? "카톡" : source === "gmail" ? "Gmail" : "다운로드";
  return [
    `✅ ${sourceText} 자료 자동 분류`,
    `출처: ${sourceLabel(source)}`,
    `📁 ${dealName} / ${categoryLabel(category)}`,
    `📄 ${fileName}`,
    `🔗 ${filePath}`,
  ].join("\n");
}

function buildPromptMessage(source: FileSource, fileName: string, metadata?: FileMetadata): string {
  return [
    `${sourceLabel(source)} 신규 파일`,
    `📄 ${fileName}`,
    metadata?.subject ? `✉️ ${metadata.subject}` : "",
    "📁 어느 딜로 분류할까요?",
  ].filter(Boolean).join("\n");
}

async function defaultNotifyText(text: string): Promise<void> {
  const bot = getTelegramBot();
  const chatId = Number(process.env.OWNER_TELEGRAM_CHAT_ID);
  if (!bot || !Number.isFinite(chatId) || chatId === 0) {
    console.warn("[file-classifier] Telegram bot or OWNER_TELEGRAM_CHAT_ID is not configured.");
    return;
  }
  await bot.telegram.sendMessage(chatId, text);
}

async function defaultNotifyPrompt(text: string, replyMarkup: ReplyMarkup): Promise<void> {
  const bot = getTelegramBot();
  const chatId = Number(process.env.OWNER_TELEGRAM_CHAT_ID);
  if (!bot || !Number.isFinite(chatId) || chatId === 0) {
    console.warn("[file-classifier] Telegram bot or OWNER_TELEGRAM_CHAT_ID is not configured.");
    return;
  }
  await bot.telegram.sendMessage(chatId, text, { reply_markup: replyMarkup });
}

function rememberPending(options: ClassifyFileOptions, candidates: DealMeta[]): PendingFile {
  const id = randomBytes(5).toString("base64url");
  const pending: PendingFile = {
    id,
    source: options.source,
    filePath: options.filepath,
    fileName: options.originalName,
    metadata: options.metadata,
    candidates,
    createdAt: options.now?.() ?? Date.now(),
    timeout: null,
  };
  pending.timeout = setTimeout(() => {
    pendingFiles.delete(id);
    console.warn(`[file-classifier] pending expired: ${options.originalName}`);
  }, options.ttlMs ?? PENDING_TTL_MS);
  pendingFiles.set(id, pending);
  return pending;
}

export function getPendingFile(id: string): PendingFile | null {
  return pendingFiles.get(id) ?? null;
}

export function clearPendingFile(id: string): boolean {
  const pending = pendingFiles.get(id);
  if (!pending) return false;
  if (pending.timeout) clearTimeout(pending.timeout);
  return pendingFiles.delete(id);
}

export async function savePendingFile(tempId: string, dealIndex: number, category: DealCategory): Promise<{ text: string; filePath: string }> {
  const pending = getPendingFile(tempId);
  if (!pending) throw new Error("분류 대기 파일을 찾지 못했습니다.");
  const deal = pending.candidates[dealIndex];
  if (!deal) throw new Error("선택한 딜을 찾지 못했습니다.");
  try {
    const buffer = await fs.readFile(pending.filePath);
    const saved = await saveFile(deal.name, category, pending.fileName, buffer);
    clearPendingFile(tempId);
    return { filePath: saved.filePath, text: buildAutoMessage(pending.source, deal.name, category, pending.fileName, saved.filePath).replace("자동 분류", "분류 완료") };
  } catch (err) {
    console.error("[file-classifier] savePendingFile:", err);
    throw new Error("자료를 저장하지 못했습니다.");
  }
}

export async function classifyAndSaveFile(options: ClassifyFileOptions): Promise<ClassifyFileResult> {
  const fileName = options.originalName || path.basename(options.filepath);
  const metadata = options.metadata ?? {};
  const ignoreReason = shouldIgnoreFile(options.source, fileName, metadata);
  if (ignoreReason) return { status: "ignored", fileName, reason: ignoreReason };
  try {
    const extraText = [metadata.subject, metadata.sender].filter((value): value is string => !!value);
    const match = await findMatchingDeal({ filename: fileName, extraText });
    if (match.confidence === "exact" && match.deal) {
      const category = inferCategory(`${fileName} ${metadata.subject ?? ""}`);
      const buffer = await fs.readFile(options.filepath);
      const saved = await saveFile(match.deal.name, category, fileName, buffer);
      await (options.notifyText ?? defaultNotifyText)(buildAutoMessage(options.source, match.deal.name, category, fileName, saved.filePath));
      return { status: "saved", fileName, dealName: match.deal.name, category, filePath: saved.filePath };
    }
    const candidates = await findDealCandidates({ filename: fileName, extraText }, 8);
    if (candidates.length === 0) candidates.push(...(await listDeals()).all.slice(0, 8));
    const pending = rememberPending({ ...options, originalName: fileName }, candidates);
    await (options.notifyPrompt ?? defaultNotifyPrompt)(buildPromptMessage(options.source, fileName, metadata), buildDealButtons(options.source, pending.id, candidates));
    return { status: "pending", fileName, tempId: pending.id, candidates };
  } catch (err) {
    console.error("[file-classifier] classifyAndSaveFile:", err);
    throw new Error("자료 분류 중 오류가 발생했습니다.");
  }
}
