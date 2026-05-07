// 단계 4 — 요약 (Gemini).
// 짧은 메시지(<100자)는 LLM 호출 생략, raw_text를 그대로 사용.

import type { ClassifiedDocument, SummarizedDocument, ActionItemDraft } from "../types.ts";
import type { LLMJsonClient } from "./classifier.ts";

const PROMPT = `다음 한국어 메모를 분석해 JSON으로만 응답하세요.
다른 텍스트 금지.

규칙:
- title: 한 줄 요지 (50자 이내)
- summary: 1~3문장 한국어 요약
- key_points: 핵심 불릿 0~5개
- action_items: 메모에 액션이 있을 경우만 (text, due_date, assignee)
  - due_date는 "YYYY-MM-DD" 형식. 추정 금지.
  - 액션 없으면 빈 배열.

JSON:
{"title":"...","summary":"...","key_points":[],"action_items":[]}`;

const SHORT_THRESHOLD = 100;

export class Summarizer {
  constructor(private readonly llm: LLMJsonClient) {}

  async summarize(doc: ClassifiedDocument): Promise<SummarizedDocument> {
    if (doc.cleaned_text.length < SHORT_THRESHOLD) {
      return {
        ...doc,
        title: doc.cleaned_text.slice(0, 50),
        summary: doc.cleaned_text,
        key_points: [],
        action_item_candidates: [],
      };
    }

    try {
      const result = await this.llm.parseJson<{
        title?: string;
        summary?: string;
        key_points?: unknown;
        action_items?: unknown;
      }>(doc.cleaned_text, PROMPT);

      return {
        ...doc,
        title: typeof result.title === "string" ? result.title.slice(0, 80) : doc.cleaned_text.slice(0, 50),
        summary: typeof result.summary === "string" ? result.summary : doc.cleaned_text,
        key_points: Array.isArray(result.key_points)
          ? result.key_points.filter((k): k is string => typeof k === "string").slice(0, 7)
          : [],
        action_item_candidates: parseActionItems(result.action_items),
      };
    } catch (err) {
      console.error("[summarizer] LLM failed:", err instanceof Error ? err.message : err);
      throw err;
    }
  }
}

function parseActionItems(input: unknown): ActionItemDraft[] {
  if (!Array.isArray(input)) return [];
  const result: ActionItemDraft[] = [];
  for (const item of input.slice(0, 10)) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const text = typeof obj.text === "string" ? obj.text.trim() : "";
    if (!text) continue;
    const draft: ActionItemDraft = { text };
    if (typeof obj.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.due_date)) {
      draft.due_date = obj.due_date;
    }
    if (typeof obj.assignee === "string" && obj.assignee.trim()) {
      draft.assignee = obj.assignee.trim();
    }
    result.push(draft);
  }
  return result;
}
