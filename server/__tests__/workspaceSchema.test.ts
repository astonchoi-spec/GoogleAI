import { describe, it, expect } from "vitest";
import { fallbackIntent } from "../intent/fallbackIntent.ts";
import { REQUIRED_TABS, quoteSheetTitle, formatSchemaCheckMessage } from "../google/workspaceSchema.ts";

describe("Workspace 시트 스키마", () => {
  describe("REQUIRED_TABS 정의", () => {
    it("4개 필수 탭을 정의한다", () => {
      expect(REQUIRED_TABS).toHaveLength(4);
      expect(REQUIRED_TABS.map((t) => t.title)).toEqual([
        "PF-Deals",
        "Trading-Alerts",
        "Workspace-Notes",
        "Audit-Log",
      ]);
    });

    it("모든 탭이 헤더를 정의한다", () => {
      for (const tab of REQUIRED_TABS) {
        expect(tab.headers.length).toBeGreaterThan(0);
        expect(tab.key).toMatch(/^[a-zA-Z]+$/);
      }
    });
  });

  describe("quoteSheetTitle", () => {
    it("일반 탭명에 작은따옴표를 두른다", () => {
      expect(quoteSheetTitle("PF-Deals")).toBe("'PF-Deals'");
    });

    it("작은따옴표가 포함된 탭명을 이스케이프한다", () => {
      expect(quoteSheetTitle("Bob's Sheet")).toBe("'Bob''s Sheet'");
    });
  });

  describe("formatSchemaCheckMessage", () => {
    it("모두 존재하는 경우 정상 메시지를 출력한다", () => {
      const msg = formatSchemaCheckMessage({
        spreadsheetId: "abc123",
        existingTabs: ["PF-Deals", "Trading-Alerts", "Workspace-Notes", "Audit-Log"],
        createdTabs: [],
        alreadyPresent: ["PF-Deals", "Trading-Alerts", "Workspace-Notes", "Audit-Log"],
        resolvedTabs: {},
      });
      expect(msg).toContain("모든 필수 탭 정상");
      expect(msg).toContain("abc123");
    });

    it("일부만 새로 만든 경우 신규/기존 모두 표시한다", () => {
      const msg = formatSchemaCheckMessage({
        spreadsheetId: "abc123",
        existingTabs: ["PF-Deals"],
        createdTabs: ["Trading-Alerts", "Workspace-Notes", "Audit-Log"],
        alreadyPresent: ["PF-Deals"],
        resolvedTabs: {},
      });
      expect(msg).toContain("신규 생성");
      expect(msg).toContain("Trading-Alerts");
      expect(msg).toContain("이미 존재");
      expect(msg).toContain("PF-Deals");
    });
  });

  describe("자연어 라우팅 — google_ensure_schema", () => {
    it('"시트 스키마 점검"을 ensure_schema로 매칭한다', () => {
      const r = fallbackIntent("시트 스키마 점검");
      expect(r.action).toBe("google_ensure_schema");
      expect(r.domain).toBe("google");
      expect(r.type).toBe("execute");
    });

    it('"시트 탭 생성"도 ensure_schema로 매칭한다', () => {
      const r = fallbackIntent("시트 탭 생성");
      expect(r.action).toBe("google_ensure_schema");
    });

    it('"워크스페이스 스키마"도 매칭한다', () => {
      const r = fallbackIntent("워크스페이스 스키마");
      expect(r.action).toBe("google_ensure_schema");
    });

    it('"시트 읽기"는 여전히 read_sheet으로 매칭 (스키마보다 우선순위 낮음)', () => {
      const r = fallbackIntent("시트 읽기");
      expect(r.action).toBe("google_read_sheet");
    });
  });
});
