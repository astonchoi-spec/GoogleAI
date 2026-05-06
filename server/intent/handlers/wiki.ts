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
    return { intent, handled: true, requiresConfirmation: false, response: "❌ 저장할 내용이 없습니다." };
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
    await writeWiki({ body, categories: [category, ...tags], source: "telegram-auto" });

    const tagStr = tags.length > 0 ? ` #${tags.join(" #")}` : "";
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `✅ Wiki 자동 저장 완료\n📂 #${category}${tagStr}\n💬 ${summary}`,
    };
  } catch (e) {
    console.error("[wiki_auto_classify] error:", e);
    return { intent, handled: true, requiresConfirmation: false, response: "❌ Wiki 자동 분류 저장에 실패했습니다." };
  }
};

const wikiSave: IntentHandler = async (intent) => {
  const response = await executeWikiSave(intent.params, "telegram");
  return { intent, handled: true, requiresConfirmation: false, response };
};

const wikiSearch: IntentHandler = async (intent) => {
  const response = await executeWikiSearch(intent.params);
  return { intent, handled: true, requiresConfirmation: false, response };
};

export const wikiHandlers: HandlerMap = {
  wiki_auto_classify: wikiAutoClassify,
  wiki_save: wikiSave,
  wiki_search: wikiSearch,
};
