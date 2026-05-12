import { describe, it, expect } from "vitest";
import { fallbackIntent, isTgPipelineMessage } from "../../intent/fallbackIntent.ts";

describe("/tg Knowledge Pipeline 라우팅", () => {
  describe("isTgPipelineMessage", () => {
    it("'/tg 본문' 매치", () => {
      expect(isTgPipelineMessage("/tg 메모")).toBe(true);
    });
    it("'/tg #project 본문' 매치", () => {
      expect(isTgPipelineMessage("/tg #hannam-644 메모")).toBe(true);
    });
    it("'/tg' 단독 매치 (본문 없음, 핸들러가 빈 본문 처리)", () => {
      expect(isTgPipelineMessage("/tg")).toBe(true);
    });
    it("'/TG' 대문자도 매치", () => {
      expect(isTgPipelineMessage("/TG 메모")).toBe(true);
    });
    it("'/tgsomething' (공백 없음) 매치 X", () => {
      expect(isTgPipelineMessage("/tgsomething")).toBe(false);
    });
    it("/tg 아닌 메시지 매치 X", () => {
      expect(isTgPipelineMessage("저장해 메모")).toBe(false);
      expect(isTgPipelineMessage("그냥 메시지")).toBe(false);
    });
  });

  describe("fallbackIntent 라우팅", () => {
    it("/tg 메시지 → tg_pipeline_capture (knowledge 도메인, type=execute)", () => {
      const r = fallbackIntent("/tg #hannam-644 인허가 5/15");
      expect(r.domain).toBe("knowledge");
      expect(r.action).toBe("tg_pipeline_capture");
      expect(r.type).toBe("execute");
      expect(r.confidence).toBe(0.99);
      expect(r.params.rawText).toBe("/tg #hannam-644 인허가 5/15");
    });

    it("/tg가 다른 매처보다 우선 (저장해 키워드 동시 포함)", () => {
      const r = fallbackIntent("/tg 저장해 메모");
      expect(r.action).toBe("tg_pipeline_capture");
    });

    it("/tg 없는 '저장해' 메시지는 기존 wiki_auto_classify 유지 (회귀 X)", () => {
      const r = fallbackIntent("저장해 한남644 인허가");
      expect(r.action).toBe("wiki_auto_classify");
    });

    it("/tg 없는 '딜' 메시지는 기존 deals_command 유지 (회귀 X)", () => {
      const r = fallbackIntent("딜 한남644");
      expect(r.action).toBe("deals_command");
    });

    it("/tg 없는 '에이전트' 메시지는 기존 agent_command 유지 (회귀 X)", () => {
      const r = fallbackIntent("에이전트 목록");
      expect(r.action).toBe("agent_command");
    });
  });
});
