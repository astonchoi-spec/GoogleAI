// 단계 5 — 태깅·엔티티 추출 (Gemini).
// command_hints의 명시값이 있으면 LLM 추정값 무시 (CURRENT_TASK §8 합의).

import type { SummarizedDocument, TaggedDocument, Importance, PrivacyLevel } from "../types.ts";
import type { LLMJsonClient } from "./classifier.ts";

const PROMPT = `다음 한국어 메모를 분석해 JSON으로만 응답하세요.

규칙:
- tags: 자유 태그 (한국어 가능, 0~5개)
- people: 본문에 명시된 인물 이름 (확실한 것만)
- companies: 본문에 명시된 회사·기관 (확실한 것만)
- importance: low | normal | high (기본 normal)
- permanent_knowledge: true/false (메모인지 영구 지식인지)
- privacy_level: public | private | sensitive (기본 private)

JSON:
{"tags":[],"people":[],"companies":[],"importance":"normal","permanent_knowledge":false,"privacy_level":"private"}`;

const VALID_IMPORTANCE: Importance[] = ["low", "normal", "high"];
const VALID_PRIVACY: PrivacyLevel[] = ["public", "private", "sensitive"];

export class Tagger {
  private readonly llm: LLMJsonClient;

  constructor(llm: LLMJsonClient) {
    this.llm = llm;
  }

  async tag(doc: SummarizedDocument): Promise<TaggedDocument> {
    type LlmResult = {
      tags?: unknown;
      people?: unknown;
      companies?: unknown;
      importance?: string;
      permanent_knowledge?: boolean;
      privacy_level?: string;
    };

    let llmResult: LlmResult;
    try {
      llmResult = await this.llm.parseJson<LlmResult>(doc.cleaned_text, PROMPT);
    } catch (err) {
      console.error("[tagger] LLM failed:", err instanceof Error ? err.message : err);
      throw err;
    }

    const cmd = doc.command_hints ?? {};
    const tags = stringArray(llmResult.tags).slice(0, 5);
    const people = stringArray(llmResult.people).slice(0, 10);
    const companies = stringArray(llmResult.companies).slice(0, 10);

    // command_hints 우선
    const importance: Importance = cmd.importance ?? validImportance(llmResult.importance);
    const permanent_knowledge: boolean =
      typeof cmd.permanent_knowledge === "boolean"
        ? cmd.permanent_knowledge
        : llmResult.permanent_knowledge === true;
    const privacy_level: PrivacyLevel = validPrivacy(llmResult.privacy_level);

    return {
      ...doc,
      tags,
      people,
      companies,
      importance,
      permanent_knowledge,
      privacy_level,
      step_failures: [],
      quality: "complete",
    };
  }
}

function stringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

function validImportance(value: unknown): Importance {
  return typeof value === "string" && (VALID_IMPORTANCE as string[]).includes(value)
    ? (value as Importance)
    : "normal";
}

function validPrivacy(value: unknown): PrivacyLevel {
  return typeof value === "string" && (VALID_PRIVACY as string[]).includes(value)
    ? (value as PrivacyLevel)
    : "private";
}
