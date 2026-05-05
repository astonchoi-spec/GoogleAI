import { describe, it, expect } from "vitest";
import { fallbackIntent } from "../intent/fallbackIntent.ts";

describe("Monitoring 자연어 라우팅", () => {
  it("\"모니터링\"을 monitoring_status로 매칭한다", () => {
    const r = fallbackIntent("모니터링");
    expect(r.action).toBe("monitoring_status");
    expect(r.domain).toBe("intelligence");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("\"시스템 상태\"를 매칭한다", () => {
    const r = fallbackIntent("시스템 상태");
    expect(r.action).toBe("monitoring_status");
  });

  it("\"운영 상태 알려줘\"를 매칭한다", () => {
    const r = fallbackIntent("운영 상태 알려줘");
    expect(r.action).toBe("monitoring_status");
  });

  it("\"system status\" 영문을 매칭한다", () => {
    const r = fallbackIntent("system status");
    expect(r.action).toBe("monitoring_status");
  });

  it("\"monitoring\" 영문 단독을 매칭한다", () => {
    const r = fallbackIntent("monitoring");
    expect(r.action).toBe("monitoring_status");
  });

  it("\"모니터링 대시보드\" 변형도 매칭한다", () => {
    const r = fallbackIntent("모니터링 대시보드 보여줘");
    expect(r.action).toBe("monitoring_status");
  });
});
