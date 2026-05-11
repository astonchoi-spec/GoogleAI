import { llmAdapter } from "../../_core/llmAdapter.ts";
import { fallbackIntent } from "../fallbackIntent.ts";
import {
  FALLBACK_CLASSIFIER_PROMPT,
  loadIntentPromptSafe,
  renderPrompt,
} from "../promptLoader.ts";
import type { ParsedIntent } from "../intentSchemas.ts";
import type { IntentResult } from "../types.ts";

function intentLogName(intent: ParsedIntent): string {
  return `${intent.domain}.${intent.action}`;
}

function logIntentMatched(intent: ParsedIntent, message: string): void {
  console.log(
    `[intent] matched: ${intentLogName(intent)} for input: ${message}`,
  );
}

/**
 * Normalize a `chat`-domain intent so downstream code never sees stray
 * params/confidence values. Mirrors the previous `normalizeIntent` helper
 * that lived in intentService.ts.
 */
export function normalizeIntent(intent: ParsedIntent): ParsedIntent {
  if (intent.domain === "chat" || intent.action === "chat") {
    return {
      domain: "chat",
      action: "chat",
      type: "query",
      confidence: Math.min(intent.confidence || 0.3, 0.3),
      params: {},
    };
  }
  // 가짜 데이터 가드 — realestate_feasibility/portfolio_summary 가 명시적 PF 시뮬 파라미터
  // (landCost/constructionCost 등 숫자) 없이 분류된 경우, 가짜 하드코딩 응답이 회장님께 가는 것을
  // 차단하기 위해 confidence 를 0.5 로 강제 다운그레이드. Phase 4-C 가드(0.7)가 잡아 RAG fallback.
  // 회장님 자연어 질의(예: "한남동644 NPV 수익률은?") 에 LLM이 0.9 confidence 로 잘못 매칭하던 회귀 차단.
  if (
    (intent.action === "realestate_feasibility" || intent.action === "realestate_portfolio_summary") &&
    intent.confidence > 0.5
  ) {
    const params = (intent.params ?? {}) as Record<string, unknown>;
    const hasRealNumbers =
      typeof params.landCost === "number" && params.landCost > 0 &&
      typeof params.constructionCost === "number" && params.constructionCost > 0;
    if (!hasRealNumbers) {
      console.warn(
        "[INTENT] downgrading",
        intent.action,
        "from",
        intent.confidence,
        "→ 0.5 (no real PF params, natural-language query). Falling through to RAG.",
      );
      return { ...intent, confidence: 0.5 };
    }
  }
  return intent;
}

function buildClassifierPrompt(now: string): string {
  const template =
    loadIntentPromptSafe("classifier.md") ?? FALLBACK_CLASSIFIER_PROMPT;
  return renderPrompt(template, { NOW: now });
}

/**
 * Phase 2: Classification stage of the intent pipeline.
 *
 * Identical behavior to the legacy `classifyIntent` (which is now a thin
 * re-export in intentService.ts). Pipeline:
 *   1. Keyword-based fast path via `fallbackIntent()`. If confidence ≥ 0.5
 *      we trust the keyword match and skip the LLM call.
 *   2. Otherwise, call Gemini with the externalised classifier prompt and
 *      parse the JSON response.
 *   3. Any LLM/JSON failure falls back to the keyword result.
 */
export async function parseIntent(message: string): Promise<ParsedIntent> {
  console.log("[INTENT] parseIntent called:", message.slice(0, 80));

  // Step 1 — keyword pre-classification (fast and accurate for known patterns).
  const keywordResult = fallbackIntent(message);
  console.log(
    "[INTENT] fallback result:",
    keywordResult.action,
    "confidence:",
    keywordResult.confidence,
  );
  if (keywordResult.confidence >= 0.5) {
    console.log(
      "[INTENT] keyword match:",
      keywordResult.action,
      "confidence:",
      keywordResult.confidence,
    );
    logIntentMatched(keywordResult, message);
    return keywordResult;
  }

  // Step 2 — keyword miss: defer to the LLM with the externalised prompt.
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const prompt = buildClassifierPrompt(now);

  try {
    const parsed = await llmAdapter.parseJson<Partial<IntentResult>>(
      message,
      prompt,
    );
    if (!parsed.domain || !parsed.action || !parsed.type) {
      console.log(
        "[INTENT] LLM returned invalid JSON, using fallbackIntent",
      );
      const fallback = fallbackIntent(message);
      logIntentMatched(fallback, message);
      return fallback;
    }
    const result = normalizeIntent({
      domain: parsed.domain,
      action: parsed.action,
      type: parsed.type,
      confidence: Number.isFinite(parsed.confidence)
        ? Number(parsed.confidence)
        : 0,
      params:
        parsed.params && typeof parsed.params === "object"
          ? parsed.params
          : {},
    } as ParsedIntent);
    console.log(
      "[INTENT] LLM classified:",
      result.action,
      "confidence:",
      result.confidence,
      "params:",
      JSON.stringify(result.params).slice(0, 100),
    );
    logIntentMatched(result, message);
    return result;
  } catch (err) {
    console.log(
      "[INTENT] LLM classify error, using fallbackIntent:",
      (err as Error).message,
    );
    const fallback = fallbackIntent(message);
    logIntentMatched(fallback, message);
    return fallback;
  }
}
