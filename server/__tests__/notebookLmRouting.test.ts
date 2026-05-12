import { describe, it, expect } from "vitest";
import { matchNotebookLmQuery, fallbackIntent } from "../intent/fallbackIntent.ts";

describe("NotebookLM 자연어 라우팅", () => {
  describe("matchNotebookLmQuery — prefix 매처", () => {
    it("\"노트북 <질문>\" prefix를 인식한다", () => {
      const r = matchNotebookLmQuery("노트북 한남동644 사업성 요약");
      expect(r?.action).toBe("notebooklm_query");
      expect(r?.domain).toBe("intelligence");
      expect(r?.params.question).toBe("한남동644 사업성 요약");
    });

    it("\"노트북LM <질문>\" prefix를 인식한다", () => {
      const r = matchNotebookLmQuery("노트북LM 어제 회의 요약");
      expect(r?.params.question).toBe("어제 회의 요약");
    });

    it("\"NotebookLM <질문>\" 영문 prefix(대소문자 무시)를 인식한다", () => {
      const r = matchNotebookLmQuery("notebooklm summarize the latest deal");
      expect(r?.params.question).toBe("summarize the latest deal");
    });

    it("질문 본문이 없으면 매칭하지 않는다", () => {
      expect(matchNotebookLmQuery("노트북")).toBeNull();
      expect(matchNotebookLmQuery("노트북   ")).toBeNull();
    });

    it("prefix가 없으면 매칭하지 않는다", () => {
      expect(matchNotebookLmQuery("위키 검색 한남동")).toBeNull();
      expect(matchNotebookLmQuery("그냥 일반 질문")).toBeNull();
    });
  });

  describe("fallbackIntent 통합", () => {
    it("NotebookLM prefix가 일반 키워드보다 우선 매칭된다", () => {
      // "일정"이 들어가지만 노트북 prefix가 있으니 notebooklm_query여야 한다
      const r = fallbackIntent("노트북 오늘 일정 요약해줘");
      expect(r.action).toBe("notebooklm_query");
      expect(r.params.question).toBe("오늘 일정 요약해줘");
    });

    it("위키 prefix와 충돌하지 않는다", () => {
      const wiki = fallbackIntent("위키 검색 한남동");
      expect(wiki.action).toBe("wiki_search");
      const nb = fallbackIntent("노트북 한남동");
      expect(nb.action).toBe("notebooklm_query");
    });
  });
});
