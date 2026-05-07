import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseNbCommand, nbHelp, nbList, nbShow, nbSearch } from "../../notebooklm/notebookQuery.ts";

vi.mock("../../notebooklm/mappingLoader.ts", () => ({
  loadMapping: () => ({
    notebooks: [
      {
        notebook_name: "한남동 644 시그니처 공동주택",
        project: "hannam-644",
        display_name: "한남동 644",
        category: "real-estate",
        status: "active",
        created_at: "2026-04-13",
      },
      {
        notebook_name: "Petra Jordan Travel Guide",
        project: "personal-petra",
        display_name: "페트라 여행",
        category: "personal",
        status: "paused",
        tags: ["여행", "요르단"],
      },
      {
        notebook_name: "트레이딩뷰 봇 및 퀀트 전략",
        project: "system-trading-automation",
        display_name: "트레이딩 자동화",
        category: "trading",
        status: "active",
        created_at: "2026-05-04",
      },
    ],
  }),
}));

describe("parseNbCommand", () => {
  it("/nb → help", () => expect(parseNbCommand("/nb")).toEqual({ kind: "help" }));
  it("/nb help → help", () => expect(parseNbCommand("/nb help")).toEqual({ kind: "help" }));
  it("/nb list → list all", () => expect(parseNbCommand("/nb list")).toEqual({ kind: "list", category: undefined }));
  it("/nb list 부동산 → list real-estate", () =>
    expect(parseNbCommand("/nb list 부동산")).toEqual({ kind: "list", category: "real-estate" }));
  it("/nb list 학습 → list learning", () =>
    expect(parseNbCommand("/nb list 학습")).toEqual({ kind: "list", category: "learning" }));
  it("/nb show hannam-644 → show", () =>
    expect(parseNbCommand("/nb show hannam-644")).toEqual({ kind: "show", query: "hannam-644" }));
  it("/nb search 한남 → search", () =>
    expect(parseNbCommand("/nb search 한남")).toEqual({ kind: "search", keyword: "한남" }));
  it("인식 불가 → help fallback", () =>
    expect(parseNbCommand("/nb 알수없는명령")).toEqual({ kind: "help" }));
});

describe("nbHelp", () => {
  it("총 개수와 카테고리 통계를 포함한다", () => {
    const text = nbHelp();
    expect(text).toContain("총 3개");
    expect(text).toContain("부동산 PF");
    expect(text).toContain("/nb list");
    expect(text).toContain("/nb show");
    expect(text).toContain("/nb search");
  });
});

describe("nbList", () => {
  it("전체 목록에 3개 모두 포함", () => {
    const text = nbList();
    expect(text).toContain("한남동 644");
    expect(text).toContain("페트라 여행");
    expect(text).toContain("트레이딩 자동화");
  });

  it("real-estate 필터 — 한남동만", () => {
    const text = nbList("real-estate");
    expect(text).toContain("한남동 644");
    expect(text).not.toContain("페트라");
  });

  it("없는 카테고리 → 빈 안내", () => {
    const text = nbList("health");
    expect(text).toContain("없습니다");
  });
});

describe("nbShow", () => {
  it("project ID로 조회", () => {
    const text = nbShow("hannam-644");
    expect(text).toContain("한남동 644");
    expect(text).toContain("Wiki 경로");
    expect(text).toContain("hannam-644");
  });

  it("display_name 부분 일치", () => {
    const text = nbShow("페트라");
    expect(text).toContain("페트라 여행");
    expect(text).toContain("paused");
  });

  it("없는 노트북 → 오류 메시지", () => {
    const text = nbShow("존재하지않는프로젝트");
    expect(text).toContain("찾지 못했습니다");
  });
});

describe("nbSearch", () => {
  it("한글 이름 검색", () => {
    const text = nbSearch("한남");
    expect(text).toContain("한남동 644");
    expect(text).toContain("1개");
  });

  it("태그 검색", () => {
    const text = nbSearch("요르단");
    expect(text).toContain("페트라");
  });

  it("결과 없음", () => {
    const text = nbSearch("없는키워드xyz");
    expect(text).toContain("검색 결과 없음");
  });
});
