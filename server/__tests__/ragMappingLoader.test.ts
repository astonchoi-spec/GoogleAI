import { describe, expect, it } from "vitest";
import {
  loadRagMapping,
  parseYamlMapping,
  validateMapping,
} from "../rag/mappingLoader.ts";

describe("rag/mappingLoader — Phase 1", () => {
  it("data/rag-mapping.yaml에서 28개 노트북 + 1개 _unmapped fallback 을 로드한다", () => {
    const mapping = loadRagMapping();
    expect(mapping.notebooks.length).toBe(29);
    // 실제 노트북 28개 (project !== "_unmapped")
    const real = mapping.notebooks.filter((n) => n.project !== "_unmapped");
    expect(real.length).toBe(28);
    // fallback 1개
    const unmapped = mapping.notebooks.find((n) => n.project === "_unmapped");
    expect(unmapped).toBeDefined();
  });

  it("로드된 매핑은 검증 이슈가 0건이다", () => {
    const mapping = loadRagMapping();
    const issues = validateMapping(mapping);
    expect(issues).toEqual([]);
  });

  it("28개 모든 항목에 data_store와 data_store_filter가 채워져 있다", () => {
    const mapping = loadRagMapping();
    for (const nb of mapping.notebooks) {
      expect(nb.data_store).toBeTruthy();
      expect(nb.data_store_filter).toBeTruthy();
      expect(nb.data_store_filter).toMatch(/^project=/);
    }
  });

  it("project ID는 28건 모두 고유하다", () => {
    const mapping = loadRagMapping();
    const projects = mapping.notebooks.map((n) => n.project);
    const unique = new Set(projects);
    expect(unique.size).toBe(projects.length);
  });

  it("9개 데이터 스토어로 그룹핑된다 (회장님 지시 6~10개 범위 내)", () => {
    const mapping = loadRagMapping();
    const stores = new Set(mapping.notebooks.map((n) => n.data_store));
    expect(stores.size).toBeGreaterThanOrEqual(6);
    expect(stores.size).toBeLessThanOrEqual(10);
  });

  it("파서: 인라인 YAML을 정상 파싱한다", () => {
    const yaml = `notebooks:
  - notebook_name: "테스트 노트북"
    project: "test-proj"
    display_name: "테스트"
    category: "research"
    status: "active"
    data_store: "ds-research-macro"
    data_store_filter: "project=test-proj"
    tags:
      - "tag1"
      - "tag2"
`;
    const result = parseYamlMapping(yaml);
    expect(result.notebooks).toHaveLength(1);
    expect(result.notebooks[0].notebook_name).toBe("테스트 노트북");
    expect(result.notebooks[0].project).toBe("test-proj");
    expect(result.notebooks[0].data_store).toBe("ds-research-macro");
    expect(result.notebooks[0].tags).toEqual(["tag1", "tag2"]);
  });

  it("validateMapping: 누락 필드를 검출한다", () => {
    const mapping = {
      notebooks: [
        {
          notebook_name: "broken",
          project: "x",
          display_name: "X",
          category: "research" as const,
          status: "active" as const,
          // data_store / data_store_filter 누락
        } as any,
      ],
    };
    const issues = validateMapping(mapping);
    expect(issues).toHaveLength(1);
    expect(issues[0].errors.some((e) => e.includes("data_store"))).toBe(true);
  });
});
