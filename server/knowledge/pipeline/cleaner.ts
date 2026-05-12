// 단계 2 — 정제. LLM 미사용. 원본 보존, 노이즈만 제거.

import type { CleanedDocument, PipelineInput } from "../types.ts";

export function cleanText(rawText: string): { cleaned: string; notes: string[] } {
  const notes: string[] = [];
  let cleaned = rawText;

  // zero-width space, BOM 등 invisible 문자 제거
  const beforeInvisible = cleaned;
  cleaned = cleaned.replace(/[​-‍﻿]/g, "");
  if (cleaned.length !== beforeInvisible.length) notes.push("removed-invisible-chars");

  // 스마트 쿼트 정규화
  const beforeQuotes = cleaned;
  cleaned = cleaned.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  if (cleaned !== beforeQuotes) notes.push("normalized-smart-quotes");

  // 연속 공백 (탭 포함) 단일 스페이스로
  const beforeSpaces = cleaned;
  cleaned = cleaned.replace(/[ \t]+/g, " ");
  if (cleaned !== beforeSpaces) notes.push("normalized-whitespace");

  // 3개 이상 연속 줄바꿈을 2개로
  const beforeNewlines = cleaned;
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  if (cleaned !== beforeNewlines) notes.push("normalized-newlines");

  // 앞뒤 trim
  cleaned = cleaned.trim();

  return { cleaned, notes };
}

export class Cleaner {
  async clean(input: PipelineInput): Promise<CleanedDocument> {
    const { cleaned, notes } = cleanText(input.raw_text);
    return {
      ...input,
      cleaned_text: cleaned,
      cleaning_notes: notes.length > 0 ? notes : undefined,
    };
  }
}

export const cleaner = new Cleaner();
