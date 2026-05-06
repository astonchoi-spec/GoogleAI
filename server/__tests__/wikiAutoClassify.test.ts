import { describe, it, expect } from "vitest";
import { fallbackIntent } from "../intent/fallbackIntent.ts";

describe("wiki_auto_classify 인텐트 매칭", () => {
  it.each([
    "저장해 삼성전자 3분기 실적 영업이익 10조 달성",
    "분류저장 비트코인 반감기 후 상승 사이클 분석",
    "자동저장 한남동 PF 금리 리스크 검토 필요",
  ])("'%s' → wiki_auto_classify", (msg) => {
    const r = fallbackIntent(msg);
    expect(r.action).toBe("wiki_auto_classify");
    expect(r.domain).toBe("wiki");
    expect(r.confidence).toBeGreaterThanOrEqual(0.95);
    expect(r.params.content).toBeTruthy();
  });

  it("content가 prefix 이후 텍스트로 추출된다", () => {
    const r = fallbackIntent("저장해 비트코인 분석 내용입니다");
    expect(r.params.content).toBe("비트코인 분석 내용입니다");
  });

  it("기존 위키 저장은 wiki_save로 유지된다", () => {
    const r = fallbackIntent("위키 저장 부동산 분석 #부동산");
    expect(r.action).toBe("wiki_save");
  });

  it("위키 검색은 wiki_search로 유지된다", () => {
    const r = fallbackIntent("위키 검색 부동산");
    expect(r.action).toBe("wiki_search");
  });
});
