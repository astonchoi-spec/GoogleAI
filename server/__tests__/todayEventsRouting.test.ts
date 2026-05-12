import { describe, it, expect } from "vitest";
import { fallbackIntent } from "../intent/fallbackIntent.ts";

describe("오늘 일정 브리핑 라우팅", () => {
  it("\"오늘 일정 브리핑\"을 google_today_events로 매칭한다", () => {
    const r = fallbackIntent("오늘 일정 브리핑");
    expect(r.action).toBe("google_today_events");
    expect(r.domain).toBe("google");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("\"오늘 일정\"을 google_today_events로 매칭한다", () => {
    const r = fallbackIntent("오늘 일정");
    expect(r.action).toBe("google_today_events");
  });

  it("\"오늘 스케줄\"을 google_today_events로 매칭한다", () => {
    const r = fallbackIntent("오늘 스케줄 알려줘");
    expect(r.action).toBe("google_today_events");
  });

  it("\"오늘 미팅\"을 google_today_events로 매칭한다", () => {
    const r = fallbackIntent("오늘 미팅 정리해줘");
    expect(r.action).toBe("google_today_events");
  });

  it("\"이번 주 일정\"은 기존 google_list_events로 매칭된다", () => {
    const r = fallbackIntent("이번 주 일정");
    expect(r.action).toBe("google_list_events");
  });

  it("\"다음 일정\"은 기존 google_list_events로 매칭된다", () => {
    const r = fallbackIntent("다음 일정");
    expect(r.action).toBe("google_list_events");
  });

  it("\"브리핑\" 단독은 모닝 브리핑으로 라우팅되어야 한다 (기존 동작 유지)", () => {
    const r = fallbackIntent("브리핑");
    expect(r.action).toBe("intelligence_morning_briefing");
  });
});
