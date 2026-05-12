import { executeWikiSave, executeWikiSearch } from "../wiki.ts";
import { writeWiki } from "../../wiki/wikiStore.ts";
import { llmAdapter } from "../../_core/llmAdapter.ts";
import type { HandlerMap, IntentHandler } from "../types.ts";

const CLASSIFY_PROMPT = `사용자가 보낸 텍스트를 분석해서 JSON으로만 응답하세요.

카테고리 목록: realestate, trading, crypto, stock, legal, company, family, mongolia, research, strategy, macro, ai, general

규칙:
- category: 가장 적합한 카테고리 1개 (영문)
- summary: 한국어로 핵심 내용 1~2문장 요약
- tags: 한국어 핵심 키워드 2~4개 배열

JSON만 반환, 다른 텍스트 금지:
{"category":"...","summary":"...","tags":["","",""]}`;

const wikiAutoClassify: IntentHandler = async (intent) => {
  const content = String(intent.params.content ?? "").trim();
  if (!content) {
    // Phase 6-D-4 — 빈 내용 분기. 짧은 안내 한 줄. kind="text" + text="".
    return {
      intent, handled: true, requiresConfirmation: false,
      response: "❌ 저장할 내용이 없습니다.",
      handlerResponse: {
        kind: "text",
        text: "",
        meta: { action: "wiki_auto_classify", hasContent: false },
      },
    };
  }

  try {
    const classified = await llmAdapter.parseJson<{ category: string; summary: string; tags: string[] }>(
      content,
      CLASSIFY_PROMPT
    );

    const category = classified.category || "general";
    const summary = classified.summary || content.slice(0, 80);
    const tags = Array.isArray(classified.tags) ? classified.tags : [];

    const body = `${summary}\n\n원문:\n${content}`;
    await writeWiki({ title: summary.slice(0, 50), body, categories: [category, ...tags], source: "telegram-auto" });

    const tagStr = tags.length > 0 ? ` #${tags.join(" #")}` : "";
    // Phase 6-D-4 — 정상 저장. response 다중 라인에 카테고리/태그/요약 통합.
    // kind="text" + text="" 로 본문 중복 방지. category 는 enum 형태(영문)이고
    // 사용자 입력 원문(content) 은 meta 에 넣지 않아 노출 위험 차단.
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `✅ Wiki 자동 저장 완료\n📂 #${category}${tagStr}\n💬 ${summary}`,
      handlerResponse: {
        kind: "text",
        text: "",
        meta: {
          action: "wiki_auto_classify",
          hasContent: true,
          category,
          tagsCount: tags.length,
          summaryLength: typeof summary === "string" ? summary.length : 0,
          contentLength: content.length,
          source: "telegram-auto",
        },
      },
    };
  } catch (e) {
    console.error("[wiki_auto_classify] error:", e);
    // Phase 7-A — 에러 분기를 kind="error" 로 정식 재분류. byte-for-byte 동일.
    return {
      intent, handled: true, requiresConfirmation: false,
      response: "❌ Wiki 자동 분류 저장에 실패했습니다.",
      handlerResponse: {
        kind: "error",
        text: "",
        meta: {
          action: "wiki_auto_classify",
          status: "error",
          errorType: e instanceof Error ? e.name : "unknown",
        },
      },
    };
  }
};

const wikiSave: IntentHandler = async (intent) => {
  const response = await executeWikiSave(intent.params, "telegram");
  // Phase 6-D-4 — 본문은 response 안에 통째 (executeWikiSave 가 string 반환).
  // kind="text" + text="" 마커. 사용자 입력 raw/title 등은 meta 에 넣지 않음.
  return {
    intent, handled: true, requiresConfirmation: false, response,
    handlerResponse: {
      kind: "text",
      text: "",
      meta: { action: "wiki_save", source: "telegram" },
    },
  };
};

const wikiSearch: IntentHandler = async (intent) => {
  const response = await executeWikiSearch(intent.params);
  // Phase 6-D-4 — 검색 결과는 response 안에 list 형식으로 통합되어 있음.
  // kind="list" 의미적 매핑 + text="" 로 본문 중복 방지. 검색 키워드 등 사용자
  // 입력은 meta 에 노출하지 않음 (action 마커만).
  return {
    intent, handled: true, requiresConfirmation: false, response,
    handlerResponse: {
      kind: "list",
      text: "",
      meta: { action: "wiki_search" },
    },
  };
};

export const wikiHandlers: HandlerMap = {
  wiki_auto_classify: wikiAutoClassify,
  wiki_save: wikiSave,
  wiki_search: wikiSearch,
};
