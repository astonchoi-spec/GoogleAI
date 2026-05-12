// 단계 3 — 분류 (Gemini).
// explicit_project이 있으면 LLM 호출 생략 (CURRENT_TASK §8.5 합의).

import type { CleanedDocument, ClassifiedDocument, Category } from "../types.ts";

const VALID_CATEGORIES: Category[] = [
  "real-estate",
  "trading",
  "system",
  "legal",
  "finance",
  "personal",
  "research",
  "meeting",
  "other",
];

const PROMPT = `사용자가 보낸 한국어 메모를 분석해서 JSON으로만 응답하세요.
다른 텍스트나 마크다운 금지.

카테고리 목록 (정확히 이 중 하나):
real-estate, trading, system, legal, finance, personal, research, meeting, other

규칙:
- category: 가장 적합한 카테고리 1개
- suggested_projects: 본문에서 식별 가능한 프로젝트 키 (영문 케밥 케이스, 0~3개). 추측 금지. 본문에 없으면 빈 배열.
- confidence: 0.0~1.0

JSON 형식:
{"category":"...","suggested_projects":[],"confidence":0.0}`;

export type ClassifierResult = {
  category: Category;
  suggested_projects: string[];
  classification_confidence: number;
};

export interface LLMJsonClient {
  parseJson<T = unknown>(userMessage: string, systemPrompt: string): Promise<T>;
}

export class Classifier {
  private readonly llm: LLMJsonClient;

  constructor(llm: LLMJsonClient) {
    this.llm = llm;
  }

  async classify(doc: CleanedDocument): Promise<ClassifiedDocument> {
    const explicitProject = doc.command_hints?.explicit_project;
    if (explicitProject) {
      // 회장님 명시 — LLM 호출 생략
      return {
        ...doc,
        category: "other",
        suggested_projects: [explicitProject],
        classification_confidence: 1.0,
      };
    }

    try {
      const result = await this.llm.parseJson<{
        category?: string;
        suggested_projects?: unknown;
        confidence?: number;
      }>(doc.cleaned_text, PROMPT);

      const category = (VALID_CATEGORIES as string[]).includes(result.category ?? "")
        ? (result.category as Category)
        : "other";
      const projects = Array.isArray(result.suggested_projects)
        ? result.suggested_projects.filter((p): p is string => typeof p === "string" && /^[a-z0-9-]+$/.test(p)).slice(0, 3)
        : [];
      const confidence = typeof result.confidence === "number" && result.confidence >= 0 && result.confidence <= 1
        ? result.confidence
        : 0.5;

      return {
        ...doc,
        category,
        suggested_projects: projects,
        classification_confidence: confidence,
      };
    } catch (err) {
      console.error("[classifier] LLM failed, falling back:", err instanceof Error ? err.message : err);
      throw err; // runner가 catch해서 partial 처리
    }
  }
}
