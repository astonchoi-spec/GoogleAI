import { describe, it, expect } from "vitest";
import { parseYamlMapping, validateMapping } from "../../notebooklm/mappingLoader.ts";

const SAMPLE_YAML = `
# NotebookLM 매핑 샘플
notebooks:
  # 부동산 PF
  - notebook_name: "한남동 644 시그니처 공동주택"
    project: "hannam-644"
    display_name: "한남동 644"
    category: "real-estate"
    status: "active"
    created_at: "2026-04-13"

  - notebook_name: "Petra Jordan Travel Guide"
    project: "personal-petra"
    display_name: "페트라 여행"
    category: "personal"
    status: "paused"
    notes: "여행 준비 중"
    tags:
      - "여행"
      - "요르단"
    created_at: "2026-03-01"

  - notebook_name: "트레이딩뷰 봇 및 퀀트 전략"
    project: "system-trading-automation"
    display_name: "트레이딩 자동화"
    category: "trading"
    status: "active"
    created_at: "2026-05-04"
`;

describe("parseYamlMapping", () => {
  it("3개 노트북을 파싱한다", () => {
    const result = parseYamlMapping(SAMPLE_YAML);
    expect(result.notebooks).toHaveLength(3);
  });

  it("필수 필드가 올바르게 파싱된다", () => {
    const { notebooks } = parseYamlMapping(SAMPLE_YAML);
    const hannam = notebooks[0];
    expect(hannam.notebook_name).toBe("한남동 644 시그니처 공동주택");
    expect(hannam.project).toBe("hannam-644");
    expect(hannam.display_name).toBe("한남동 644");
    expect(hannam.category).toBe("real-estate");
    expect(hannam.status).toBe("active");
    expect(hannam.created_at).toBe("2026-04-13");
  });

  it("선택 필드 notes를 파싱한다", () => {
    const { notebooks } = parseYamlMapping(SAMPLE_YAML);
    expect(notebooks[1].notes).toBe("여행 준비 중");
  });

  it("tags 배열을 올바르게 파싱한다", () => {
    const { notebooks } = parseYamlMapping(SAMPLE_YAML);
    expect(notebooks[1].tags).toEqual(["여행", "요르단"]);
  });

  it("tags가 없는 항목은 undefined", () => {
    const { notebooks } = parseYamlMapping(SAMPLE_YAML);
    expect(notebooks[0].tags).toBeUndefined();
  });

  it("빈 YAML은 빈 배열을 반환한다", () => {
    const result = parseYamlMapping("# 주석만\n\n");
    expect(result.notebooks).toHaveLength(0);
  });

  it("주석 줄을 무시한다", () => {
    const yaml = `
notebooks:
  # 이건 주석
  - notebook_name: "테스트"
    project: "test-proj"
    display_name: "테스트"
    category: "learning"
    status: "active"
`;
    const { notebooks } = parseYamlMapping(yaml);
    expect(notebooks).toHaveLength(1);
    expect(notebooks[0].project).toBe("test-proj");
  });
});

describe("validateMapping", () => {
  it("유효한 매핑은 오류가 없다", () => {
    const mapping = parseYamlMapping(SAMPLE_YAML);
    const errors = validateMapping(mapping);
    expect(errors).toHaveLength(0);
  });

  it("notebook_name 누락을 감지한다", () => {
    const errors = validateMapping({
      notebooks: [
        { notebook_name: "", project: "p1", display_name: "D1", category: "learning", status: "active" },
      ],
    });
    expect(errors[0].errors).toContain("notebook_name 누락");
  });

  it("잘못된 category를 감지한다", () => {
    const errors = validateMapping({
      notebooks: [
        { notebook_name: "N", project: "p1", display_name: "D1", category: "unknown" as never, status: "active" },
      ],
    });
    expect(errors[0].errors.some((e) => e.includes("category"))).toBe(true);
  });

  it("project 중복을 감지한다", () => {
    const errors = validateMapping({
      notebooks: [
        { notebook_name: "A", project: "dup", display_name: "A", category: "learning", status: "active" },
        { notebook_name: "B", project: "dup", display_name: "B", category: "learning", status: "active" },
      ],
    });
    expect(errors.some((e) => e.errors.some((msg) => msg.includes("중복")))).toBe(true);
  });
});
