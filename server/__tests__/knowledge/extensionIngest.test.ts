import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  detectArtifactKind,
  generateArtifactSlug,
  buildVersionIndex,
  buildArtifactFrontmatter,
  saveArtifact,
  setExtensionUrlMappings,
} from "../../knowledge/extensionIngest.ts";

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

describe("buildVersionIndex", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ext-version-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("디렉토리 없음 → maxVersion 0, 빈 hashSet", async () => {
    const result = await buildVersionIndex(
      path.join(tmpDir, "no-such-dir"),
      "https://notebooklm.google.com/notebook/ABC",
    );
    expect(result.maxVersion).toBe(0);
    expect(result.hashSet.size).toBe(0);
  });

  it("매칭되는 source_url 없음 → 0", async () => {
    const fileA = path.join(tmpDir, "2026-05-08-other-v1.md");
    await fs.writeFile(
      fileA,
      `---\nsource_url: https://notebooklm.google.com/notebook/OTHER\nversion: 1\nraw_text_hash: aaa\n---\n본문\n`,
      "utf-8",
    );
    const result = await buildVersionIndex(tmpDir, "https://notebooklm.google.com/notebook/ABC");
    expect(result.maxVersion).toBe(0);
    expect(result.hashSet.size).toBe(0);
  });

  it("매칭 source_url 1개 → maxVersion=1, hash 1개", async () => {
    const fileA = path.join(tmpDir, "2026-05-08-foo-v1.md");
    await fs.writeFile(
      fileA,
      `---\nsource_url: https://notebooklm.google.com/notebook/ABC\nversion: 1\nraw_text_hash: abc123\n---\n본문\n`,
      "utf-8",
    );
    const result = await buildVersionIndex(tmpDir, "https://notebooklm.google.com/notebook/ABC");
    expect(result.maxVersion).toBe(1);
    expect(result.hashSet.has("abc123")).toBe(true);
  });

  it("v1, v2, v3 → maxVersion=3, hash 3개", async () => {
    const versions = [
      { v: 1, h: "hash1" },
      { v: 2, h: "hash2" },
      { v: 3, h: "hash3" },
    ];
    for (const { v, h } of versions) {
      await fs.writeFile(
        path.join(tmpDir, `2026-05-0${v}-foo-v${v}.md`),
        `---\nsource_url: https://notebooklm.google.com/notebook/ABC\nversion: ${v}\nraw_text_hash: ${h}\n---\n본문${v}\n`,
        "utf-8",
      );
    }
    const result = await buildVersionIndex(tmpDir, "https://notebooklm.google.com/notebook/ABC");
    expect(result.maxVersion).toBe(3);
    expect(result.hashSet.size).toBe(3);
    expect(result.hashSet.has("hash2")).toBe(true);
  });

  it("URL 정규화 — 끝 슬래시·쿼리스트링 무시", async () => {
    await fs.writeFile(
      path.join(tmpDir, "2026-05-09-foo-v1.md"),
      `---\nsource_url: https://notebooklm.google.com/notebook/ABC\nversion: 1\nraw_text_hash: hh\n---\n본문\n`,
      "utf-8",
    );
    const result = await buildVersionIndex(tmpDir, "https://notebooklm.google.com/notebook/ABC/?utm=x");
    expect(result.maxVersion).toBe(1);
  });
});

describe("buildArtifactFrontmatter", () => {
  it("모든 필수 필드 포함 + 한글 따옴표 처리", () => {
    const fm = buildArtifactFrontmatter({
      kind: "market-analysis",
      title: "[시장 분석 가이드] '몽탄 신도시' 몽골",
      project: "mongolia-whitelier",
      notebookTitle: "화이트리어 역삼·몽골 공동창업",
      sourceUrl: "https://notebooklm.google.com/notebook/9a7481fc-45a9-4db6-981b-3c6d99d4f11c",
      capturedAt: "2026-05-09T14:29:10.698Z",
      hash: "61396407c28892f2",
      version: 2,
    });
    expect(fm).toMatch(/^---\n/);
    expect(fm).toMatch(/\n---\n$/);
    expect(fm).toContain('type: notebooklm-artifact');
    expect(fm).toContain('artifact_kind: market-analysis');
    expect(fm).toContain('project: mongolia-whitelier');
    expect(fm).toContain('source_url: https://notebooklm.google.com/notebook/9a7481fc-45a9-4db6-981b-3c6d99d4f11c');
    expect(fm).toContain('captured_at: 2026-05-09T14:29:10.698Z');
    expect(fm).toContain('raw_text_hash: 61396407c28892f2');
    expect(fm).toContain('version: 2');
    // 따옴표 포함된 제목 안전하게 escape
    expect(fm).toMatch(/title: ".*몽탄 신도시.*"/);
  });

  it("따옴표 포함 제목은 JSON 직렬화", () => {
    const fm = buildArtifactFrontmatter({
      kind: "report",
      title: 'He said "hi"',
      project: "p",
      notebookTitle: "nb",
      sourceUrl: "https://x.test/n/1",
      capturedAt: "2026-05-09T00:00:00Z",
      hash: "h",
      version: 1,
    });
    expect(fm).toContain('title: "He said \\"hi\\""');
  });
});

describe("saveArtifact (integration)", () => {
  let tmpRoot: string;
  let originalWiki: string | undefined;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ext-save-"));
    originalWiki = process.env.ASTON_WIKI_ROOT;
    process.env.ASTON_WIKI_ROOT = tmpRoot;
    setExtensionUrlMappings([
      {
        url: "https://notebooklm.google.com/notebook/9a7481fc-45a9-4db6-981b-3c6d99d4f11c",
        project: "mongolia-whitelier",
      },
    ]);
  });

  afterEach(async () => {
    if (originalWiki === undefined) delete process.env.ASTON_WIKI_ROOT;
    else process.env.ASTON_WIKI_ROOT = originalWiki;
    await fs.rm(tmpRoot, { recursive: true, force: true });
    setExtensionUrlMappings([]);
  });

  it("신규 적재 — version 1로 저장", async () => {
    const result = await saveArtifact({
      sourceUrl: "https://notebooklm.google.com/notebook/9a7481fc-45a9-4db6-981b-3c6d99d4f11c",
      notebookTitle: "화이트리어 역삼",
      noteText: "이것은 테스트 본문입니다. 충분한 길이를 가지고 있습니다.",
      capturedAt: "2026-05-09T14:29:10.698Z",
    });
    expect(result.status).toBe("created");
    expect(result.project).toBe("mongolia-whitelier");
    expect(result.version).toBe(1);
    expect(result.artifactKind).toBe("report");
    expect(result.savedPath).toMatch(/-v1\.md$/);
    const saved = await fs.readFile(result.savedPath, "utf-8");
    expect(saved).toContain("version: 1");
    expect(saved).toContain("이것은 테스트 본문입니다");
  });

  it("동일 본문 재캡처 → skipped", async () => {
    const payload = {
      sourceUrl: "https://notebooklm.google.com/notebook/9a7481fc-45a9-4db6-981b-3c6d99d4f11c",
      notebookTitle: "화이트리어 역삼",
      noteText: "이것은 테스트 본문입니다. 충분한 길이를 가지고 있습니다.",
      capturedAt: "2026-05-09T14:29:10.698Z",
    };
    await saveArtifact(payload);
    const second = await saveArtifact(payload);
    expect(second.status).toBe("skipped");
    expect(second.version).toBe(1);
  });

  it("본문 수정 후 재캡처 → versioned (v2)", async () => {
    const base = {
      sourceUrl: "https://notebooklm.google.com/notebook/9a7481fc-45a9-4db6-981b-3c6d99d4f11c",
      notebookTitle: "화이트리어 역삼",
      capturedAt: "2026-05-09T14:29:10.698Z",
    };
    const r1 = await saveArtifact({ ...base, noteText: "원본 본문 충분히 긴 텍스트 내용입니다." });
    expect(r1.status).toBe("created");
    const r2 = await saveArtifact({ ...base, noteText: "수정된 본문 새로운 텍스트 내용입니다." });
    expect(r2.status).toBe("versioned");
    expect(r2.version).toBe(2);
    expect(r2.savedPath).toMatch(/-v2\.md$/);
  });

  it("매핑 없는 URL → _unmapped 저장 + isUnmapped=true", async () => {
    const result = await saveArtifact({
      sourceUrl: "https://notebooklm.google.com/notebook/UNKNOWN-9999",
      notebookTitle: "미매핑 노트",
      noteText: "어딘가에서 가져온 본문 텍스트 충분한 길이.",
      capturedAt: "2026-05-09T14:29:10.698Z",
    });
    expect(result.status).toBe("created");
    expect(result.project).toBe("_unmapped");
    expect(result.isUnmapped).toBe(true);
    expect(result.mappingHint).toBeDefined();
  });
});
