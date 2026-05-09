# NotebookLM 저작물 회수 익스텐션 재설계 (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NotebookLM 스튜디오에서 펼친 저작물(보고서·로드맵·시장분석·제안서)을 1클릭으로 마크다운으로 변환·`projects/{project}/notebooklm/{YYYY-MM-DD}-{slug}-v{N}.md` 에 영구 저장. 회장님 편집본 보호를 위한 버전 누적 정책 적용.

**Architecture:** Chrome Extension(content.js)이 가시성·노이즈 필터로 저작물 본문 추출 → background.js POST → server/knowledge/extensionIngest.ts 가 직접 frontmatter 마크다운 생성 후 fs 저장. 기존 PipelineRunner 흐름 우회 (회장님 직접 만든 정제된 저작물에 자동 분류·태깅 불필요). artifact_kind 6종 자동 추론, 같은 source_url 재캡처 시 버전 누적.

**Tech Stack:** Node.js fs/promises, vitest, Chrome Extension Manifest V3, TypeScript

**Spec:** `docs/superpowers/specs/2026-05-09-notebooklm-artifact-capture-design.md`

---

## Prerequisites

본 plan은 **chrome-extension v0.1.2 변경분이 baseline**으로 적용되어 있다고 가정한다 (selection 우선 추출, 가시성·노이즈 필터, manifest version 0.1.2). 이 변경분이 unstaged 상태라면 plan 시작 전에 별도 커밋하라:

```bash
git status --short
# chrome-extension/{content.js, background.js, manifest.json} 이 M 으로 표시되면:
git add chrome-extension/content.js chrome-extension/background.js chrome-extension/manifest.json
git commit -m "feat(extension): v0.1.2 — selection 우선 추출 + 가시성·노이즈 필터"
```

---

## File Structure

| 파일 | 종류 | 책임 |
|---|---|---|
| `server/knowledge/extensionIngest.ts` | 수정 (대폭) | PipelineRunner 우회, 전용 saveArtifact 도입, 버전 누적 |
| `server/__tests__/knowledge/extensionIngest.test.ts` | 신규 | detectArtifactKind, generateArtifactSlug, buildVersionIndex, buildArtifactFrontmatter, saveArtifact, handleExtensionIngest 단위 테스트 |
| `chrome-extension/background.js` | 수정 (소폭) | 응답 forward에 artifactKind, version 추가 |
| `chrome-extension/content.js` | 수정 (소폭) | UI 상태 "versioned"/"skipped" 추가, 저작물 selector 1줄 추가 |
| `chrome-extension/manifest.json` | 수정 | version `0.1.2` → `0.2.0` |
| `chrome-extension/README.md` | 수정 | Phase 1 새 흐름·artifact_kind·버전 누적 정책 |

---

## Task 1: `detectArtifactKind` 함수 (TDD)

**Goal:** 저작물 제목에서 artifact_kind 6종(`market-analysis`, `investment-report`, `roadmap`, `proposal`, `summary`, `report`) 자동 추론. 매칭 안 되면 `report` 폴백.

**Files:**
- Create: `server/__tests__/knowledge/extensionIngest.test.ts`
- Modify: `server/knowledge/extensionIngest.ts` (export 추가)

- [ ] **Step 1: 실패 테스트 작성**

`server/__tests__/knowledge/extensionIngest.test.ts` 신규 생성:

```ts
import { describe, it, expect } from "vitest";
import { detectArtifactKind } from "../../knowledge/extensionIngest.ts";

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
```

- [ ] **Step 2: 테스트 실행 → fail 확인**

```
npx vitest run server/__tests__/knowledge/extensionIngest.test.ts
```
Expected: `Cannot find module "../../knowledge/extensionIngest.ts"` 또는 `detectArtifactKind is not a function`

- [ ] **Step 3: `detectArtifactKind` 구현**

`server/knowledge/extensionIngest.ts` 상단(import 아래)에 추가:

```ts
export type ArtifactKind =
  | "market-analysis"
  | "investment-report"
  | "roadmap"
  | "proposal"
  | "summary"
  | "report";

const ARTIFACT_KIND_PATTERNS: Array<{ pattern: RegExp; kind: ArtifactKind }> = [
  { pattern: /\[시장\s*분석\s*가이드\]|시장\s*분석|시장\s*트렌드/i, kind: "market-analysis" },
  { pattern: /\[투자\s*분석\s*보고서\]|투자\s*분석/i, kind: "investment-report" },
  { pattern: /로드맵|roadmap|blueprint/i, kind: "roadmap" },
  { pattern: /제안서|proposal/i, kind: "proposal" },
  { pattern: /요약|summary/i, kind: "summary" },
];

export function detectArtifactKind(title: string): ArtifactKind {
  if (!title) return "report";
  for (const { pattern, kind } of ARTIFACT_KIND_PATTERNS) {
    if (pattern.test(title)) return kind;
  }
  return "report";
}
```

- [ ] **Step 4: 테스트 실행 → pass 확인**

```
npx vitest run server/__tests__/knowledge/extensionIngest.test.ts
```
Expected: `9 passed`

- [ ] **Step 5: 커밋**

```bash
git add server/__tests__/knowledge/extensionIngest.test.ts server/knowledge/extensionIngest.ts
git commit -m "feat(knowledge): detectArtifactKind 추론 함수 6종 + 폴백"
```

---

## Task 2: `generateArtifactSlug` 함수 (TDD)

**Goal:** 제목 → 파일명 slug. 한글이 많아 영문 3자 미만이면 `artifact-{kind}-{hash8}` 폴백.

**Files:**
- Modify: `server/__tests__/knowledge/extensionIngest.test.ts` (테스트 추가)
- Modify: `server/knowledge/extensionIngest.ts`

- [ ] **Step 1: 실패 테스트 추가**

`server/__tests__/knowledge/extensionIngest.test.ts` 끝에 추가:

```ts
import { generateArtifactSlug } from "../../knowledge/extensionIngest.ts";

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
```

- [ ] **Step 2: 테스트 실행 → fail 확인**

```
npx vitest run server/__tests__/knowledge/extensionIngest.test.ts
```
Expected: `generateArtifactSlug is not a function`

- [ ] **Step 3: `generateArtifactSlug` 구현**

`server/knowledge/extensionIngest.ts` 의 `detectArtifactKind` 아래에 추가:

```ts
export function generateArtifactSlug(
  title: string,
  kind: ArtifactKind,
  hash: string,
): string {
  // 영문·숫자만 추출, 공백을 하이픈으로
  const ascii = title
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40)
    .replace(/-+$/g, "");
  if (ascii.length >= 3) return ascii;
  return `artifact-${kind}-${hash.slice(0, 8)}`;
}
```

- [ ] **Step 4: 테스트 실행 → pass 확인**

```
npx vitest run server/__tests__/knowledge/extensionIngest.test.ts
```
Expected: `15 passed` (9 + 6)

- [ ] **Step 5: 커밋**

```bash
git add server/knowledge/extensionIngest.ts server/__tests__/knowledge/extensionIngest.test.ts
git commit -m "feat(knowledge): generateArtifactSlug + 한글 100% 제목 폴백"
```

---

## Task 3: `buildVersionIndex` 함수 (TDD)

**Goal:** `projects/{project}/notebooklm/` 디렉토리 스캔 → 같은 `source_url`을 가진 파일들의 frontmatter에서 `version` 최댓값 + 본문 hash set 추출. 신규 캡처 시 hash 같으면 skip, 다르면 version+1로 저장.

**Files:**
- Modify: `server/__tests__/knowledge/extensionIngest.test.ts`
- Modify: `server/knowledge/extensionIngest.ts`

- [ ] **Step 1: 실패 테스트 추가**

```ts
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildVersionIndex } from "../../knowledge/extensionIngest.ts";

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
```

(파일 상단의 import 줄에 `beforeEach, afterEach` 도 추가)

- [ ] **Step 2: 테스트 실행 → fail 확인**

```
npx vitest run server/__tests__/knowledge/extensionIngest.test.ts
```
Expected: `buildVersionIndex is not a function`

- [ ] **Step 3: `buildVersionIndex` 구현**

`server/knowledge/extensionIngest.ts` 에 추가 (`normalizeNotebookUrl` 아래):

```ts
export interface VersionIndex {
  maxVersion: number;
  hashSet: Set<string>;
}

export async function buildVersionIndex(
  projectDir: string,
  sourceUrl: string,
): Promise<VersionIndex> {
  const result: VersionIndex = { maxVersion: 0, hashSet: new Set() };
  const targetUrl = normalizeNotebookUrl(sourceUrl);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(projectDir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".md")) continue;
    const full = path.join(projectDir, e.name);
    let text: string;
    try {
      text = await fs.readFile(full, "utf-8");
    } catch {
      continue;
    }
    // frontmatter 블록 추출 (--- 시작·종료)
    const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const fm = fmMatch[1];
    const urlMatch = fm.match(/^source_url:\s*['"]?(.+?)['"]?$/m);
    if (!urlMatch) continue;
    const fileUrl = normalizeNotebookUrl(urlMatch[1].trim());
    if (fileUrl !== targetUrl) continue;
    const versionMatch = fm.match(/^version:\s*(\d+)/m);
    const v = versionMatch ? parseInt(versionMatch[1], 10) : 0;
    if (v > result.maxVersion) result.maxVersion = v;
    const hashMatch = fm.match(/^raw_text_hash:\s*['"]?([0-9a-f]+)['"]?$/m);
    if (hashMatch) result.hashSet.add(hashMatch[1]);
  }
  return result;
}
```

- [ ] **Step 4: 테스트 실행 → pass 확인**

```
npx vitest run server/__tests__/knowledge/extensionIngest.test.ts
```
Expected: `20 passed` (15 + 5)

- [ ] **Step 5: 커밋**

```bash
git add server/knowledge/extensionIngest.ts server/__tests__/knowledge/extensionIngest.test.ts
git commit -m "feat(knowledge): buildVersionIndex — source_url 별 maxVersion·hashSet 스캔"
```

---

## Task 4: `buildArtifactFrontmatter` 함수 (TDD)

**Goal:** spec에 정의된 frontmatter YAML 직렬화. 모든 필수 필드 + JSON.stringify로 안전한 따옴표 처리.

**Files:**
- Modify: `server/__tests__/knowledge/extensionIngest.test.ts`
- Modify: `server/knowledge/extensionIngest.ts`

- [ ] **Step 1: 실패 테스트 추가**

```ts
import { buildArtifactFrontmatter } from "../../knowledge/extensionIngest.ts";

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
```

- [ ] **Step 2: 테스트 실행 → fail 확인**

```
npx vitest run server/__tests__/knowledge/extensionIngest.test.ts
```
Expected: `buildArtifactFrontmatter is not a function`

- [ ] **Step 3: `buildArtifactFrontmatter` 구현**

`server/knowledge/extensionIngest.ts` 에 추가:

```ts
export interface ArtifactFrontmatterInput {
  kind: ArtifactKind;
  title: string;
  project: string;
  notebookTitle: string;
  sourceUrl: string;
  capturedAt: string;
  hash: string;
  version: number;
}

export function buildArtifactFrontmatter(input: ArtifactFrontmatterInput): string {
  const lines = [
    "---",
    `type: notebooklm-artifact`,
    `artifact_kind: ${input.kind}`,
    `title: ${JSON.stringify(input.title)}`,
    `project: ${input.project}`,
    `notebook_title: ${JSON.stringify(input.notebookTitle)}`,
    `source_url: ${input.sourceUrl}`,
    `captured_at: ${input.capturedAt}`,
    `raw_text_hash: ${input.hash}`,
    `version: ${input.version}`,
    "---",
    "",
  ];
  return lines.join("\n");
}
```

- [ ] **Step 4: 테스트 실행 → pass 확인**

```
npx vitest run server/__tests__/knowledge/extensionIngest.test.ts
```
Expected: `22 passed`

- [ ] **Step 5: 커밋**

```bash
git add server/knowledge/extensionIngest.ts server/__tests__/knowledge/extensionIngest.test.ts
git commit -m "feat(knowledge): buildArtifactFrontmatter YAML 직렬화"
```

---

## Task 5: `saveArtifact` 통합 함수 (TDD)

**Goal:** 위 4개 함수 조합 — payload 받아 (1) hash 계산, (2) project 결정, (3) 디렉토리 mkdir, (4) buildVersionIndex로 status 결정 (skipped|created|versioned), (5) frontmatter+본문 fs.writeFile, (6) 결과 반환.

**Files:**
- Modify: `server/__tests__/knowledge/extensionIngest.test.ts`
- Modify: `server/knowledge/extensionIngest.ts`

- [ ] **Step 1: 실패 테스트 추가**

```ts
import { saveArtifact, setExtensionUrlMappings } from "../../knowledge/extensionIngest.ts";

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
```

- [ ] **Step 2: 테스트 실행 → fail 확인**

```
npx vitest run server/__tests__/knowledge/extensionIngest.test.ts
```
Expected: `saveArtifact is not a function`

- [ ] **Step 3: `saveArtifact` + 결과 타입 구현**

`server/knowledge/extensionIngest.ts` 에 추가 (기존 `IngestPayload` 인터페이스 아래):

```ts
export interface SaveArtifactResult {
  status: "created" | "skipped" | "versioned";
  project: string;
  artifactKind: ArtifactKind;
  version: number;
  savedPath: string;
  isUnmapped: boolean;
  mappingHint?: string;
}

function sha256Hex(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function todayDate(capturedAt: string): string {
  // 'YYYY-MM-DD' 추출 (timezone 무관, ISO 시작 10글자)
  return capturedAt.slice(0, 10);
}

export async function saveArtifact(payload: IngestPayload): Promise<SaveArtifactResult> {
  const normalized = normalizeNotebookUrl(payload.sourceUrl);
  const project = urlToProject.get(normalized) ?? "_unmapped";
  const isUnmapped = project === "_unmapped";

  const projectDir = path.join(resolveWikiRoot(), "projects", project, "notebooklm");
  await fs.mkdir(projectDir, { recursive: true });

  const hash = sha256Hex(payload.noteText);
  const kind = detectArtifactKind(payload.notebookTitle);
  const versionIndex = await buildVersionIndex(projectDir, payload.sourceUrl);

  // 동일 hash면 skip
  if (versionIndex.hashSet.has(hash)) {
    // 어느 파일이 그 hash 인지는 중요하지 않음 — version은 maxVersion 그대로 반환
    return {
      status: "skipped",
      project,
      artifactKind: kind,
      version: versionIndex.maxVersion,
      savedPath: "",
      isUnmapped,
      mappingHint: isUnmapped ? buildMappingHint(payload.sourceUrl) : undefined,
    };
  }

  const newVersion = versionIndex.maxVersion + 1;
  const slug = generateArtifactSlug(payload.notebookTitle, kind, hash);
  const filename = `${todayDate(payload.capturedAt)}-${slug}-v${newVersion}.md`;
  const savedPath = path.join(projectDir, filename);

  const fm = buildArtifactFrontmatter({
    kind,
    title: payload.notebookTitle,
    project,
    notebookTitle: payload.notebookTitle,
    sourceUrl: payload.sourceUrl,
    capturedAt: payload.capturedAt,
    hash,
    version: newVersion,
  });

  await fs.writeFile(savedPath, fm + payload.noteText + "\n", "utf-8");

  return {
    status: newVersion === 1 ? "created" : "versioned",
    project,
    artifactKind: kind,
    version: newVersion,
    savedPath,
    isUnmapped,
    mappingHint: isUnmapped ? buildMappingHint(payload.sourceUrl) : undefined,
  };
}

function buildMappingHint(sourceUrl: string): string {
  return `yaml 의 해당 노트북 entry 에 'notebook_url: "${sourceUrl}"' 1줄 추가 후 서버 재시작하면 다음부터 정확한 project 에 자동 적재됩니다.`;
}
```

- [ ] **Step 4: 테스트 실행 → pass 확인**

```
npx vitest run server/__tests__/knowledge/extensionIngest.test.ts
```
Expected: `26 passed` (22 + 4)

- [ ] **Step 5: 커밋**

```bash
git add server/knowledge/extensionIngest.ts server/__tests__/knowledge/extensionIngest.test.ts
git commit -m "feat(knowledge): saveArtifact 통합 — 버전 누적·skip·_unmapped"
```

---

## Task 6: `handleExtensionIngest` 리팩터링

**Goal:** 기존 PipelineRunner/NotebookLmAdapter/buildExistingHashIndex 의존 제거. 새 `saveArtifact` 만 호출. 응답 포맷도 spec에 맞게 정리.

**Files:**
- Modify: `server/knowledge/extensionIngest.ts`
- Modify: `server/__tests__/knowledge/extensionIngest.test.ts` (HTTP 핸들러 통합 테스트 추가)

- [ ] **Step 1: HTTP 핸들러 통합 테스트 추가**

```ts
import { handleExtensionIngest } from "../../knowledge/extensionIngest.ts";

function mockReqRes(method: string, body?: unknown) {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let jsonBody: unknown = null;
  let ended = false;
  const req = { method, body } as any;
  const res: any = {
    setHeader: (k: string, v: string) => { headers[k] = v; },
    status: (c: number) => { statusCode = c; return res; },
    json: (b: unknown) => { jsonBody = b; },
    end: () => { ended = true; },
  };
  return { req, res, get: () => ({ statusCode, jsonBody, headers, ended }) };
}

describe("handleExtensionIngest", () => {
  let tmpRoot: string;
  let originalWiki: string | undefined;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ext-handle-"));
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

  it("OPTIONS → 204", async () => {
    const m = mockReqRes("OPTIONS");
    await handleExtensionIngest(m.req, m.res);
    expect(m.get().ended).toBe(true);
    expect(m.get().statusCode).toBe(204);
  });

  it("GET → 헬스체크 JSON", async () => {
    const m = mockReqRes("GET");
    await handleExtensionIngest(m.req, m.res);
    expect(m.get().statusCode).toBe(200);
    expect((m.get().jsonBody as any).ok).toBe(true);
    expect((m.get().jsonBody as any).urlMappings).toBe(1);
  });

  it("POST 정상 → 201 + status=created", async () => {
    const m = mockReqRes("POST", {
      sourceUrl: "https://notebooklm.google.com/notebook/9a7481fc-45a9-4db6-981b-3c6d99d4f11c",
      notebookTitle: "[시장 분석 가이드] 몽탄 신도시 몽골 외식",
      noteText: "충분히 긴 본문 텍스트 내용 — 시장 분석 결과 요약.",
      capturedAt: "2026-05-09T14:29:10.698Z",
    });
    await handleExtensionIngest(m.req, m.res);
    const out = m.get();
    expect(out.statusCode).toBe(201);
    expect((out.jsonBody as any).status).toBe("created");
    expect((out.jsonBody as any).project).toBe("mongolia-whitelier");
    expect((out.jsonBody as any).artifactKind).toBe("market-analysis");
    expect((out.jsonBody as any).version).toBe(1);
  });

  it("POST 본문 누락 → 400", async () => {
    const m = mockReqRes("POST", { sourceUrl: "https://x.test/n/1" });
    await handleExtensionIngest(m.req, m.res);
    expect(m.get().statusCode).toBe(400);
  });

  it("POST 본문 너무 짧음 → 400", async () => {
    const m = mockReqRes("POST", {
      sourceUrl: "https://x.test/n/1",
      notebookTitle: "t",
      noteText: "짧음",
      capturedAt: "2026-05-09T00:00:00Z",
    });
    await handleExtensionIngest(m.req, m.res);
    expect(m.get().statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 일부 fail (versioned 응답 status 등)**

```
npx vitest run server/__tests__/knowledge/extensionIngest.test.ts
```
Expected: 새 통합 테스트 5개 중 일부 fail (handleExtensionIngest가 아직 saveArtifact 사용 안 함)

- [ ] **Step 3: `handleExtensionIngest` 리팩터링**

`server/knowledge/extensionIngest.ts` 의 기존 `handleExtensionIngest` 함수 전체를 다음으로 교체:

```ts
export async function handleExtensionIngest(req: Request, res: Response): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method === "GET") {
    res.status(200).json({
      ok: true,
      endpoint: "/api/rag/extension-ingest",
      method: "POST",
      urlMappings: urlToProject.size,
      mappedSample: Array.from(urlToProject.entries()).slice(0, 3),
      help: "Chrome Extension 의 background.js 가 POST 로 호출. 본 GET 응답이 보이면 라우트 정상 등록.",
    });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }

  const payload = req.body as Partial<IngestPayload>;
  const sourceUrl = String(payload.sourceUrl ?? "").trim();
  const notebookTitle = String(payload.notebookTitle ?? "").trim() || "(제목 없음)";
  const noteText = String(payload.noteText ?? "").trim();
  const capturedAt = String(payload.capturedAt ?? new Date().toISOString());

  if (!sourceUrl || !noteText) {
    res.status(400).json({ ok: false, error: "sourceUrl 또는 noteText 누락" });
    return;
  }
  if (noteText.length < 20) {
    res.status(400).json({ ok: false, error: "본문 너무 짧음 (최소 20자)" });
    return;
  }

  try {
    const result = await saveArtifact({ sourceUrl, notebookTitle, noteText, capturedAt });
    const httpStatus = result.status === "created" ? 201 : 200;
    res.status(httpStatus).json({
      ok: true,
      status: result.status,
      project: result.project,
      artifactKind: result.artifactKind,
      version: result.version,
      savedPath: result.savedPath,
      isUnmapped: result.isUnmapped,
      mappingHint: result.mappingHint,
      notebookTitle,
    });
    console.log(
      `[rag/extension] ${result.status} v${result.version}: ${result.project}${result.isUnmapped ? " (미매핑 fallback)" : ""} ← ${notebookTitle}`,
    );
  } catch (err) {
    console.error("[rag/extension] saveArtifact error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
```

또한 파일 상단의 사용 안 하는 import 제거:

```ts
// 제거:
//   import { NotebookLmAdapter } from "./adapters/notebooklm.ts";
//   import { PipelineRunner } from "./pipeline/runner.ts";
//   import { exportsProjectDir } from "./driveSync.ts";
//   import fsSync from "node:fs";
// 그리고 buildExistingHashIndex 함수, sha256 함수, pipelineRunner 인스턴스 제거
```

남는 import는: `Request, Response, fs (promises), path, crypto, resolveWikiRoot`.

- [ ] **Step 4: 테스트 실행 → 26+5=31 모두 pass 확인**

```
npx vitest run server/__tests__/knowledge/extensionIngest.test.ts
```
Expected: `31 passed`

- [ ] **Step 5: 타입체크 확인**

```
npm run check
```
Expected: tsc 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add server/knowledge/extensionIngest.ts server/__tests__/knowledge/extensionIngest.test.ts
git commit -m "refactor(knowledge): handleExtensionIngest — saveArtifact 단일 호출로 단순화

- PipelineRunner/NotebookLmAdapter/buildExistingHashIndex 의존 제거
- 응답에 artifactKind, version, isUnmapped, mappingHint 포함
- HTTP 통합 테스트 5건 추가"
```

---

## Task 7: `background.js` — 응답 forward 확장

**Goal:** 새 백엔드 응답의 `artifactKind`, `version` 필드를 content.js로 전달.

**Files:**
- Modify: `chrome-extension/background.js`

- [ ] **Step 1: `sendResponse` 객체 확장**

`chrome-extension/background.js` 의 success 분기 (라인 ~32-40):

```js
      if (res.ok) {
        sendResponse({
          ok: true,
          status: json.status ?? "created",
          project: json.project,
          savedPath: json.savedPath,
          isUnmapped: json.isUnmapped,
          mappingHint: json.mappingHint,
          artifactKind: json.artifactKind,
          version: json.version,
        });
      } else {
```

- [ ] **Step 2: 커밋**

```bash
git add chrome-extension/background.js
git commit -m "feat(extension): background.js — artifactKind·version forward"
```

---

## Task 8: `content.js` — UI 상태 versioned/skipped 추가 + 저작물 selector 1줄

**Goal:** 새 백엔드 응답을 정확히 반영하는 UI 상태 추가. 저작물 모달 selector 1줄 보강.

**Files:**
- Modify: `chrome-extension/content.js`

- [ ] **Step 1: 저작물 모달 selector 추가**

`chrome-extension/content.js` 의 `extractNoteText` 함수 안 `candidates` 배열 최상단에 추가 (이미 v0.1.2의 candidates 배열 존재 — 그 시작 부분에 1줄 삽입):

```js
    const candidates = [
      // 저작물(보고서·로드맵·시장분석 등) 펼침 모달 — 최우선
      '[role="dialog"][aria-modal="true"]',
      '[data-test-id*="artifact"]',
      '[data-test-id*="studio-output"]',
      // (이하 기존 selector 유지)
      'chat-message',
      ...
    ];
```

- [ ] **Step 2: 클릭 핸들러의 응답 처리 분기 강화**

기존 (`response?.ok` 분기 안):

```js
        if (response?.ok) {
          let label;
          if (response.status === "skipped") {
            label = "✅ 이미 동일 본문 (skip)";
          } else if (response.isUnmapped) {
            label = "⚠️ _unmapped 임시 저장 — yaml 매핑 필요";
          } else {
            label = `✅ 위키 적재 완료 (${response.project ?? ""})`;
          }
          setButtonState(btn, "ok", label);
```

이 블록을 다음으로 교체:

```js
        if (response?.ok) {
          let label;
          let state = "ok";
          const proj = response.project ?? "";
          const v = response.version ?? 1;
          const kind = response.artifactKind ? ` ${response.artifactKind}` : "";
          if (response.status === "skipped") {
            label = "⏸ 동일 본문 skip";
          } else if (response.status === "versioned") {
            label = `📚 신규 버전 저장 (v${v})`;
          } else if (response.isUnmapped) {
            label = `⚠️ _unmapped${kind} v${v} — yaml 매핑 필요`;
          } else {
            label = `✅ 적재 완료 (${proj}${kind} v${v})`;
          }
          setButtonState(btn, state, label);
```

- [ ] **Step 3: 커밋**

```bash
git add chrome-extension/content.js
git commit -m "feat(extension): content.js — 저작물 모달 selector + versioned/skipped UI 분기"
```

---

## Task 9: manifest version bump + README 갱신

**Goal:** Chrome 익스텐션 사용자가 변경을 인지하도록 version bump. README에 새 흐름·artifact_kind·버전 누적 정책 명시.

**Files:**
- Modify: `chrome-extension/manifest.json`
- Modify: `chrome-extension/README.md`

- [ ] **Step 1: manifest version bump**

`chrome-extension/manifest.json`:

```json
  "version": "0.2.0",
```

- [ ] **Step 2: README 갱신**

`chrome-extension/README.md` 의 "동작 흐름" 섹션을 다음으로 교체:

```markdown
## 동작 흐름

1. `notebooklm.google.com/notebook/*` 페이지 로드 시 우상단 **[📥 Aston Wiki로 가져오기]** 버튼 자동 주입
2. 회장님이 NotebookLM **스튜디오 저작물(보고서·로드맵·시장분석·제안서)을 클릭해 펼친 상태**에서 버튼 클릭
3. 우선순위로 본문 추출:
   - (1) 화면에서 드래그 선택한 텍스트 (가장 신뢰 가능)
   - (2) 저작물 모달 / 챗 응답 selector
   - (3) main 영역 fallback (가시성 + 노이즈 필터 적용)
4. `http://localhost:4000/api/rag/extension-ingest` POST
5. 백엔드가 매핑 yaml 의 `notebook_url` 로 project 자동 매칭
6. 제목 prefix 기반 **artifact_kind 자동 추론** (6종):
   - `market-analysis` (시장 분석 가이드·시장 트렌드)
   - `investment-report` (투자 분석 보고서·투자 분석)
   - `roadmap` (로드맵·Roadmap·Blueprint)
   - `proposal` (제안서·Proposal)
   - `summary` (요약·Summary)
   - `report` (그 외 — 폴백)
7. 저장 위치: `{ASTON_WIKI_ROOT}/projects/{project}/notebooklm/{YYYY-MM-DD}-{slug}-v{N}.md`
8. **버전 누적 정책**:
   - 같은 source_url + 동일 본문 hash → **skip** (`⏸ 동일 본문 skip`)
   - 같은 source_url + 다른 본문 hash → **신규 버전 저장** v{N+1} (`📚 신규 버전 저장 (v3)`)
   - 회장님이 NotebookLM에서 저작물 수정 후 재캡처해도 **기존 파일 보존**
9. 성공 시 버튼 상태:
   - `✅ 적재 완료 (mongolia-whitelier market-analysis v1)` — 신규
   - `📚 신규 버전 저장 (v3)` — 회장님 수정 후 재캡처
   - `⏸ 동일 본문 skip` — 같은 본문 재클릭
   - `⚠️ _unmapped … — yaml 매핑 필요` — 매핑 yaml에 notebook_url 누락
```

- [ ] **Step 3: 커밋**

```bash
git add chrome-extension/manifest.json chrome-extension/README.md
git commit -m "feat(extension): v0.2.0 — Phase 1 저작물 회수 흐름 + 버전 누적 README"
```

---

## Acceptance Criteria

회장님이 다음 5개 시나리오를 직접 NotebookLM에서 검증:

1. **신규 회수**: 매핑된 노트북에서 저작물 펼친 후 [📥] 클릭 → 우상단 토스트 "✅ 적재 완료 ({project} {kind} v1)" 확인. `G:\내 드라이브\Aston-Wiki\projects\{project}\notebooklm\` 에 `*-v1.md` 파일 생성됐는지 확인.
2. **skip**: 같은 저작물 같은 상태에서 [📥] 다시 클릭 → "⏸ 동일 본문 skip" 토스트. 새 파일 생성 안 됨.
3. **버전 누적**: 회장님이 NotebookLM에서 저작물 본문을 1자 이상 수정 후 [📥] 클릭 → "📚 신규 버전 저장 (v2)" 토스트. `*-v2.md` 파일 추가 생성, `*-v1.md`는 보존.
4. **\_unmapped**: 매핑 yaml에 없는 노트북에서 [📥] → "⚠️ \_unmapped … yaml 매핑 필요" 토스트. `projects/_unmapped/notebooklm/` 에 저장.
5. **frontmatter 검증**: 저장된 .md 파일을 열어 frontmatter에 `type: notebooklm-artifact`, `artifact_kind`, `project`, `source_url`, `captured_at`, `raw_text_hash`, `version` 모두 정확히 기재됐는지 확인.

자동 검증 (npm test):

```
npm test -- server/__tests__/knowledge/extensionIngest.test.ts
```
Expected: `31 passed` (Task 1·2·3·4·5·6 누적)

타입 체크:

```
npm run check
```
Expected: 에러 없음

빌드:

```
npm run build
```
Expected: 에러 없음
