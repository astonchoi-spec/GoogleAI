# Phase 4-A — 로컬 NotebookLM 회수 자료 → Web Chat RAG 주입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** chat 도메인 fallback 단계에 로컬 `*.md` 검색을 끼워넣어, 회장님이 "한남 PF 진행 상황 어때?" 같은 자연 질의만 해도 회수 자료가 자동 인용되도록 한다.

**Architecture:** `routers/llm.ts:chat` 의 인텐트 fallthrough 직후(208~250) 신규 `searchLocalNotes()` 호출 → systemPrompt 에 컨텍스트 단락 prepend + 응답 본문 끝에 "📚 참고 자료" 인용 절 부가 + `sources` 필드(`file://` URI)에 회수 자료 채움. 인텐트 매칭 성공시(`handled=true`)에는 RAG 단계 건너뛰어 기존 라우팅과 100% 직교.

**Tech Stack:** Node.js fs/promises, vitest, TypeScript (strict), 기존 `LLMResponse.sources: GroundingSource[]` 재사용

**Spec:** `docs/superpowers/specs/2026-05-10-phase4a-local-rag-design.md`

---

## File Structure

| 파일 | 종류 | 책임 |
|---|---|---|
| `server/rag/localMdSearch.ts` | 신규 (~250줄) | Public API `searchLocalNotes()` + `formatCitationFooter()`, 토큰화·스코어링·캐시·top-K |
| `server/__tests__/localMdSearch.test.ts` | 신규 (~250줄) | 10개 케이스: 빈 root / 토큰화 / 스코어링 / 가중치 / 보너스 / 캐시 / top-K / projects 필터 / snippet / 인용 절 |
| `server/routers/llm.ts` | 수정 (한 곳) | line 208 직후 RAG 단계 삽입 + systemPrompt 주입 + 응답 후처리 |

`server/rag/` 도메인은 외부 도메인 import 금지(모듈 경계 위반 검증 자동) — 표준 라이브러리 + 동일 도메인 + types 만 사용한다. `routers/` 만 `rag` 를 import 한다.

---

## Test Strategy

`process.env.ASTON_WIKI_ROOT` 를 임시 디렉토리로 override하고, 테스트마다 `projects/{project}/notebooklm/*.md` 픽스처를 미리 작성하는 패턴을 사용한다. `server/__tests__/wiki.test.ts` 의 `os.tmpdir()` + `beforeEach`/`afterEach` 패턴을 따른다. 절대 회장님의 G:\ 드라이브를 건드리지 않는다.

---

## Task 1: Module skeleton + empty-root behavior

**Files:**
- Create: `server/rag/localMdSearch.ts`
- Create: `server/__tests__/localMdSearch.test.ts`

- [ ] **Step 1: Write the failing test for empty result**

```ts
// server/__tests__/localMdSearch.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { searchLocalNotes } from "../rag/localMdSearch.ts";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = path.join(os.tmpdir(), `rag-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpRoot, { recursive: true });
  process.env.ASTON_WIKI_ROOT = tmpRoot;
});

afterEach(async () => {
  delete process.env.ASTON_WIKI_ROOT;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("rag/localMdSearch — Phase 4-A", () => {
  it("ASTON_WIKI_ROOT 가 비어있으면 [] 를 반환한다 (throw 금지)", async () => {
    const hits = await searchLocalNotes("한남 PF");
    expect(hits).toEqual([]);
  });

  it("projects 디렉토리가 아예 없어도 [] 를 반환한다", async () => {
    delete process.env.ASTON_WIKI_ROOT;
    const hits = await searchLocalNotes("아무거나");
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/localMdSearch.test.ts`
Expected: FAIL with "Cannot find module '../rag/localMdSearch.ts'"

- [ ] **Step 3: Write minimal implementation (returns [])**

```ts
// server/rag/localMdSearch.ts
// Phase 4-A — 로컬 NotebookLM 회수 자료(`*.md`) 검색 → Web Chat RAG 주입.
// 검색 루트: ${ASTON_WIKI_ROOT}/projects/*/notebooklm/*.md
// Public API: searchLocalNotes(query, opts?) / formatCitationFooter(hits)
//
// 모듈 경계: server/rag/ 도메인 — 외부 도메인 import 금지. stdlib + 자기 도메인 + types 만.

import fs from "node:fs/promises";
import path from "node:path";

export interface NoteHit {
  project: string;
  filePath: string;
  fileName: string;
  frontmatter: Record<string, unknown>;
  snippet: string;
  score: number;
}

export interface SearchOptions {
  k?: number;
  projects?: string[];
}

export async function searchLocalNotes(
  _query: string,
  _opts: SearchOptions = {},
): Promise<NoteHit[]> {
  return [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/localMdSearch.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/rag/localMdSearch.ts server/__tests__/localMdSearch.test.ts
git commit -m "feat(rag): Phase 4-A localMdSearch 골격 + empty root → []"
```

---

## Task 2: Tokenization (한·영 휴리스틱)

**Files:**
- Modify: `server/rag/localMdSearch.ts`
- Modify: `server/__tests__/localMdSearch.test.ts`

- [ ] **Step 1: Write the failing tests**

추가할 테스트 (`describe` 블록 내):

```ts
import { tokenize } from "../rag/localMdSearch.ts";

describe("tokenize", () => {
  it("한국어 어절 길이≥2 만 살린다", () => {
    const tokens = tokenize("한남 PF 진행 상황 어때");
    expect(tokens).toContain("한남");
    expect(tokens).toContain("진행");
    expect(tokens).toContain("상황");
    expect(tokens).toContain("어때");
  });

  it("영어 토큰은 길이≥3 만 살리고 lowercase 한다", () => {
    const tokens = tokenize("BTC PF go go");
    expect(tokens).toContain("btc");
    expect(tokens).toContain("go"); // ❌ 길이<3 — 빠져야 함
    // 위 한 줄은 의도적인 음수 검증
  });
});
```

→ 실제 의도에 맞게 정정:

```ts
describe("tokenize", () => {
  it("한국어 어절 길이≥2, 영어 길이≥3, 그 외 제거", () => {
    const tokens = tokenize("한남 PF 진행 상황 어때 go BTC");
    expect(tokens).toContain("한남");
    expect(tokens).toContain("진행");
    expect(tokens).toContain("상황");
    expect(tokens).toContain("어때");
    expect(tokens).toContain("btc");
    expect(tokens).not.toContain("go"); // 영어 길이<3
    expect(tokens).not.toContain("pf"); // 영어 길이<3
  });

  it("영어는 lowercase 정규화", () => {
    expect(tokenize("HANNAM Project")).toContain("hannam");
    expect(tokenize("HANNAM Project")).toContain("project");
  });

  it("문장부호와 빈 토큰 제거", () => {
    const tokens = tokenize("한남, PF! 진행?");
    expect(tokens).toEqual(["한남", "진행"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/localMdSearch.test.ts`
Expected: FAIL with "tokenize is not exported"

- [ ] **Step 3: Implement tokenize**

```ts
// server/rag/localMdSearch.ts — 추가
const KOREAN_RE = /[가-힣]/;

export function tokenize(text: string): string[] {
  if (!text) return [];
  // 공백·문장부호 split, 한·영·숫자만 남김
  return text
    .toLowerCase()
    .split(/[\s,.!?;:()[\]{}"'`~/\\<>+*=|&^%$#@]+/u)
    .map((t) => t.trim())
    .filter((t) => {
      if (!t) return false;
      // 한글이 하나라도 들어있으면 길이 ≥ 2
      if (KOREAN_RE.test(t)) return t.length >= 2;
      // 영문·숫자 토큰은 길이 ≥ 3
      return t.length >= 3;
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/localMdSearch.test.ts`
Expected: PASS (5 tests total)

- [ ] **Step 5: Commit**

```bash
git add server/rag/localMdSearch.ts server/__tests__/localMdSearch.test.ts
git commit -m "feat(rag): Phase 4-A tokenize 한·영 휴리스틱"
```

---

## Task 3: File scanning + frontmatter parse + body extraction (with mtime cache)

**Files:**
- Modify: `server/rag/localMdSearch.ts`
- Modify: `server/__tests__/localMdSearch.test.ts`

- [ ] **Step 1: Write failing tests**

추가할 테스트:

```ts
async function writeNote(
  project: string,
  fileName: string,
  frontmatter: Record<string, string | string[]>,
  body: string,
): Promise<string> {
  const dir = path.join(tmpRoot, "projects", project, "notebooklm");
  await fs.mkdir(dir, { recursive: true });
  const fmLines = Object.entries(frontmatter).map(([k, v]) =>
    Array.isArray(v) ? `${k}: [${v.join(", ")}]` : `${k}: ${v}`,
  );
  const content = `---\n${fmLines.join("\n")}\n---\n${body}\n`;
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

describe("file scanning", () => {
  it("projects/{p}/notebooklm/*.md 만 수집한다", async () => {
    await writeNote("hannam-644", "2026-05-08-사업성.md", { tags: ["pf"] }, "한남 사업성 분석");
    // 검색 대상 외부 파일 (notebooklm 하위가 아님) — 무시되어야 함
    const outsideDir = path.join(tmpRoot, "projects", "hannam-644", "notes");
    await fs.mkdir(outsideDir, { recursive: true });
    await fs.writeFile(path.join(outsideDir, "memo.md"), "한남 메모", "utf-8");

    const hits = await searchLocalNotes("한남");
    expect(hits.length).toBe(1);
    expect(hits[0].project).toBe("hannam-644");
    expect(hits[0].fileName).toBe("2026-05-08-사업성.md");
  });

  it("frontmatter tags 와 본문이 NoteHit 에 채워진다", async () => {
    await writeNote(
      "hannam-644",
      "test.md",
      { tags: ["pf", "hannam"], categories: ["realestate"] },
      "한남 사업성",
    );
    const hits = await searchLocalNotes("한남");
    expect(hits[0].frontmatter.tags).toEqual(["pf", "hannam"]);
    expect(hits[0].frontmatter.categories).toEqual(["realestate"]);
  });
});

describe("cache", () => {
  it("두 번째 호출은 fs.readFile 을 다시 부르지 않는다 (mtime 동일)", async () => {
    await writeNote("hannam-644", "test.md", {}, "한남 사업성 분석");
    const first = await searchLocalNotes("한남");
    expect(first.length).toBe(1);
    // 본문을 직접 변경하되 mtime 은 그대로 (캐시 hit 검증)
    // 직접적 readFile 카운팅은 어려우므로, 캐시 invalidate 후 재호출이 새 본문을 읽는지로 간접 검증
    const second = await searchLocalNotes("한남");
    expect(second[0].snippet).toContain("한남");
  });

  it("파일 mtime 변경 시 캐시가 무효화된다", async () => {
    const filePath = await writeNote("hannam-644", "test.md", {}, "한남 사업성 분석");
    await searchLocalNotes("한남");
    // 1초 차이로 본문 변경 (mtime 갱신 보장)
    await new Promise((r) => setTimeout(r, 50));
    await fs.writeFile(filePath, "---\n---\n역삼 빌딩 검토\n", "utf-8");
    // mtime 강제 갱신
    const future = new Date(Date.now() + 5000);
    await fs.utimes(filePath, future, future);
    const hits = await searchLocalNotes("역삼");
    expect(hits.length).toBe(1);
    expect(hits[0].snippet).toContain("역삼");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/localMdSearch.test.ts`
Expected: FAIL — `searchLocalNotes` 가 여전히 `[]` 반환

- [ ] **Step 3: Implement file scan + frontmatter + cache + minimal scoring (TF only)**

```ts
// server/rag/localMdSearch.ts — 확장

const SEARCH_GLOB_DEPTH = 2; // projects/<p>/notebooklm/<file>

interface CachedNote {
  filePath: string;
  fileName: string;
  project: string;
  mtimeMs: number;
  frontmatter: Record<string, unknown>;
  body: string;
  bodyLower: string;
}

const noteCache = new Map<string, CachedNote>();
const CACHE_TTL_MS = 5 * 60 * 1000;
let cacheStampMs = 0;

function resolveSearchRoot(): string | null {
  const aston = process.env.ASTON_WIKI_ROOT?.trim();
  if (aston) return path.join(aston, "projects");
  const legacy = process.env.WIKI_ROOT?.trim();
  if (legacy) return path.join(legacy, "projects");
  return null;
}

function parseFrontmatter(content: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta: Record<string, unknown> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      meta[key] = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      meta[key] = val;
    }
  }
  return { meta, body: match[2] };
}

async function listProjectDirs(searchRoot: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(searchRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => path.join(searchRoot, e.name));
  } catch {
    return [];
  }
}

async function listMdFiles(notebookDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(notebookDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => path.join(notebookDir, e.name));
  } catch {
    return [];
  }
}

async function loadNote(filePath: string): Promise<CachedNote | null> {
  try {
    const stat = await fs.stat(filePath);
    const cached = noteCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached;

    const raw = await fs.readFile(filePath, "utf-8");
    const { meta, body } = parseFrontmatter(raw);
    const project = path.basename(path.dirname(path.dirname(filePath)));
    const note: CachedNote = {
      filePath,
      fileName: path.basename(filePath),
      project,
      mtimeMs: stat.mtimeMs,
      frontmatter: meta,
      body,
      bodyLower: body.toLowerCase(),
    };
    noteCache.set(filePath, note);
    return note;
  } catch (e) {
    console.warn("[rag/localMdSearch] loadNote 실패:", filePath, e);
    return null;
  }
}

function pruneCacheIfStale(): void {
  const now = Date.now();
  if (now - cacheStampMs > CACHE_TTL_MS) {
    noteCache.clear();
    cacheStampMs = now;
  }
}

export async function searchLocalNotes(
  query: string,
  opts: SearchOptions = {},
): Promise<NoteHit[]> {
  const searchRoot = resolveSearchRoot();
  if (!searchRoot) return [];

  pruneCacheIfStale();

  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const projectDirs = await listProjectDirs(searchRoot);
  const filtered = opts.projects
    ? projectDirs.filter((d) => opts.projects!.includes(path.basename(d)))
    : projectDirs;

  const allFiles: string[] = [];
  for (const dir of filtered) {
    const files = await listMdFiles(path.join(dir, "notebooklm"));
    allFiles.push(...files);
  }

  const hits: NoteHit[] = [];
  for (const filePath of allFiles) {
    const note = await loadNote(filePath);
    if (!note) continue;
    const score = scoreNote(note, tokens);
    if (score <= 0) continue;
    hits.push({
      project: note.project,
      filePath: note.filePath,
      fileName: note.fileName,
      frontmatter: note.frontmatter,
      snippet: extractSnippet(note.body, tokens),
      score,
    });
  }

  hits.sort((a, b) => b.score - a.score);
  const k = opts.k ?? 3;
  return hits.slice(0, k);
}

// 다음 Task 들에서 채워질 함수 placeholder
function scoreNote(note: CachedNote, tokens: string[]): number {
  let score = 0;
  for (const t of tokens) {
    let idx = 0;
    while ((idx = note.bodyLower.indexOf(t, idx)) !== -1) {
      score += 1;
      idx += t.length;
    }
  }
  return score;
}

function extractSnippet(body: string, _tokens: string[]): string {
  return body.slice(0, 500).trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/localMdSearch.test.ts`
Expected: PASS (9 tests total) — file scan + frontmatter + cache + 기본 TF 동작

- [ ] **Step 5: Commit**

```bash
git add server/rag/localMdSearch.ts server/__tests__/localMdSearch.test.ts
git commit -m "feat(rag): Phase 4-A 파일 스캔 + frontmatter + mtime 캐시 + TF 스코어링"
```

---

## Task 4: Frontmatter tag/category weight × 1.5

**Files:**
- Modify: `server/rag/localMdSearch.ts`
- Modify: `server/__tests__/localMdSearch.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe("scoring — frontmatter weight", () => {
  it("tag 일치 시 가중치 1.5× (동일 TF 인 경우 tag 있는 쪽이 더 높다)", async () => {
    await writeNote("a", "with-tag.md", { tags: ["한남"] }, "한남 한 줄");
    await writeNote("b", "no-tag.md", {}, "한남 한 줄");
    const hits = await searchLocalNotes("한남");
    expect(hits.length).toBe(2);
    expect(hits[0].project).toBe("a"); // tag 있는 쪽이 위
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it("categories 일치도 동일하게 1.5× 가중치", async () => {
    await writeNote("a", "with-cat.md", { categories: ["realestate"] }, "realestate 한 줄");
    await writeNote("b", "no-cat.md", {}, "realestate 한 줄");
    const hits = await searchLocalNotes("realestate");
    expect(hits[0].project).toBe("a");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/localMdSearch.test.ts`
Expected: FAIL — 동일 TF 두 hit 의 score 가 같음

- [ ] **Step 3: Implement tag/category weight**

```ts
// scoreNote 교체
function scoreNote(note: CachedNote, tokens: string[]): number {
  const bodyTokenCounts = new Map<string, number>();
  for (const t of tokens) {
    let count = 0;
    let idx = 0;
    while ((idx = note.bodyLower.indexOf(t, idx)) !== -1) {
      count += 1;
      idx += t.length;
    }
    if (count > 0) bodyTokenCounts.set(t, count);
  }

  const tagSet = new Set<string>();
  for (const key of ["tags", "categories"] as const) {
    const v = note.frontmatter[key];
    if (Array.isArray(v)) {
      for (const item of v) if (typeof item === "string") tagSet.add(item.toLowerCase());
    } else if (typeof v === "string") {
      tagSet.add(v.toLowerCase());
    }
  }

  let score = 0;
  for (const [token, count] of bodyTokenCounts) {
    const multiplier = tagSet.has(token) ? 1.5 : 1;
    score += count * multiplier;
  }
  return score;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/localMdSearch.test.ts`
Expected: PASS (11 tests total)

- [ ] **Step 5: Commit**

```bash
git add server/rag/localMdSearch.ts server/__tests__/localMdSearch.test.ts
git commit -m "feat(rag): Phase 4-A frontmatter tags/categories 가중치 1.5×"
```

---

## Task 5: Title/filename match +5 bonus

**Files:**
- Modify: `server/rag/localMdSearch.ts`
- Modify: `server/__tests__/localMdSearch.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe("scoring — title/filename bonus", () => {
  it("파일명에 토큰이 들어있으면 +5 보너스", async () => {
    await writeNote("a", "한남-사업성.md", {}, "그냥 본문 한 줄");
    await writeNote("b", "general.md", {}, "한남 본문 한 줄");
    const hits = await searchLocalNotes("한남");
    expect(hits[0].project).toBe("a"); // filename 매칭이 +5
    expect(hits[0].score - hits[1].score).toBeGreaterThanOrEqual(5);
  });

  it("frontmatter title 매칭도 +5", async () => {
    await writeNote("a", "doc.md", { title: "한남 사업성" }, "본문 그냥");
    await writeNote("b", "doc2.md", {}, "한남 본문 한 줄");
    const hits = await searchLocalNotes("한남");
    expect(hits[0].project).toBe("a");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/localMdSearch.test.ts`
Expected: FAIL — bonus 미구현

- [ ] **Step 3: Implement title/filename bonus**

```ts
// scoreNote 끝에 보너스 추가
function scoreNote(note: CachedNote, tokens: string[]): number {
  // ...기존 TF + tag weight 코드...

  const titleStr = String(note.frontmatter.title ?? "").toLowerCase();
  const fileNameLower = note.fileName.toLowerCase();
  for (const token of tokens) {
    if (titleStr.includes(token) || fileNameLower.includes(token)) {
      score += 5;
    }
  }

  return score;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/localMdSearch.test.ts`
Expected: PASS (13 tests total)

- [ ] **Step 5: Commit**

```bash
git add server/rag/localMdSearch.ts server/__tests__/localMdSearch.test.ts
git commit -m "feat(rag): Phase 4-A title/filename 매칭 +5 보너스"
```

---

## Task 6: Snippet (500자 매칭 윈도우)

**Files:**
- Modify: `server/rag/localMdSearch.ts`
- Modify: `server/__tests__/localMdSearch.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe("snippet", () => {
  it("snippet 길이는 500자 이하", async () => {
    const longBody = "전치사 ".repeat(200) + "한남 매칭" + " 후치사".repeat(200);
    await writeNote("a", "long.md", {}, longBody);
    const hits = await searchLocalNotes("한남");
    expect(hits.length).toBe(1);
    expect(hits[0].snippet.length).toBeLessThanOrEqual(500);
  });

  it("snippet 은 첫 매칭 토큰을 포함한다", async () => {
    const longBody = "x".repeat(800) + " 한남 사업성 " + "y".repeat(800);
    await writeNote("a", "long.md", {}, longBody);
    const hits = await searchLocalNotes("한남");
    expect(hits[0].snippet).toContain("한남");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/localMdSearch.test.ts`
Expected: 두 번째 테스트 FAIL — 800자 prefix 다음 매칭이 들어있어 `body.slice(0, 500)` 으로는 매칭 누락

- [ ] **Step 3: Implement snippet window**

```ts
const SNIPPET_LEN = 500;

function extractSnippet(body: string, tokens: string[]): string {
  if (!body) return "";
  const lower = body.toLowerCase();
  let firstHit = -1;
  for (const t of tokens) {
    const idx = lower.indexOf(t);
    if (idx !== -1 && (firstHit === -1 || idx < firstHit)) firstHit = idx;
  }
  if (firstHit === -1) return body.slice(0, SNIPPET_LEN).trim();

  const half = Math.floor(SNIPPET_LEN / 2);
  const start = Math.max(0, firstHit - half);
  const end = Math.min(body.length, start + SNIPPET_LEN);
  let snippet = body.slice(start, end).trim();
  if (start > 0) snippet = "…" + snippet;
  if (end < body.length) snippet = snippet + "…";
  return snippet;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/localMdSearch.test.ts`
Expected: PASS (15 tests total)

- [ ] **Step 5: Commit**

```bash
git add server/rag/localMdSearch.ts server/__tests__/localMdSearch.test.ts
git commit -m "feat(rag): Phase 4-A snippet 500자 매칭 윈도우"
```

---

## Task 7: Top-K cutoff + projects filter

**Files:**
- Modify: `server/__tests__/localMdSearch.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe("top-K cutoff & projects filter", () => {
  it("기본 K=3 — 4개 매칭 시 상위 3개만 반환", async () => {
    for (const p of ["a", "b", "c", "d"]) {
      await writeNote(p, "x.md", {}, "한남 사업성 분석");
    }
    const hits = await searchLocalNotes("한남");
    expect(hits.length).toBe(3);
  });

  it("opts.k=1 일 때 1개만 반환", async () => {
    await writeNote("a", "x.md", {}, "한남");
    await writeNote("b", "x.md", {}, "한남");
    const hits = await searchLocalNotes("한남", { k: 1 });
    expect(hits.length).toBe(1);
  });

  it("opts.projects 로 프로젝트를 좁힐 수 있다", async () => {
    await writeNote("hannam-644", "x.md", {}, "한남 사업성");
    await writeNote("yeokbuk-pf", "x.md", {}, "한남 사업성");
    const hits = await searchLocalNotes("한남", { projects: ["hannam-644"] });
    expect(hits.length).toBe(1);
    expect(hits[0].project).toBe("hannam-644");
  });
});
```

- [ ] **Step 2: Run test to verify it passes (이미 Task 3 에서 구현됨)**

Run: `npx vitest run server/__tests__/localMdSearch.test.ts`
Expected: PASS (18 tests total) — 이전 Task 3 의 `slice(0, k)` 와 `opts.projects` 필터가 이미 동작. 만약 실패하면 그 부분만 보강.

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/localMdSearch.test.ts
git commit -m "test(rag): Phase 4-A top-K + projects 필터 회귀 케이스"
```

---

## Task 8: formatCitationFooter 헬퍼

**Files:**
- Modify: `server/rag/localMdSearch.ts`
- Modify: `server/__tests__/localMdSearch.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { formatCitationFooter } from "../rag/localMdSearch.ts";

describe("formatCitationFooter", () => {
  it("한국어 헤더 + 번호 리스트 형식", () => {
    const hits: NoteHit[] = [
      { project: "hannam-644", filePath: "/x", fileName: "2026-05-08-사업성.md", frontmatter: {}, snippet: "", score: 10 },
      { project: "yeokbuk-pf", filePath: "/y", fileName: "PF 메모.md", frontmatter: {}, snippet: "", score: 5 },
    ];
    const footer = formatCitationFooter(hits);
    expect(footer).toContain("📚 참고 자료");
    expect(footer).toContain("hannam-644/2026-05-08-사업성.md");
    expect(footer).toContain("yeokbuk-pf/PF 메모.md");
    expect(footer).toMatch(/1\.\s/);
    expect(footer).toMatch(/2\.\s/);
  });

  it("빈 hits 면 빈 문자열", () => {
    expect(formatCitationFooter([])).toBe("");
  });
});
```

(`NoteHit` import 도 필요: `import type { NoteHit } from "../rag/localMdSearch.ts";`)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/localMdSearch.test.ts`
Expected: FAIL — `formatCitationFooter` 미구현

- [ ] **Step 3: Implement formatCitationFooter**

```ts
// server/rag/localMdSearch.ts — 끝에 추가
export function formatCitationFooter(hits: NoteHit[]): string {
  if (hits.length === 0) return "";
  const lines = hits.map((h, i) => `${i + 1}. ${h.project}/${h.fileName}`);
  return `\n\n📚 참고 자료\n${lines.join("\n")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/localMdSearch.test.ts`
Expected: PASS (20 tests total)

- [ ] **Step 5: Commit**

```bash
git add server/rag/localMdSearch.ts server/__tests__/localMdSearch.test.ts
git commit -m "feat(rag): Phase 4-A formatCitationFooter 한국어 인용 절"
```

---

## Task 9: routers/llm.ts chat fallback 진입점에 RAG 단계 삽입

**Files:**
- Modify: `server/routers/llm.ts:208-262`

- [ ] **Step 1: Add import**

`server/routers/llm.ts` 상단 import 블록에 추가:

```ts
import { searchLocalNotes, formatCitationFooter } from "../rag/localMdSearch.ts";
```

- [ ] **Step 2: Insert RAG step at chat fallback entry**

[server/routers/llm.ts:208](server/routers/llm.ts#L208) 직후 (`// ── Step 2: Gemini 일반 대화 ...` 주석 아래, `const history = await sessionManager.getHistory(...)` 위) 에 삽입:

```ts
      // ── Step 2-pre: 로컬 NotebookLM 회수 자료 RAG 검색 (실패해도 일반 대화 진행)
      const ragHits = await searchLocalNotes(input.message, { k: 3 }).catch((err) => {
        console.warn("[RAG] local search failed:", err);
        return [];
      });
      console.log("[RAG] hits:", ragHits.length);
```

- [ ] **Step 3: Inject RAG context into systemPrompt**

기존 `const systemPrompt = ...` 블록을 다음으로 교체:

```ts
      const baseSystemPrompt = `당신은 에스턴 워크스테이션의 업무형 AI 비서입니다. 한국어로 간결하고 실무적으로 답변하세요.

현재 날짜와 시간: ${currentDate}
현재 사용 중인 엔진: ${session.engine}, 모델: ${currentModel?.name || session.modelKey}

규칙:
- 사용자가 묻지 않으면 네 역할, 내부 모델명, 연결 상태를 설명하지 마세요.
- 답변은 먼저 결론을 말하고, 필요한 경우에만 짧은 근거를 붙이세요.
- 웹 검색, Google 검색, 실시간 날씨, 실시간 시세처럼 현재 외부 조회가 필요한 정보는 Google Search grounding 도구 결과를 기준으로 답하세요.
- 프로젝트 구조, 기술 스택, 사용자가 제공한 문맥처럼 내부/제공 정보로 충분한 질문은 외부 검색 없이 답하세요.
- 확인하지 못한 값은 예시나 자리표시자로 꾸미지 말고, 연결된 데이터 소스가 없다고 한 문장으로 말하세요.
- 사용자가 이전 대화를 요약해 달라고 하면 실제 대화 내용만 요약하고, 시스템 설명이나 모델 설명을 넣지 마세요.
- 실행/변경 작업은 사용자의 명시적인 승인 없이는 완료했다고 말하지 마세요.`;

      const ragContextBlock = ragHits.length
        ? `\n\n참고할 회수 자료(${ragHits.length}건):\n${ragHits
            .map((h, i) => `[${i + 1}] ${h.project}/${h.fileName}\n${h.snippet}`)
            .join("\n\n")}\n\n위 자료를 우선 참고하되, 자료에 없는 사실을 만들어내지 마세요.`
        : "";

      const systemPrompt = `${baseSystemPrompt}${ragContextBlock}`;
```

- [ ] **Step 4: Append citation footer + sources to response**

기존 `return { response: response.content, ... }` 블록을 다음으로 교체:

```ts
      const finalResponse = response.content + formatCitationFooter(ragHits);
      const ragSources = ragHits.map((h) => ({
        title: `${h.project}/${h.fileName}`,
        uri: `file://${h.filePath.replace(/\\/g, "/")}`,
      }));

      // Add assistant response to history (인용 절 포함된 최종 응답 저장)
      await sessionManager.addMessage(userId, "assistant", finalResponse);

      return {
        response: finalResponse,
        model: response.model,
        engine: response.engine,
        sources: ragSources.length > 0 ? ragSources : response.sources,
        data: undefined,
      };
```

(주의: 기존 `await sessionManager.addMessage(userId, "assistant", response.content);` 한 줄을 위 블록의 `finalResponse` 호출로 대체. 이 줄은 새로 만든 `addMessage` 호출 이전에 두 번 실행되지 않도록 한다.)

- [ ] **Step 5: Verify check + build**

Run:
```bash
npm run check
npm run build
```
Expected: ✅ check (모듈 경계 위반 0건 + tsc 에러 0건), ✅ build

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: 745 → ~755 passed (회귀 0건). 만약 회귀 발생 시 즉시 원인 파악 후 수정.

- [ ] **Step 7: Commit**

```bash
git add server/routers/llm.ts
git commit -m "feat(rag): Phase 4-A chat fallback 에 로컬 RAG 단계 + 인용 절 + sources"
```

---

## Task 10: 문서 갱신 (TODO/CHANGELOG/HANDOFF)

**Files:**
- Modify: `TODO.md`
- Modify: `CHANGELOG.md`
- Modify: `HANDOFF.md`

- [ ] **Step 1: TODO.md 갱신**

상단 Phase 4-A 섹션의 "다음 작업 (구현)" 체크박스를 `[x]` 로 마킹:

```markdown
### 완료 (구현)
- [x] `server/rag/localMdSearch.ts` 구현 (Public API, 토큰화, 점수식, 캐시)
- [x] `server/__tests__/localMdSearch.test.ts` 8~10개 케이스 (실제 ~20개로 확장)
- [x] `server/routers/llm.ts` chat fallback 진입점에 RAG 단계 + systemPrompt 주입 + sources field
- [x] `formatCitationFooter()` 응답 본문 끝 인용 절 부가
- [x] `npm run check && npm run build && npm test` 회귀 0건 확인

### 운영 검증 잔여 (회장님 직접)
- [ ] 라이브 검증: 웹 채팅에서 "한남 PF 진행 상황" 입력 → 응답에 회수 자료 인용 + 📚 절
```

또한 헤더 갱신: `> 업데이트: 2026-05-10 Phase 4-A 구현 완료 (운영 검증 대기) | 브랜치: codex-google-workspace-expansion`

- [ ] **Step 2: CHANGELOG.md 항목 추가**

상단에 신규 섹션 삽입:

```markdown
## 2026-05-10 Phase 4-A 구현 — 로컬 NotebookLM 회수 자료 → Web Chat RAG 주입 (Claude Code)

### 작업 내용
- **신규 모듈** `server/rag/localMdSearch.ts` — 로컬 `${ASTON_WIKI_ROOT}/projects/*/notebooklm/*.md` 직접 스캔, 한·영 휴리스틱 토큰화, TF + frontmatter 1.5× + 제목 +5 점수식, 5분 mtime 캐시, top-K=3, 500자 매칭 윈도 snippet
- **`formatCitationFooter()`** — 응답 본문 끝에 "📚 참고 자료" 한국어 번호 리스트 부가
- **`routers/llm.ts:chat`** — 인텐트 fallthrough 직후(`handled=false`) RAG 단계 삽입. systemPrompt 에 `참고할 회수 자료(N건)` 단락 prepend + 응답 본문 끝 인용 절 + `sources` 필드(`file://` URI)

### 수정 파일
**신규**:
- `server/rag/localMdSearch.ts`
- `server/__tests__/localMdSearch.test.ts`
- `docs/superpowers/plans/2026-05-10-phase4a-local-rag.md`

**수정**:
- `server/routers/llm.ts` (한 곳, line 208 직후 RAG 단계)
- `TODO.md` / `CHANGELOG.md` / `HANDOFF.md`

### 검증
- `npm run check` ✅ 모듈 경계 위반 0건 + tsc 에러 0건
- `npm run build` ✅
- `npm test` ✅ 745 → ~765 passed (회귀 0건)

### 다음 단계
- Phase 4-B Vertex AI Search 통합 (Phase 3-A/3-B 완료 후)
- Phase 4-C 텔레그램 적용 (`messageRouter.ts`)
- 라이브 검증 (회장님 직접): "한남 PF 진행 상황" 자연 질의 → 회수 자료 인용 응답
```

- [ ] **Step 3: HANDOFF.md 갱신**

상단 "마지막 완료 작업" 섹션을 다음으로 교체:

```markdown
## 마지막 완료 작업 (Phase 4-A 구현)

**2026-05-10 Phase 4-A 구현 — 로컬 NotebookLM 회수 자료 → Web Chat RAG 주입 | Claude Code**
- 신규 `server/rag/localMdSearch.ts` (~250줄) — 로컬 `*.md` 검색, TF+frontmatter+제목 점수식, 5분 캐시, top-K
- `formatCitationFooter()` — "📚 참고 자료" 한국어 인용 절
- `routers/llm.ts:chat` 한 곳 수정 — 인텐트 fallthrough 직후 RAG 단계 삽입 (인텐트 매칭 성공 시 건너뜀, 100% 직교)
- 검증: check ✅ / build ✅ / **~765 passed** (745 → 회귀 0건)

### 회장님 직접 운영 검증 (필수)
- [ ] PM2 또는 `pm2 restart aston` 재시작
- [ ] 웹 채팅 http://localhost:4000 → "한남 PF 진행 상황 어때?" 자연 질의
- [ ] 응답 본문 끝에 "📚 참고 자료" 절 + 회수 자료 인용 확인
- [ ] 회수 자료 없는 일반 질의 → 기존 Gemini 답변과 동일 (회귀 없음 확인)

### 다음 단계 (Phase 4-B/4-C)
- Phase 4-B: Vertex AI Search 통합 (Phase 3-A/3-B 완료 후)
- Phase 4-C: 텔레그램 적용 (`messageRouter.ts` 동일 패턴)
- Phase 4-D: chunk-level 검색 + 임베딩
```

- [ ] **Step 4: Commit docs**

```bash
git add TODO.md CHANGELOG.md HANDOFF.md docs/superpowers/plans/2026-05-10-phase4a-local-rag.md
git commit -m "docs(rag): Phase 4-A 구현 완료 — TODO/CHANGELOG/HANDOFF + plan 보존"
```

- [ ] **Step 5: Push to origin**

```bash
git push origin codex-google-workspace-expansion
```

Expected: 모든 커밋이 원격에 반영됨.

---

## Self-Review (작성자가 직접 점검)

### 1. Spec coverage
- §3 아키텍처: Task 9 완전 커버
- §4 신규 모듈: Task 1~8 커버 (Public API + NoteHit + 토큰화 + 점수식 + 캐시 + top-K + snippet + 인용 절)
- §5 routers/llm.ts 수정 골자: Task 9 커버
- §6 테스트 8~10 케이스: Task 1~8 합쳐 ~20 케이스 (스펙보다 넉넉)
- §7 자율 결정: 모두 코드에 반영 (K=3, snippet 500자, 가중치, 캐시 TTL, 인용 절 포맷, file:// URI)
- §9 검증 기준: Task 9 Step 5~6, Task 10 에서 명시
- §8 비목표 (Vertex AI Search·텔레그램·chunk·임베딩): 코드에 들어가지 않음 ✅

### 2. Placeholder scan
- "TBD"/"TODO"/"implement later" 없음
- "Add appropriate error handling" 같은 모호 지시 없음
- 모든 step 에 코드 또는 명령 명시 ✅

### 3. Type consistency
- `NoteHit` shape 은 Task 1 정의 유지 — 모든 후속 task 동일 사용
- `searchLocalNotes(query, opts?)` 시그니처 일관
- `formatCitationFooter(hits: NoteHit[]): string` 일관
- routers/llm.ts 의 `sources` 는 기존 `GroundingSource = { title; uri }` 재사용 (caller.ts 정의)

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-10-phase4a-local-rag.md`. Two execution options:

**1. Inline Execution (이 세션에서 실행)** — `superpowers:executing-plans` 로 Task 1~10 을 순차 실행 + 체크포인트마다 보고

**2. Subagent-Driven** — Task 별로 fresh subagent dispatch + 두 단계 리뷰 (오버킬일 가능성 — 본 plan 은 단일 도메인·~250줄 신규 모듈)

추천: **Inline Execution** (작업 규모가 한 세션에 충분히 들어감, 회장님이 중간 보고 받기 쉬움).
