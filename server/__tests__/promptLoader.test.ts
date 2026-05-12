import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FALLBACK_CLASSIFIER_PROMPT,
  loadIntentPrompt,
  loadIntentPromptSafe,
  renderPrompt,
  _resetPromptCache,
} from "../intent/promptLoader.ts";

describe("promptLoader — Phase 8-A 단위 테스트", () => {
  beforeEach(() => {
    _resetPromptCache();
  });

  afterEach(() => {
    _resetPromptCache();
    vi.restoreAllMocks();
  });

  it("dev 환경에서 classifier.md 파일을 디스크에서 로드한다", () => {
    const content = loadIntentPrompt("classifier.md");
    expect(content).toContain("사용자 메시지를 분석해서 JSON으로 응답하세요");
    expect(content).toContain("{{NOW}}");
  });

  it("dev 환경에서 planner.md 파일을 디스크에서 로드한다", () => {
    const content = loadIntentPrompt("planner.md");
    expect(content).toContain("Planner Prompt");
    expect(content).toContain("pass-through");
  });

  it("등록되지 않은 prompt 요청은 throw한다", () => {
    expect(() => loadIntentPrompt("does-not-exist.md")).toThrow(
      /prompt not found/,
    );
  });

  it("loadIntentPromptSafe는 실패 시 null을 반환한다", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = loadIntentPromptSafe("does-not-exist.md");
    expect(result).toBeNull();
    warnSpy.mockRestore();
  });

  it("FALLBACK_CLASSIFIER_PROMPT는 그대로 export된다 (안전망 유지)", () => {
    expect(FALLBACK_CLASSIFIER_PROMPT).toContain(
      "사용자 메시지를 분석해서 JSON으로 응답하세요",
    );
    expect(FALLBACK_CLASSIFIER_PROMPT).toContain("{{NOW}}");
  });

  it("두 번째 호출은 캐시에서 반환한다", () => {
    const first = loadIntentPrompt("classifier.md");
    const second = loadIntentPrompt("classifier.md");
    expect(second).toBe(first);
  });

  it("renderPrompt는 {{KEY}} 자리표시자를 치환한다", () => {
    const out = renderPrompt("hello {{NAME}}", { NAME: "world" });
    expect(out).toBe("hello world");
  });

  it("renderPrompt는 알 수 없는 자리표시자를 그대로 둔다", () => {
    const out = renderPrompt("a {{KNOWN}} b {{UNKNOWN}}", { KNOWN: "x" });
    expect(out).toBe("a x b {{UNKNOWN}}");
  });
});
