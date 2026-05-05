import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { fallbackIntent } from "../intent/fallbackIntent.ts";

describe("Google Sheets 자연어 라우팅", () => {
  const original = process.env.WORKSPACE_SPREADSHEET_ID;

  beforeEach(() => {
    process.env.WORKSPACE_SPREADSHEET_ID = "test-spreadsheet-id";
  });

  afterEach(() => {
    if (original === undefined) delete process.env.WORKSPACE_SPREADSHEET_ID;
    else process.env.WORKSPACE_SPREADSHEET_ID = original;
  });

  describe("google_read_sheet — 읽기 의도", () => {
    it("\"시트 읽기\"를 read_sheet으로 매칭한다", () => {
      const r = fallbackIntent("시트 읽기");
      expect(r.action).toBe("google_read_sheet");
      expect(r.domain).toBe("google");
      expect(r.type).toBe("query");
      expect(r.params.spreadsheetId).toBe("test-spreadsheet-id");
      expect(r.params.range).toBe("Sheet1!A1:Z50");
    });

    it("\"시트 조회해줘\"를 매칭한다", () => {
      const r = fallbackIntent("시트 조회해줘");
      expect(r.action).toBe("google_read_sheet");
    });

    it("\"스프레드시트 보여줘\"를 매칭한다", () => {
      const r = fallbackIntent("스프레드시트 보여줘");
      expect(r.action).toBe("google_read_sheet");
    });

    it("범위가 명시된 경우 range 파라미터로 추출한다", () => {
      const r = fallbackIntent("시트 읽기 Sheet2!A1:C10");
      expect(r.action).toBe("google_read_sheet");
      expect(r.params.range).toBe("Sheet2!A1:C10");
    });

    it("\"sheets read\" 영문 명령을 매칭한다", () => {
      const r = fallbackIntent("sheets read");
      expect(r.action).toBe("google_read_sheet");
    });
  });

  describe("쓰기와의 우선순위", () => {
    it("\"시트 쓰기\"는 여전히 write_sheet으로 매칭된다", () => {
      const r = fallbackIntent("시트 쓰기");
      expect(r.action).toBe("google_write_sheet");
      expect(r.type).toBe("execute");
    });
  });
});
