import { describe, expect, it } from "vitest";
import { mapCategory, normalizeDealName, parseDealCommand } from "../deals/dealFileRouter.ts";

describe("parseDealCommand", () => {
  it("parses 딜 추가", () => {
    expect(parseDealCommand("딜 추가 한남동644")).toEqual({ action: "create", dealName: "한남동644" });
  });

  it("parses 딜 목록", () => {
    expect(parseDealCommand("딜 목록")).toEqual({ action: "list" });
  });

  it("parses 딜 상세", () => {
    expect(parseDealCommand("딜 한남동644")).toEqual({ action: "detail", dealName: "한남동644" });
  });

  it("parses 딜 저장 with category", () => {
    expect(parseDealCommand("딜 저장 한남동644 계약서")).toEqual({
      action: "save",
      dealName: "한남동644",
      category: "contract",
    });
  });

  it("parses 딜 노트북", () => {
    expect(parseDealCommand("딜 노트북 한남동644 https://notebooklm.google.com/notebook/xxx")).toEqual({
      action: "notebook",
      dealName: "한남동644",
      notebookUrl: "https://notebooklm.google.com/notebook/xxx",
    });
  });

  it("parses 딜 상태", () => {
    expect(parseDealCommand("딜 상태 한남동644 완료")).toEqual({
      action: "status",
      dealName: "한남동644",
      status: "completed",
    });
  });
});

describe("mapCategory", () => {
  it.each([
    ["계약서", "contract"],
    ["계약", "contract"],
    ["매매계약", "contract"],
    ["신탁계약", "contract"],
    ["사업수지", "feasibility"],
    ["수지표", "feasibility"],
    ["사업성", "feasibility"],
    ["재무", "feasibility"],
    ["법률", "legal"],
    ["자문", "legal"],
    ["의견서", "legal"],
    ["변호사", "legal"],
    ["시장", "market"],
    ["입지", "market"],
    ["리서치", "market"],
    ["시장조사", "market"],
    ["공시", "disclosure"],
    ["DART", "disclosure"],
    ["등기", "disclosure"],
    ["고시", "disclosure"],
    ["공고", "disclosure"],
  ] as const)("maps %s to %s", (keyword, category) => {
    expect(mapCategory(keyword)).toBe(category);
  });

  it("maps missing category to misc", () => {
    expect(mapCategory()).toBe("misc");
    expect(mapCategory("미분류")).toBe("misc");
  });
});

describe("normalizeDealName", () => {
  it("removes Windows forbidden characters", () => {
    expect(normalizeDealName('한남/동:644*?"<>|')).toBe("한남동644");
  });
});
