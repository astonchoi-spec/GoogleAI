// Step 2 (2026-05-12) — research_run 인텐트 핸들러 + fallbackIntent 매처 회귀 가드.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { researchHandlers } from "../intent/handlers/researchRun.ts";
import { fallbackIntent } from "../intent/fallbackIntent.ts";

const handler = researchHandlers.research_run!;

function makeIntent(params: Record<string, unknown> = {}) {
  return {
    domain: "intelligence" as const,
    action: "research_run" as const,
    type: "execute" as const,
    confidence: 0.95,
    params,
  };
}

const HANDLER_OPTIONS = {
  userId: "1",
  source: "telegram" as const,
};

describe("fallbackIntent — 리서치 키워드 매칭", () => {
  it("`/리서치 몽골 광산` 형태 매칭", () => {
    const r = fallbackIntent("/리서치 몽골 광산 채굴권");
    expect(r?.action).toBe("research_run");
    expect(r?.params.topic).toBe("몽골 광산 채굴권");
  });

  it("`리서치 시작 <주제>` 형태 매칭", () => {
    const r = fallbackIntent("리서치 시작 트럼프 에너지 정책");
    expect(r?.action).toBe("research_run");
    expect(r?.params.topic).toBe("트럼프 에너지 정책");
  });

  it("`리서치 <주제>` 단순 형태 매칭", () => {
    const r = fallbackIntent("리서치 2026 Q3 매크로 전망");
    expect(r?.action).toBe("research_run");
    expect(r?.params.topic).toBe("2026 Q3 매크로 전망");
  });

  it("주제 없는 `리서치` 단독은 매칭하지 않음", () => {
    const r = fallbackIntent("리서치");
    expect(r?.action).not.toBe("research_run");
  });

  it("`리서치` 가 단어 중간에 포함된 경우 매칭하지 않음", () => {
    // "리서치센터 일정" — 리서치 뒤에 공백 + 키워드가 와야 하는데 '센터'는 OK?
    // 정규식 `^\s*\/?리서치(?:\s+시작)?\s+(.+)$` — '리서치센터' 는 \s+ 매칭 실패.
    const r = fallbackIntent("리서치센터 일정");
    expect(r?.action).not.toBe("research_run");
  });
});

describe("research_run 핸들러 — 자동 실행 비활성", () => {
  let prevEnabled: string | undefined;
  let prevRoot: string | undefined;

  beforeEach(() => {
    prevEnabled = process.env.NLM_RESEARCH_ENABLED;
    prevRoot = process.env.NLM_RESEARCH_ROOT;
    delete process.env.NLM_RESEARCH_ENABLED;
    delete process.env.NLM_RESEARCH_ROOT;
  });

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.NLM_RESEARCH_ENABLED;
    else process.env.NLM_RESEARCH_ENABLED = prevEnabled;
    if (prevRoot === undefined) delete process.env.NLM_RESEARCH_ROOT;
    else process.env.NLM_RESEARCH_ROOT = prevRoot;
  });

  it("env 미설정 시 수동 안내 메시지 출력", async () => {
    const result = await handler(makeIntent({ topic: "몽골 광산" }), HANDLER_OPTIONS);
    expect(result.handled).toBe(true);
    expect(result.response).toContain("리서치 자동 실행 비활성");
    expect(result.response).toContain("몽골 광산");
    expect(result.response).toContain("워크스테이션");
    expect(result.handlerResponse?.meta?.status).toBe("manual_mode");
  });

  it("NLM_RESEARCH_ENABLED=true 인데 ROOT 미설정도 수동 모드", async () => {
    process.env.NLM_RESEARCH_ENABLED = "true";
    const result = await handler(makeIntent({ topic: "테스트" }), HANDLER_OPTIONS);
    expect(result.handlerResponse?.meta?.status).toBe("manual_mode");
  });

  it("주제 누락 시 에러 메시지", async () => {
    const result = await handler(makeIntent({ topic: "" }), HANDLER_OPTIONS);
    expect(result.response).toContain("주제를 입력해 주세요");
    expect(result.handlerResponse?.meta?.status).toBe("missing_topic");
  });

  it("주제 200자 초과 시 에러 메시지", async () => {
    const longTopic = "가".repeat(201);
    const result = await handler(makeIntent({ topic: longTopic }), HANDLER_OPTIONS);
    expect(result.response).toContain("주제가 너무 깁니다");
    expect(result.handlerResponse?.meta?.status).toBe("topic_too_long");
  });
});

describe("research_run 핸들러 — ROOT 존재 검증", () => {
  let prevEnabled: string | undefined;
  let prevRoot: string | undefined;

  beforeEach(() => {
    prevEnabled = process.env.NLM_RESEARCH_ENABLED;
    prevRoot = process.env.NLM_RESEARCH_ROOT;
    process.env.NLM_RESEARCH_ENABLED = "true";
  });

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.NLM_RESEARCH_ENABLED;
    else process.env.NLM_RESEARCH_ENABLED = prevEnabled;
    if (prevRoot === undefined) delete process.env.NLM_RESEARCH_ROOT;
    else process.env.NLM_RESEARCH_ROOT = prevRoot;
  });

  it("ROOT 디렉토리가 없으면 root_not_found 에러", async () => {
    process.env.NLM_RESEARCH_ROOT = "Z:\\nonexistent-nlm-research-test";
    const result = await handler(makeIntent({ topic: "테스트" }), HANDLER_OPTIONS);
    expect(result.handlerResponse?.meta?.status).toBe("root_not_found");
    expect(result.response).toContain("디렉토리가 없습니다");
  });
});
