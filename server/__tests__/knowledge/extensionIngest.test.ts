import { describe, it, expect } from "vitest";
import { detectArtifactKind, generateArtifactSlug } from "../../knowledge/extensionIngest.ts";

describe("detectArtifactKind", () => {
  it("[시장 분석 가이드] prefix → market-analysis", () => {
    expect(detectArtifactKind("[시장 분석 가이드] '몽탄 신도시' 몽골 외식 시장의 기회"))
      .toBe("market-analysis");
  });

  it("'시장 트렌드' 포함 → market-analysis", () => {
    expect(detectArtifactKind("몽골 외식 시장 트렌드 분석 2026")).toBe("market-analysis");
  });

  it("[투자 분석 보고서] prefix → investment-report", () => {
    expect(detectArtifactKind("[투자 분석 보고서] 화이트리에 국내 거점 확보"))
      .toBe("investment-report");
  });

  it("'로드맵' 포함 → roadmap", () => {
    expect(detectArtifactKind("화이트리에 몽골 진출 전략 로드맵")).toBe("roadmap");
  });

  it("'Blueprint' 포함 (대소문자 무시) → roadmap", () => {
    expect(detectArtifactKind("Whitelier Mongolia Blueprint")).toBe("roadmap");
  });

  it("'제안서' 포함 → proposal", () => {
    expect(detectArtifactKind("몽골 프리미엄 베이커리 마스터 프랜차이즈 제안서"))
      .toBe("proposal");
  });

  it("'요약' 포함 → summary", () => {
    expect(detectArtifactKind("화이트리에 5월 활동 요약")).toBe("summary");
  });

  it("매칭 없음 → report (fallback)", () => {
    expect(detectArtifactKind("그냥 일반적인 노트")).toBe("report");
  });

  it("빈 문자열 → report", () => {
    expect(detectArtifactKind("")).toBe("report");
  });
});

describe("generateArtifactSlug", () => {
  it("영문·숫자 제목은 케밥으로", () => {
    expect(generateArtifactSlug("Whitelier Mongolia Blueprint", "roadmap", "abcdef0123456789"))
      .toBe("whitelier-mongolia-blueprint");
  });

  it("한글이 섞이면 영문 부분만 추출 (3자 이상)", () => {
    expect(generateArtifactSlug("화이트리에 Mongolia 2026", "roadmap", "abcdef0123456789"))
      .toBe("mongolia-2026");
  });

  it("한글 100% 제목 → artifact-{kind}-{hash8} 폴백", () => {
    expect(generateArtifactSlug("화이트리에 역삼 몽골 공동창업", "report", "abcdef0123456789ffff"))
      .toBe("artifact-report-abcdef01");
  });

  it("영문 3자 미만은 폴백", () => {
    expect(generateArtifactSlug("화 AI 분석", "market-analysis", "11223344aabbccdd"))
      .toBe("artifact-market-analysis-11223344");
  });

  it("최대 길이 40자 절단", () => {
    const longTitle = "Whitelier Global Expansion Master Plan 2026 Quarterly Review";
    const slug = generateArtifactSlug(longTitle, "roadmap", "abcdef0123456789");
    expect(slug.length).toBeLessThanOrEqual(40);
  });

  it("특수문자 제거 후 케밥", () => {
    expect(generateArtifactSlug("AI/ML & Data: Pipeline (2026)!", "report", "deadbeef12345678"))
      .toBe("ai-ml-data-pipeline-2026");
  });
});
