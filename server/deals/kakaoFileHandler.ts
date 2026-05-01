import path from "node:path";
import type { DealCategory } from "./dealTypes.ts";
import {
  buildCategoryButtons as buildFileCategoryButtons,
  classifyAndSaveFile,
  clearPendingFile,
  getPendingFile,
  savePendingFile,
  shouldIgnoreFile,
  type ClassifyFileResult,
  type PendingFile,
  type ReplyMarkup,
} from "./fileClassifier.ts";

export const KAKAO_PENDING_TTL_MS = 10 * 60 * 1000;
export const KAKAO_IGNORE_PATTERNS: RegExp[] = [
  /^KakaoTalk_\d+/i,
  /검진|의원|진료|병원/i,
  /\.(tmp|crdownload|part)$/i,
];

export type KakaoPendingFile = PendingFile;
export type KakaoHandleResult = ClassifyFileResult;
export type KakaoHandlerOptions = {
  notifyText?: (text: string) => Promise<void>;
  notifyPrompt?: (text: string, replyMarkup: ReplyMarkup) => Promise<void>;
  ttlMs?: number;
  now?: () => number;
};

export function isIgnoredKakaoFile(fileName: string): boolean {
  return shouldIgnoreFile("kakao", fileName) !== null;
}

export function buildCategoryButtons(tempId: string, dealIndex: number): ReplyMarkup {
  return buildFileCategoryButtons("kakao", tempId, dealIndex);
}

export function getPendingKakaoFile(id: string): KakaoPendingFile | null {
  return getPendingFile(id);
}

export function clearPendingKakaoFile(id: string): boolean {
  return clearPendingFile(id);
}

export async function savePendingKakaoFile(tempId: string, dealIndex: number, category: DealCategory): Promise<{ text: string; filePath: string }> {
  return savePendingFile(tempId, dealIndex, category);
}

export async function handleNewFile(filePath: string, options: KakaoHandlerOptions = {}): Promise<KakaoHandleResult> {
  return classifyAndSaveFile({
    source: "kakao",
    filepath: filePath,
    originalName: path.basename(filePath),
    ...options,
  });
}
