import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { getTelegramBot } from "../telegram-service.ts";
import type { DealCategory, DealMeta } from "./dealTypes.ts";
import { DEAL_CATEGORIES, DEAL_CATEGORY_DIRS, DEAL_CATEGORY_LABELS } from "./dealTypes.ts";
import { findDealCandidates, findMatchingDeal, inferCategory } from "./dealMatcher.ts";
import { listDeals, saveFile } from "./dealStore.ts";

export const KAKAO_PENDING_TTL_MS = 10 * 60 * 1000;

export const KAKAO_IGNORE_PATTERNS: RegExp[] = [
  /^KakaoTalk_\d+/i,
  /검진|의원|진료|병원/i,
  /\.(tmp|crdownload|part)$/i,
];

export type KakaoPendingFile = {
  id: string;
  filePath: string;
  fileName: string;
  candidates: DealMeta[];
  createdAt: number;
  timeout: ReturnType<typeof setTimeout> | null;
};

export type KakaoHandleResult =
  | { status: "ignored"; fileName: string }
  | { status: "saved"; fileName: string; dealName: string; category: DealCategory; filePath: string }
  | { status: "pending"; fileName: string; tempId: string; candidates: DealMeta[] };

export type KakaoHandlerOptions = {
  notifyText?: (text: string) => Promise<void>;
  notifyPrompt?: (text: string, replyMarkup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> }) => Promise<void>;
  ttlMs?: number;
  now?: () => number;
};

const pendingFiles = new Map<string, KakaoPendingFile>();

export function isIgnoredKakaoFile(fileName: string): boolean {
  return KAKAO_IGNORE_PATTERNS.some((pattern) => pattern.test(fileName));
}

function createTempId(): string {
  return randomBytes(5).toString("base64url");
}

function categoryLabel(category: DealCategory): string {
  return `${DEAL_CATEGORY_LABELS[category]} (${DEAL_CATEGORY_DIRS[category]})`;
}

function buildAutoSavedMessage(input: { dealName: string; category: DealCategory; fileName: string; filePath: string }): string {
  return [
    "✅ 카톡 자료 자동 분류",
    `📁 ${input.dealName} / ${categoryLabel(input.category)}`,
    `📄 ${input.fileName}`,
    `🔗 ${input.filePath}`,
  ].join("\n");
}

function buildPromptMessage(fileName: string): string {
  return [
    "📥 카톡 신규 파일",
    `📄 ${fileName}`,
    "📁 어느 딜로 분류할까요?",
  ].join("\n");
}

function buildDealButtons(tempId: string, candidates: DealMeta[]): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let index = 0; index < candidates.length; index += 2) {
    rows.push(candidates.slice(index, index + 2).map((deal, offset) => ({
      text: deal.name,
      callback_data: `kakao:${tempId}:d:${index + offset}`,
    })));
  }
  rows.push([
    { text: "기타", callback_data: `kakao:${tempId}:other` },
    { text: "무시", callback_data: `kakao:${tempId}:ignore` },
  ]);
  return { inline_keyboard: rows };
}

export function buildCategoryButtons(tempId: string, dealIndex: number): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let index = 0; index < DEAL_CATEGORIES.length; index += 2) {
    rows.push(DEAL_CATEGORIES.slice(index, index + 2).map((category) => ({
      text: DEAL_CATEGORY_LABELS[category],
      callback_data: `kakao:${tempId}:c:${dealIndex}:${category}`,
    })));
  }
  rows.push([{ text: "무시", callback_data: `kakao:${tempId}:ignore` }]);
  return { inline_keyboard: rows };
}

async function defaultNotifyText(text: string): Promise<void> {
  const bot = getTelegramBot();
  const chatId = Number(process.env.OWNER_TELEGRAM_CHAT_ID);
  if (!bot || !Number.isFinite(chatId) || chatId === 0) {
    console.warn("[kakao-file] Telegram bot or OWNER_TELEGRAM_CHAT_ID is not configured.");
    return;
  }
  await bot.telegram.sendMessage(chatId, text);
}

async function defaultNotifyPrompt(
  text: string,
  replyMarkup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> }
): Promise<void> {
  const bot = getTelegramBot();
  const chatId = Number(process.env.OWNER_TELEGRAM_CHAT_ID);
  if (!bot || !Number.isFinite(chatId) || chatId === 0) {
    console.warn("[kakao-file] Telegram bot or OWNER_TELEGRAM_CHAT_ID is not configured.");
    return;
  }
  await bot.telegram.sendMessage(chatId, text, { reply_markup: replyMarkup });
}

function rememberPending(filePath: string, fileName: string, candidates: DealMeta[], options: KakaoHandlerOptions): KakaoPendingFile {
  const id = createTempId();
  const ttlMs = options.ttlMs ?? KAKAO_PENDING_TTL_MS;
  const pending: KakaoPendingFile = {
    id,
    filePath,
    fileName,
    candidates,
    createdAt: options.now?.() ?? Date.now(),
    timeout: null,
  };
  pending.timeout = setTimeout(() => {
    pendingFiles.delete(id);
    console.warn(`[kakao-file] pending expired: ${fileName}`);
  }, ttlMs);
  pendingFiles.set(id, pending);
  return pending;
}

export function getPendingKakaoFile(id: string): KakaoPendingFile | null {
  return pendingFiles.get(id) ?? null;
}

export function clearPendingKakaoFile(id: string): boolean {
  const pending = pendingFiles.get(id);
  if (!pending) return false;
  if (pending.timeout) clearTimeout(pending.timeout);
  return pendingFiles.delete(id);
}

export async function savePendingKakaoFile(tempId: string, dealIndex: number, category: DealCategory): Promise<{ text: string; filePath: string }> {
  const pending = getPendingKakaoFile(tempId);
  if (!pending) throw new Error("분류 대기 파일을 찾지 못했습니다.");
  const deal = pending.candidates[dealIndex];
  if (!deal) throw new Error("선택한 딜을 찾지 못했습니다.");

  try {
    const buffer = await fs.readFile(pending.filePath);
    const saved = await saveFile(deal.name, category, pending.fileName, buffer);
    clearPendingKakaoFile(tempId);
    return {
      filePath: saved.filePath,
      text: [
        "✅ 카톡 자료 분류 완료",
        `📁 ${deal.name} / ${categoryLabel(category)}`,
        `📄 ${pending.fileName}`,
        `🔗 ${saved.filePath}`,
      ].join("\n"),
    };
  } catch (err) {
    console.error("[kakao-file] savePendingKakaoFile:", err);
    throw new Error("카톡 자료를 저장하지 못했습니다.");
  }
}

export async function handleNewFile(filePath: string, options: KakaoHandlerOptions = {}): Promise<KakaoHandleResult> {
  const fileName = path.basename(filePath);
  if (isIgnoredKakaoFile(fileName)) {
    console.log(`[kakao-file] ignored: ${fileName}`);
    return { status: "ignored", fileName };
  }

  try {
    const match = await findMatchingDeal(fileName);
    if (match.confidence === "exact" && match.deal) {
      const category = inferCategory(fileName);
      const buffer = await fs.readFile(filePath);
      const saved = await saveFile(match.deal.name, category, fileName, buffer);
      const text = buildAutoSavedMessage({
        dealName: match.deal.name,
        category,
        fileName,
        filePath: saved.filePath,
      });
      await (options.notifyText ?? defaultNotifyText)(text);
      return { status: "saved", fileName, dealName: match.deal.name, category, filePath: saved.filePath };
    }

    const candidates = (await findDealCandidates(fileName, 8));
    if (candidates.length === 0) {
      const { all } = await listDeals();
      candidates.push(...all.slice(0, 8));
    }
    const pending = rememberPending(filePath, fileName, candidates, options);
    await (options.notifyPrompt ?? defaultNotifyPrompt)(buildPromptMessage(fileName), buildDealButtons(pending.id, candidates));
    return { status: "pending", fileName, tempId: pending.id, candidates };
  } catch (err) {
    console.error("[kakao-file] handleNewFile:", err);
    throw new Error("카톡 신규 파일 처리 중 오류가 발생했습니다.");
  }
}
