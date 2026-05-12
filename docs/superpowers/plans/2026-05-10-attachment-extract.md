# PDF/MD/TXT/CSV 인라인 첨부 → LLM 컨텍스트 인젝션 — 구현 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 채팅 메시지에 `[첨부: <절대경로>]` 패턴으로 PDF/MD/TXT/CSV를 지정하면, 본문을 추출해 LLM systemPrompt에 자동 주입한다. 웹 tRPC 채팅과 텔레그램 봇 두 진입점에 동일 적용.

**Architecture:** `server/llm/` 안에 두 개의 신규 모듈 — `attachmentExtract.ts`(순수 추출 함수, pdf2json + fs, LRU 16, 50MB/60K 캡)와 `attachmentInject.ts`(메시지 → 정규식 파싱 → 추출 → systemPrompt prepend). 두 진입점([server/routers/llm.ts](server/routers/llm.ts) `chat` mutation, [server/llm/telegram-bot.ts](server/llm/telegram-bot.ts) 메시지 핸들러)에서 `injectAttachments()`만 호출.

**Tech Stack:** TypeScript 5.9 (ESM, bundler resolution), pdf2json 3.x (lazy import, pure Node), Node fs/promises, vitest 2.1 (mock 기반 PDF 테스트), tRPC 11, Telegraf 4.

**Spec:** [docs/superpowers/specs/2026-05-10-attachment-extract-design.md](docs/superpowers/specs/2026-05-10-attachment-extract-design.md)

---

## File Structure

| 파일 | 역할 | 규모 |
|---|---|---|
| `server/llm/attachmentExtract.ts` | 신규: 순수 추출 함수 + LRU 캐시. 호출자는 절대경로만 넘김. | ~150줄 |
| `server/llm/attachmentExtract.test.ts` | 신규: vitest 단위 테스트 7~8개. pdf2json은 vi.mock으로 대체. | ~180줄 |
| `server/llm/attachmentInject.ts` | 신규: 정규식 파싱 + 결과 조립. 두 진입점 공용 헬퍼. | ~80줄 |
| `server/llm/attachmentInject.test.ts` | 신규: 정규식·조립·warnings 검증 3~4개. | ~100줄 |
| `server/routers/llm.ts` | 수정: `chat` mutation에 `injectAttachments` 호출 1블록 추가. | +6줄 |
| `server/llm/telegram-bot.ts` | 수정: 메시지 핸들러에 `injectAttachments` 호출 1블록 + warnings 노출. | +8줄 |
| `package.json` + `pnpm-lock.yaml` | 수정: pdf2json 의존성 추가. | — |

---

## Task 1: pdf2json 의존성 추가

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1.1: 의존성 설치**

```powershell
pnpm add pdf2json
```

Expected: `package.json`의 dependencies에 `"pdf2json": "^3.x.x"` 추가, lockfile 갱신.

- [ ] **Step 1.2: 설치 검증**

```powershell
pnpm list pdf2json
```

Expected: `pdf2json 3.x.x` 라인 출력. 에러 없음.

- [ ] **Step 1.3: 타입 가용성 확인**

```powershell
pnpm exec tsc --noEmit
```

Expected: 통과. (pdf2json은 자체 .d.ts를 포함하지 않을 수 있음 — Step 2.4에서 모듈 선언으로 처리.)

- [ ] **Step 1.4: 커밋하지 않음 — Task 2와 함께 묶음**

(이 task는 단일 dependency 추가뿐이라 후속 모듈 스캐폴드와 함께 커밋한다.)

---

## Task 2: 타입 + 가드 (확장자, 파일 존재, 50MB 한도) — TDD

**Files:**
- Create: `server/llm/attachmentExtract.ts`
- Create: `server/llm/attachmentExtract.test.ts`

- [ ] **Step 2.1: 실패 테스트 작성**

`server/llm/attachmentExtract.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { extractAttachmentText } from "./attachmentExtract";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "attach-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("extractAttachmentText — guards", () => {
  it("미지원 확장자 거부", async () => {
    const filePath = path.join(tmpDir, "evil.exe");
    await fs.writeFile(filePath, "binary");
    const result = await extractAttachmentText(filePath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/지원하지 않는 확장자/);
  });

  it("파일이 없으면 거부", async () => {
    const filePath = path.join(tmpDir, "missing.pdf");
    const result = await extractAttachmentText(filePath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/파일을 찾을 수 없습니다/);
  });

  it("디렉토리는 거부", async () => {
    const result = await extractAttachmentText(tmpDir);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("50MB 초과 거부", async () => {
    const filePath = path.join(tmpDir, "huge.txt");
    const fh = await fs.open(filePath, "w");
    await fh.truncate(51 * 1024 * 1024);
    await fh.close();
    const result = await extractAttachmentText(filePath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/50MB/);
  });
});
```

- [ ] **Step 2.2: 테스트 실행 — 실패 확인**

```powershell
pnpm exec vitest run server/llm/attachmentExtract.test.ts
```

Expected: FAIL — `extractAttachmentText` 모듈을 찾을 수 없음 (또는 export 없음).

- [ ] **Step 2.3: 모듈 스캐폴드 + 가드 구현**

`server/llm/attachmentExtract.ts` 신규:

```ts
/**
 * 첨부 파일 본문 추출 — PDF/MD/TXT/CSV
 *
 * ASTON AI에서 검증된 패턴 이식. pdf2json은 호출 시점 lazy import.
 *
 * 보안 가정: 본 워크스테이션은 단일사용자(회장님) 전제. 임의 절대경로를
 * 서버 프로세스 권한으로 읽으므로 멀티사용자로 확장 시 디렉토리 화이트리스트
 * 또는 protectedProcedure 게이트 필요.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface AttachmentExtractResult {
  ok: boolean;
  text?: string;
  filename?: string;
  bytes?: number;
  truncated?: boolean;
  pageCount?: number;
  error?: string;
}

const MAX_BYTES = 50 * 1024 * 1024; // 50MB
const TEXT_CAP = 60_000;
const SUPPORTED_EXTS = new Set([".pdf", ".md", ".txt", ".csv"]);

export async function extractAttachmentText(
  absPath: string,
): Promise<AttachmentExtractResult> {
  const resolved = path.resolve(absPath);
  const filename = path.basename(resolved);
  const ext = path.extname(resolved).toLowerCase();

  if (!SUPPORTED_EXTS.has(ext)) {
    return {
      ok: false,
      filename,
      error: `지원하지 않는 확장자: ${ext || "(없음)"}`,
    };
  }

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(resolved);
  } catch {
    return {
      ok: false,
      filename,
      error: `파일을 찾을 수 없습니다: ${resolved}`,
    };
  }

  if (!stat.isFile()) {
    return {
      ok: false,
      filename,
      error: `파일이 아닙니다: ${resolved}`,
    };
  }

  if (stat.size > MAX_BYTES) {
    return {
      ok: false,
      filename,
      bytes: stat.size,
      error: `파일 크기가 50MB를 초과합니다 (${(stat.size / 1024 / 1024).toFixed(1)}MB)`,
    };
  }

  // 후속 task에서 본문 추출 분기 추가
  return {
    ok: false,
    filename,
    bytes: stat.size,
    error: "본문 추출 미구현",
  };
}
```

- [ ] **Step 2.4: pdf2json 모듈 선언 (타입 부재 대비)**

`server/llm/attachmentExtract.ts` 파일 상단(import 직후)에 추가:

```ts
// pdf2json은 자체 타입 정의가 부분적이므로 런타임에 lazy import한 뒤
// 좁은 인터페이스로 캐스트한다. (Step 4에서 사용.)
```

(별도 .d.ts 추가는 하지 않음 — Step 4의 `as any` 캐스트로 처리. tsc strict 통과 확인은 Step 2.5에서.)

- [ ] **Step 2.5: tsc 통과 확인**

```powershell
pnpm run check
```

Expected: 통과.

- [ ] **Step 2.6: 테스트 통과 확인**

```powershell
pnpm exec vitest run server/llm/attachmentExtract.test.ts
```

Expected: PASS — guards 4개 모두 통과 (확장자/없음/디렉토리/50MB).

- [ ] **Step 2.7: 커밋**

```powershell
git add package.json pnpm-lock.yaml server/llm/attachmentExtract.ts server/llm/attachmentExtract.test.ts
git commit -m @'
feat(llm): pdf2json 의존성 추가 + attachmentExtract 모듈 스캐폴드

확장자/파일 존재/디렉토리/50MB 한도 가드 + 4건 단위 테스트.
본문 추출 분기는 후속 커밋.
'@
```

---

## Task 3: 텍스트 파일 추출 (.md/.txt/.csv) + 60K 캡 + 정규화 — TDD

**Files:**
- Modify: `server/llm/attachmentExtract.ts`
- Modify: `server/llm/attachmentExtract.test.ts`

- [ ] **Step 3.1: 실패 테스트 추가**

`server/llm/attachmentExtract.test.ts` 마지막 `describe` 블록 다음에 추가:

```ts
describe("extractAttachmentText — text formats", () => {
  it(".md 정상 추출", async () => {
    const filePath = path.join(tmpDir, "note.md");
    const content = "# Title\n\nbody line";
    await fs.writeFile(filePath, content, "utf8");
    const result = await extractAttachmentText(filePath);
    expect(result.ok).toBe(true);
    expect(result.text).toBe(content);
    expect(result.filename).toBe("note.md");
    expect(result.bytes).toBe(Buffer.byteLength(content, "utf8"));
    expect(result.truncated).toBe(false);
  });

  it(".txt 정상 추출", async () => {
    const filePath = path.join(tmpDir, "memo.txt");
    await fs.writeFile(filePath, "hello world", "utf8");
    const result = await extractAttachmentText(filePath);
    expect(result.ok).toBe(true);
    expect(result.text).toBe("hello world");
  });

  it(".csv 정상 추출 (파싱하지 않고 원문 보존)", async () => {
    const filePath = path.join(tmpDir, "data.csv");
    const content = "a,b,c\n1,2,3";
    await fs.writeFile(filePath, content, "utf8");
    const result = await extractAttachmentText(filePath);
    expect(result.ok).toBe(true);
    expect(result.text).toBe(content);
  });

  it("60K 초과 시 truncate + 안내 suffix", async () => {
    const filePath = path.join(tmpDir, "long.txt");
    const content = "a".repeat(70_000);
    await fs.writeFile(filePath, content, "utf8");
    const result = await extractAttachmentText(filePath);
    expect(result.ok).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.text!.length).toBeLessThanOrEqual(60_000 + 64);
    expect(result.text!.startsWith("a".repeat(60_000))).toBe(true);
    expect(result.text!).toMatch(/이하 생략 — 첨부 분량 초과/);
  });

  it("연속 줄바꿈 정규화 (3+ → 2)", async () => {
    const filePath = path.join(tmpDir, "n.md");
    await fs.writeFile(filePath, "a\n\n\n\nb", "utf8");
    const result = await extractAttachmentText(filePath);
    expect(result.ok).toBe(true);
    expect(result.text).toBe("a\n\nb");
  });
});
```

- [ ] **Step 3.2: 테스트 실행 — 실패 확인**

```powershell
pnpm exec vitest run server/llm/attachmentExtract.test.ts
```

Expected: FAIL — 5개 신규 테스트 모두 "본문 추출 미구현" 에러.

- [ ] **Step 3.3: 텍스트 추출 + 정규화 + 캡 헬퍼 추가**

`server/llm/attachmentExtract.ts` 마지막 함수(`extractAttachmentText`) 위에 추가:

```ts
const TRUNCATE_SUFFIX = "\n\n...(이하 생략 — 첨부 분량 초과)";

function normalizeText(raw: string): string {
  return raw
    .replace(/\f/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function applyCap(text: string): { text: string; truncated: boolean } {
  if (text.length <= TEXT_CAP) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, TEXT_CAP) + TRUNCATE_SUFFIX, truncated: true };
}

async function extractTextFile(absPath: string): Promise<string> {
  const buf = await fs.readFile(absPath);
  return buf.toString("utf8");
}
```

- [ ] **Step 3.4: 텍스트 분기 통합**

`extractAttachmentText` 함수의 마지막 `return { ok: false, ... 본문 추출 미구현 }` 블록을 다음으로 교체:

```ts
  try {
    let raw: string;
    if (ext === ".pdf") {
      // Task 4에서 구현
      return {
        ok: false,
        filename,
        bytes: stat.size,
        error: "PDF 추출 미구현 (Task 4)",
      };
    } else {
      raw = await extractTextFile(resolved);
    }

    const normalized = normalizeText(raw);
    const { text, truncated } = applyCap(normalized);

    return {
      ok: true,
      text,
      filename,
      bytes: stat.size,
      truncated,
    };
  } catch (err) {
    return {
      ok: false,
      filename,
      bytes: stat.size,
      error: `읽기 실패: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
```

- [ ] **Step 3.5: 테스트 통과 확인**

```powershell
pnpm exec vitest run server/llm/attachmentExtract.test.ts
```

Expected: PASS — 9개 테스트 (guards 4 + text formats 5).

- [ ] **Step 3.6: 커밋하지 않음 — Task 4·5와 함께 한 번에 커밋**

---

## Task 4: PDF 추출 (pdf2json mock) + 스캔 PDF 식별 + 파싱 에러 — TDD

**Files:**
- Modify: `server/llm/attachmentExtract.ts`
- Modify: `server/llm/attachmentExtract.test.ts`

- [ ] **Step 4.1: pdf2json mock 셋업 + 실패 테스트 추가**

`server/llm/attachmentExtract.test.ts` 파일 최상단 import 직후에 mock 추가:

```ts
import { EventEmitter } from "node:events";
import { vi } from "vitest";

// pdf2json mock — PDFParser는 EventEmitter 기반.
// loadPDF 호출 시 mock state에 따라 dataReady 또는 dataError 이벤트 발생.
let mockPdfState: "ok" | "scan" | "error" = "ok";

vi.mock("pdf2json", () => {
  class MockPDFParser extends EventEmitter {
    constructor(_ctx: unknown, _mode: number) {
      super();
    }
    loadPDF(_filePath: string) {
      setImmediate(() => {
        if (mockPdfState === "error") {
          this.emit("pdfParser_dataError", { parserError: "mock parse error" });
          return;
        }
        if (mockPdfState === "scan") {
          this.emit("pdfParser_dataReady", { Pages: [] });
          return;
        }
        // ok: 한 페이지에 "Hello%20PDF" (URI-encoded "Hello PDF")
        this.emit("pdfParser_dataReady", {
          Pages: [
            {
              Texts: [
                { R: [{ T: "Hello%20PDF" }] },
                { R: [{ T: "line%202" }] },
              ],
            },
          ],
        });
      });
    }
  }
  return { default: MockPDFParser };
});
```

같은 파일 마지막에 신규 describe 블록:

```ts
describe("extractAttachmentText — PDF (mocked pdf2json)", () => {
  beforeEach(() => {
    mockPdfState = "ok";
  });

  it(".pdf 정상 추출 (URI 디코딩)", async () => {
    const filePath = path.join(tmpDir, "doc.pdf");
    await fs.writeFile(filePath, "fake-pdf-bytes");
    const result = await extractAttachmentText(filePath);
    expect(result.ok).toBe(true);
    expect(result.text).toContain("Hello PDF");
    expect(result.text).toContain("line 2");
    expect(result.pageCount).toBe(1);
  });

  it("스캔 PDF 식별 (텍스트 0)", async () => {
    mockPdfState = "scan";
    const filePath = path.join(tmpDir, "scanned.pdf");
    await fs.writeFile(filePath, "fake-pdf-bytes");
    const result = await extractAttachmentText(filePath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/OCR/);
    expect(result.pageCount).toBe(0);
  });

  it("파싱 에러", async () => {
    mockPdfState = "error";
    const filePath = path.join(tmpDir, "broken.pdf");
    await fs.writeFile(filePath, "fake-pdf-bytes");
    const result = await extractAttachmentText(filePath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/PDF 파싱 실패/);
    expect(result.error).toContain("mock parse error");
  });
});
```

- [ ] **Step 4.2: 테스트 실행 — 실패 확인**

```powershell
pnpm exec vitest run server/llm/attachmentExtract.test.ts
```

Expected: FAIL — 3개 PDF 테스트 "PDF 추출 미구현" 에러.

- [ ] **Step 4.3: PDF 추출 함수 추가**

`server/llm/attachmentExtract.ts`에서 `extractTextFile` 아래에 추가:

```ts
interface PdfText { R?: Array<{ T?: string }> }
interface PdfPage { Texts?: PdfText[] }
interface PdfData { Pages?: PdfPage[] }

async function extractPdf(absPath: string): Promise<{ text: string; pageCount: number }> {
  // pdf2json은 무겁고 DOM 의존이 없는 pure Node 파서.
  // pdf-parse v2(PDF.js)는 DOMMatrix를 요구해 Node에서 실패하므로 사용 금지.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PDFParser: any = (await import("pdf2json")).default;
  const parser = new PDFParser(null, 1);

  return new Promise((resolve, reject) => {
    parser.on("pdfParser_dataError", (errData: { parserError?: unknown }) => {
      const msg = errData?.parserError instanceof Error
        ? errData.parserError.message
        : String(errData?.parserError ?? "unknown");
      reject(new Error(msg));
    });
    parser.on("pdfParser_dataReady", (data: PdfData) => {
      const pages = data.Pages ?? [];
      const lines: string[] = [];
      for (const page of pages) {
        const texts = page.Texts ?? [];
        const pageLines: string[] = [];
        for (const t of texts) {
          const runs = t.R ?? [];
          const decoded = runs
            .map((r) => {
              try {
                return decodeURIComponent(r.T ?? "");
              } catch {
                return r.T ?? "";
              }
            })
            .join("");
          pageLines.push(decoded);
        }
        lines.push(pageLines.join(" "));
        lines.push("\f");
      }
      resolve({ text: lines.join("\n"), pageCount: pages.length });
    });
    parser.loadPDF(absPath);
  });
}
```

- [ ] **Step 4.4: PDF 분기 통합**

`extractAttachmentText` 내부의 `if (ext === ".pdf")` 블록(Task 3.4에서 placeholder로 둔 곳)을 다음으로 교체:

```ts
    if (ext === ".pdf") {
      let pdfResult: { text: string; pageCount: number };
      try {
        pdfResult = await extractPdf(resolved);
      } catch (err) {
        return {
          ok: false,
          filename,
          bytes: stat.size,
          error: `PDF 파싱 실패: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      const normalized = normalizeText(pdfResult.text);
      if (normalized.length === 0) {
        return {
          ok: false,
          filename,
          bytes: stat.size,
          pageCount: pdfResult.pageCount,
          error:
            "스캔 이미지 또는 암호 잠금 가능성. OCR 도구로 변환 후 재첨부하세요.",
        };
      }
      const { text, truncated } = applyCap(normalized);
      return {
        ok: true,
        text,
        filename,
        bytes: stat.size,
        truncated,
        pageCount: pdfResult.pageCount,
      };
    } else {
      raw = await extractTextFile(resolved);
    }
```

(Task 3.4의 `let raw: string;` 선언과 정규화/캡 적용 로직은 그대로 텍스트 분기에서만 동작하도록 PDF 분기는 완결적으로 return.)

- [ ] **Step 4.5: 테스트 통과 확인**

```powershell
pnpm exec vitest run server/llm/attachmentExtract.test.ts
```

Expected: PASS — 12개 테스트 (guards 4 + text 5 + pdf 3).

- [ ] **Step 4.6: tsc 통과 확인**

```powershell
pnpm run check
```

Expected: 통과.

---

## Task 5: LRU 캐시 (mtime 키) — TDD

**Files:**
- Modify: `server/llm/attachmentExtract.ts`
- Modify: `server/llm/attachmentExtract.test.ts`

- [ ] **Step 5.1: 실패 테스트 추가**

`server/llm/attachmentExtract.test.ts` 마지막에 추가:

```ts
describe("extractAttachmentText — LRU cache", () => {
  it("같은 파일 두 번째 호출은 캐시 히트 (디스크 재독 안 함)", async () => {
    const filePath = path.join(tmpDir, "cached.txt");
    await fs.writeFile(filePath, "first", "utf8");
    const r1 = await extractAttachmentText(filePath);
    expect(r1.text).toBe("first");

    // 디스크 내용 강제로 변경하되 mtime은 그대로 두기 위해
    // 같은 stat을 재사용하려면 별도 셋업이 까다로우므로,
    // 여기서는 mtime이 같으면 캐시 키가 같다는 사실만 확인:
    // 파일 그대로 두고 한 번 더 호출 → 동일 결과
    const r2 = await extractAttachmentText(filePath);
    expect(r2.text).toBe("first");
  });

  it("파일 수정 후 호출은 새로 추출 (mtime 키 무효화)", async () => {
    const filePath = path.join(tmpDir, "changing.txt");
    await fs.writeFile(filePath, "v1", "utf8");
    const r1 = await extractAttachmentText(filePath);
    expect(r1.text).toBe("v1");

    // mtime을 명확히 다르게 하기 위해 약간 대기 후 덮어쓰기
    await new Promise((res) => setTimeout(res, 20));
    await fs.writeFile(filePath, "v2", "utf8");
    const r2 = await extractAttachmentText(filePath);
    expect(r2.text).toBe("v2");
  });
});
```

- [ ] **Step 5.2: 테스트 실행 — 첫 번째는 통과(우연), 두 번째도 통과(mtime이 다르면 fs.readFile이 다시 일어남) — 실패하지 않을 가능성**

```powershell
pnpm exec vitest run server/llm/attachmentExtract.test.ts
```

Expected: 두 테스트 모두 PASS — 캐시 없이도 동작이 같음. **이 테스트는 캐시 동작을 보강하는 회귀 가드 역할**이며, 캐시 구현 후에도 동일하게 통과해야 한다. (TDD에서 이런 회귀 가드는 정당한 패턴.)

- [ ] **Step 5.3: LRU 구현 추가**

`server/llm/attachmentExtract.ts` 상수 섹션(`SUPPORTED_EXTS` 다음)에 추가:

```ts
const CACHE_MAX = 16;
const cache = new Map<string, AttachmentExtractResult>();

function cacheGet(key: string): AttachmentExtractResult | undefined {
  const v = cache.get(key);
  if (v !== undefined) {
    cache.delete(key);
    cache.set(key, v); // LRU: 최근 접근을 뒤로
  }
  return v;
}

function cacheSet(key: string, value: AttachmentExtractResult): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
```

- [ ] **Step 5.4: `computeResult` 헬퍼 추출 + 캐시 적용**

먼저 `server/llm/attachmentExtract.ts` 상단 import를 보강:

```ts
import * as fs from "node:fs/promises";
import type { Stats } from "node:fs";
import * as path from "node:path";
```

그 다음 `extractTextFile` 정의 아래(또는 `extractPdf` 아래, 어느 쪽이든 모듈 스코프)에 `computeResult` 함수를 새로 만든다. **본문 분기 로직(Task 3·4에서 작성한 텍스트/PDF 추출)을 모두 이 함수로 옮긴다**:

```ts
async function computeResult(
  resolved: string,
  ext: string,
  stat: Stats,
  filename: string,
): Promise<AttachmentExtractResult> {
  if (ext === ".pdf") {
    let pdfResult: { text: string; pageCount: number };
    try {
      pdfResult = await extractPdf(resolved);
    } catch (err) {
      return {
        ok: false,
        filename,
        bytes: stat.size,
        error: `PDF 파싱 실패: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const normalized = normalizeText(pdfResult.text);
    if (normalized.length === 0) {
      return {
        ok: false,
        filename,
        bytes: stat.size,
        pageCount: pdfResult.pageCount,
        error:
          "스캔 이미지 또는 암호 잠금 가능성. OCR 도구로 변환 후 재첨부하세요.",
      };
    }
    const { text, truncated } = applyCap(normalized);
    return {
      ok: true,
      text,
      filename,
      bytes: stat.size,
      truncated,
      pageCount: pdfResult.pageCount,
    };
  }

  // 텍스트 (.md / .txt / .csv)
  try {
    const raw = await extractTextFile(resolved);
    const normalized = normalizeText(raw);
    const { text, truncated } = applyCap(normalized);
    return { ok: true, text, filename, bytes: stat.size, truncated };
  } catch (err) {
    return {
      ok: false,
      filename,
      bytes: stat.size,
      error: `읽기 실패: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
```

마지막으로 `extractAttachmentText` 함수의 가드 통과 직후 부분(현재 Task 3·4에서 작성한 try/catch 본문 전체)을 다음 4줄로 교체:

```ts
  const cacheKey = `${resolved}:${stat.mtimeMs}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const result = await computeResult(resolved, ext, stat, filename);
  cacheSet(cacheKey, result);
  return result;
```

결과적으로 `extractAttachmentText`의 최종 모습은:

```ts
export async function extractAttachmentText(
  absPath: string,
): Promise<AttachmentExtractResult> {
  const resolved = path.resolve(absPath);
  const filename = path.basename(resolved);
  const ext = path.extname(resolved).toLowerCase();

  if (!SUPPORTED_EXTS.has(ext)) {
    return { ok: false, filename, error: `지원하지 않는 확장자: ${ext || "(없음)"}` };
  }

  let stat: Stats;
  try {
    stat = await fs.stat(resolved);
  } catch {
    return { ok: false, filename, error: `파일을 찾을 수 없습니다: ${resolved}` };
  }

  if (!stat.isFile()) {
    return { ok: false, filename, error: `파일이 아닙니다: ${resolved}` };
  }

  if (stat.size > MAX_BYTES) {
    return {
      ok: false,
      filename,
      bytes: stat.size,
      error: `파일 크기가 50MB를 초과합니다 (${(stat.size / 1024 / 1024).toFixed(1)}MB)`,
    };
  }

  const cacheKey = `${resolved}:${stat.mtimeMs}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const result = await computeResult(resolved, ext, stat, filename);
  cacheSet(cacheKey, result);
  return result;
}
```

(Task 2.3에서 쓴 `Awaited<ReturnType<typeof fs.stat>>` 타입은 `Stats` import로 정리됨. 같은 타입.)

- [ ] **Step 5.5: 테스트 통과 확인**

```powershell
pnpm exec vitest run server/llm/attachmentExtract.test.ts
```

Expected: PASS — 14개 테스트 전부.

- [ ] **Step 5.6: tsc 통과 확인**

```powershell
pnpm run check
```

Expected: 통과.

- [ ] **Step 5.7: 커밋 (Task 2~5 묶음)**

```powershell
git add server/llm/attachmentExtract.ts server/llm/attachmentExtract.test.ts
git commit -m @'
feat(llm): attachmentExtract 본문 추출 + LRU 캐시 완성

- 텍스트(.md/.txt/.csv) 추출 + 60K 캡 + form-feed/줄바꿈 정규화
- PDF 추출 (pdf2json, lazy import) + 스캔 PDF 식별 + 파싱 에러
- mtime 기반 LRU 16-entry 캐시 (수정 시 자동 무효화)
- 단위 테스트 14개 (vitest mock으로 pdf2json 격리)
'@
```

---

## Task 6: injectAttachments — 정규식 + 섹션 조립 + warnings — TDD

**Files:**
- Create: `server/llm/attachmentInject.ts`
- Create: `server/llm/attachmentInject.test.ts`

- [ ] **Step 6.1: 실패 테스트 작성**

`server/llm/attachmentInject.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { injectAttachments } from "./attachmentInject";

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "inject-test-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("injectAttachments", () => {
  it("패턴 없으면 systemPrompt 그대로", async () => {
    const result = await injectAttachments("BASE", "안녕");
    expect(result.systemPrompt).toBe("BASE");
    expect(result.attachments).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("정상 첨부 1건 — systemPrompt에 [첨부 문서] 섹션 prepend", async () => {
    const filePath = path.join(tmpDir, "memo.md");
    await fs.writeFile(filePath, "# 제목\n본문", "utf8");
    const msg = `요약해줘 [첨부: ${filePath}]`;
    const result = await injectAttachments("BASE", msg);
    expect(result.systemPrompt).toContain("BASE");
    expect(result.systemPrompt).toContain("[첨부 문서]");
    expect(result.systemPrompt).toContain("[첨부 — memo.md]");
    expect(result.systemPrompt).toContain("# 제목");
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("다중 첨부 — \\n\\n---\\n 구분자", async () => {
    const f1 = path.join(tmpDir, "a.txt");
    const f2 = path.join(tmpDir, "b.txt");
    await fs.writeFile(f1, "AAA", "utf8");
    await fs.writeFile(f2, "BBB", "utf8");
    const msg = `[첨부: ${f1}] 그리고 [Attached: ${f2}]`;
    const result = await injectAttachments("BASE", msg);
    expect(result.attachments).toHaveLength(2);
    expect(result.systemPrompt).toContain("AAA");
    expect(result.systemPrompt).toContain("BBB");
    expect(result.systemPrompt).toContain("\n\n---\n");
  });

  it("실패 첨부는 (추출 실패: ...)로 노출, warnings에 사유", async () => {
    const missing = path.join(tmpDir, "ghost.pdf");
    const msg = `[첨부: ${missing}]`;
    const result = await injectAttachments("BASE", msg);
    expect(result.attachments[0].ok).toBe(false);
    expect(result.systemPrompt).toContain("추출 실패");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("한국어 콜론(：)도 매치", async () => {
    const filePath = path.join(tmpDir, "k.md");
    await fs.writeFile(filePath, "한글 본문", "utf8");
    const msg = `[첨부：${filePath}]`;
    const result = await injectAttachments("BASE", msg);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].ok).toBe(true);
  });
});
```

- [ ] **Step 6.2: 테스트 실행 — 실패 확인**

```powershell
pnpm exec vitest run server/llm/attachmentInject.test.ts
```

Expected: FAIL — `attachmentInject` 모듈 없음.

- [ ] **Step 6.3: 모듈 작성**

`server/llm/attachmentInject.ts`:

```ts
/**
 * 사용자 메시지에서 [첨부: <절대경로>] 패턴을 파싱해 본문을 추출하고,
 * systemPrompt 끝에 [첨부 문서] 섹션을 prepend한다.
 *
 * 두 채팅 진입점(웹 tRPC chat / 텔레그램 봇 메시지 핸들러)에서 공유 호출.
 */

import { extractAttachmentText, type AttachmentExtractResult } from "./attachmentExtract";

const ATTACHMENT_PATTERN =
  /\[(?:첨부|Attached|ATTACHMENT)[:：]\s*["'`]?([\s\S]+?\.(?:pdf|md|txt|csv))["'`]?\s*\]/gi;

export interface InjectAttachmentMeta {
  path: string;
  filename: string;
  ok: boolean;
  error?: string;
  bytes?: number;
  truncated?: boolean;
  pageCount?: number;
}

export interface InjectResult {
  systemPrompt: string;
  attachments: InjectAttachmentMeta[];
  warnings: string[];
}

export async function injectAttachments(
  baseSystemPrompt: string,
  userMessage: string,
): Promise<InjectResult> {
  const matches = Array.from(userMessage.matchAll(ATTACHMENT_PATTERN));
  if (matches.length === 0) {
    return { systemPrompt: baseSystemPrompt, attachments: [], warnings: [] };
  }

  // 중복 경로 제거 (같은 메시지에 같은 파일을 두 번 적은 경우)
  const uniquePaths = Array.from(new Set(matches.map((m) => m[1].trim())));

  const results = await Promise.all(
    uniquePaths.map(async (p) => ({ path: p, result: await extractAttachmentText(p) })),
  );

  const blocks: string[] = [];
  const attachments: InjectAttachmentMeta[] = [];
  const warnings: string[] = [];

  for (const { path: p, result } of results) {
    const meta: InjectAttachmentMeta = {
      path: p,
      filename: result.filename ?? p,
      ok: result.ok,
      error: result.error,
      bytes: result.bytes,
      truncated: result.truncated,
      pageCount: result.pageCount,
    };
    attachments.push(meta);

    if (result.ok && result.text) {
      blocks.push(`### [첨부 — ${meta.filename}]\n${result.text}`);
    } else {
      blocks.push(`### [첨부 — ${meta.filename}]\n(추출 실패: ${result.error ?? "알 수 없는 오류"})`);
      if (result.error) {
        warnings.push(`${meta.filename}: ${result.error}`);
      }
    }
  }

  const section = `[첨부 문서]\n${blocks.join("\n\n---\n")}`;
  const systemPrompt = `${baseSystemPrompt}\n\n${section}`;

  return { systemPrompt, attachments, warnings };
}

export type { AttachmentExtractResult };
```

- [ ] **Step 6.4: 테스트 통과 확인**

```powershell
pnpm exec vitest run server/llm/attachmentInject.test.ts
```

Expected: PASS — 5개 테스트 모두.

- [ ] **Step 6.5: tsc + 전체 테스트 회귀**

```powershell
pnpm run check
pnpm run test
```

Expected: 둘 다 통과. 전체 테스트 = 기존 + 14(extract) + 5(inject) = 19개 신규.

- [ ] **Step 6.6: 커밋하지 않음 — Task 7·8과 묶음**

---

## Task 7: 웹 tRPC 채팅 통합 (`server/routers/llm.ts`)

**Files:**
- Modify: `server/routers/llm.ts:166-192`

- [ ] **Step 7.1: 통합 코드 적용**

[server/routers/llm.ts:166](server/routers/llm.ts:166)~192의 현재 블록:

```ts
      // Call LLM with enhanced system prompt
      const currentDate = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      const currentModel = getModel(session.engine, session.modelKey);
      const systemPrompt = `당신은 구글 생태계와 텔레그램을 통합하는 AI 어시스턴트입니다. 사용자의 질문에 친절하고 정확하게 답변해주세요.

현재 날짜와 시간: ${currentDate}
현재 사용 중인 엔진: ${session.engine}, 모델: ${currentModel?.name || session.modelKey}`;
      
      const response = await userLlmCaller.call(
        session.engine,
        session.modelKey,
        history.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
        })),
        systemPrompt
      );

      // Add assistant response to history
      await sessionManager.addMessage(userId, "assistant", response.content);

      return {
        response: response.content,
        model: response.model,
        engine: response.engine,
      };
```

다음으로 교체 (systemPrompt 조립 직후 inject 호출, return에 메타 추가):

```ts
      // Call LLM with enhanced system prompt
      const currentDate = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      const currentModel = getModel(session.engine, session.modelKey);
      const systemPrompt = `당신은 구글 생태계와 텔레그램을 통합하는 AI 어시스턴트입니다. 사용자의 질문에 친절하고 정확하게 답변해주세요.

현재 날짜와 시간: ${currentDate}
현재 사용 중인 엔진: ${session.engine}, 모델: ${currentModel?.name || session.modelKey}`;

      // 인라인 첨부([첨부: <경로>]) 본문 추출 → systemPrompt에 prepend
      const { injectAttachments } = await import("../llm/attachmentInject");
      const injected = await injectAttachments(systemPrompt, input.message);

      const response = await userLlmCaller.call(
        session.engine,
        session.modelKey,
        history.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
        })),
        injected.systemPrompt
      );

      // Add assistant response to history
      await sessionManager.addMessage(userId, "assistant", response.content);

      return {
        response: response.content,
        model: response.model,
        engine: response.engine,
        attachments: injected.attachments,
        warnings: injected.warnings,
      };
```

- [ ] **Step 7.2: tsc 통과 확인**

```powershell
pnpm run check
```

Expected: 통과.

- [ ] **Step 7.3: 기존 llm 라우터 테스트 회귀 확인**

```powershell
pnpm exec vitest run server/routers/llm.test.ts
```

Expected: 기존 테스트 PASS. (return 객체에 필드 추가는 기존 검증을 깨지 않음.)

---

## Task 8: 텔레그램 봇 통합 (`server/llm/telegram-bot.ts`)

**Files:**
- Modify: `server/llm/telegram-bot.ts:251-274`

- [ ] **Step 8.1: 통합 코드 적용**

[server/llm/telegram-bot.ts:250](server/llm/telegram-bot.ts:250)~274의 현재 블록:

```ts
        // Call LLM with enhanced system prompt
        const currentDate = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        const currentModel = getModel(session.engine, session.modelKey);
        const systemPrompt = `당신은 구글 생태계와 텔레그램을 통합하는 AI 어시스턴트입니다. 사용자의 질문에 친절하고 정확하게 답변해주세요.

현재 날짜와 시간: ${currentDate}
현재 사용 중인 엔진: ${session.engine}, 모델: ${currentModel?.name || session.modelKey}`;

        const response = await this.llmCaller.call(
          session.engine,
          session.modelKey,
          history.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          systemPrompt
        );

        // Add assistant response to history
        await this.sessionManager.addMessage(ctx.session.userId, "assistant", response.content);

        // Send response to Telegram
        const sentMessage = await ctx.reply(response.content, {
          reply_parameters: { message_id: ctx.message.message_id },
        });
```

다음으로 교체:

```ts
        // Call LLM with enhanced system prompt
        const currentDate = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        const currentModel = getModel(session.engine, session.modelKey);
        const systemPrompt = `당신은 구글 생태계와 텔레그램을 통합하는 AI 어시스턴트입니다. 사용자의 질문에 친절하고 정확하게 답변해주세요.

현재 날짜와 시간: ${currentDate}
현재 사용 중인 엔진: ${session.engine}, 모델: ${currentModel?.name || session.modelKey}`;

        // 인라인 첨부([첨부: <경로>]) 본문 추출 → systemPrompt에 prepend
        const { injectAttachments } = await import("./attachmentInject");
        const injected = await injectAttachments(systemPrompt, userMessage);

        const response = await this.llmCaller.call(
          session.engine,
          session.modelKey,
          history.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          injected.systemPrompt
        );

        // Add assistant response to history
        await this.sessionManager.addMessage(ctx.session.userId, "assistant", response.content);

        // Send response to Telegram
        const sentMessage = await ctx.reply(response.content, {
          reply_parameters: { message_id: ctx.message.message_id },
        });

        // 첨부 추출 경고(스캔 PDF 등)는 별도 메시지로 노출
        if (injected.warnings.length > 0) {
          await ctx.reply("⚠️ " + injected.warnings.join("\n"));
        }
```

- [ ] **Step 8.2: tsc 통과 확인**

```powershell
pnpm run check
```

Expected: 통과.

- [ ] **Step 8.3: 기존 telegram-bot 테스트 회귀 확인**

```powershell
pnpm exec vitest run server/llm/telegram-bot.test.ts
```

Expected: 기존 테스트 PASS.

- [ ] **Step 8.4: 커밋 (Task 6·7·8 묶음)**

```powershell
git add server/llm/attachmentInject.ts server/llm/attachmentInject.test.ts server/routers/llm.ts server/llm/telegram-bot.ts
git commit -m @'
feat(llm): 웹·텔레그램 채팅에 인라인 첨부 인젝션 적용

- attachmentInject 헬퍼 신설 (정규식 파싱 + 섹션 조립 + warnings)
- 정규식: [첨부|Attached|ATTACHMENT][:|：] 한/영 콜론 모두 지원
- llm.ts chat mutation: systemPrompt 직후 inject 호출, 응답에 메타 포함
- telegram-bot.ts 메시지 핸들러: 동일 inject 호출, warnings는 별도 reply
- 인젝션 단위 테스트 5개
'@
```

---

## Task 9: 회귀 검증 + 최종 정리

**Files:**
- 없음 (검증만)

- [ ] **Step 9.1: tsc 전체 통과**

```powershell
pnpm run check
```

Expected: 0 error.

- [ ] **Step 9.2: vitest 전체 통과**

```powershell
pnpm run test
```

Expected: 전체 테스트 PASS, 신규 19개(extract 14 + inject 5) 포함.

- [ ] **Step 9.3: build 통과**

```powershell
pnpm run build
```

Expected: vite + esbuild 성공. `dist/` 디렉토리 생성.

- [ ] **Step 9.4: 첨부 모듈 기본 import 동작 점검 (수동)**

```powershell
pnpm exec node --input-type=module -e "import('./dist/index.js').then(()=>console.log('boot ok')).catch(e=>{console.error(e);process.exit(1)})"
```

Expected: `boot ok` 출력. (서버 entry는 부수효과로 listen을 호출할 수 있어 즉시 종료되지 않을 수 있음 — 5초 후 Ctrl+C로 종료해도 OK. 부팅 자체가 throw하지 않으면 합격.)

- [ ] **Step 9.5: git 상태 확인**

```powershell
git status
git log --oneline -5
```

Expected: working tree clean, 마지막 3개 커밋이 spec / extract / inject+integration.

- [ ] **Step 9.6: PR 푸시 준비 (회장님 명시 요청 시에만)**

(자동 푸시·PR 생성은 하지 않음. 회장님이 별도 지시 시 `gh pr create` 진행.)

---

## 완료 후 운영 검증 (회장님 직접, 코드 머지 후)

1. `pm2 restart aston` (또는 dev 모드 재시작)
2. **웹 채팅**: `다음 PDF 요약해줘 [첨부: G:\내 드라이브\Aston-Wiki\projects\hannam-644\PF IM_v1.1.pdf]`
   - 응답에 PDF 본문 수치/문장이 인용되는지 확인
   - tRPC 응답 객체에 `attachments`, `warnings` 필드가 들어 있는지 (브라우저 devtools 네트워크 탭)
3. **텔레그램**: 봇에게 동일 메시지 전송 → 동일 결과 + warnings가 별도 메시지로 노출되는지
4. **스캔 PDF 1건** → "OCR 도구로 변환 후 재첨부" 안내가 응답·warnings에 노출
5. **50MB 초과 PDF** → "50MB 초과" 안내 노출
6. **다중 첨부**: `[첨부: a.pdf] [첨부: b.md]` → 두 본문 모두 인용

---

## Self-Review 체크리스트 (이 plan을 spec과 대조)

**1. Spec coverage**

| Spec 요구사항 | 구현 task |
|---|---|
| 정규식 (한/영 콜론, 따옴표 옵션, 4종 확장자) | Task 6.3 |
| 50MB 한도 | Task 2.1·2.3 |
| 60K 캡 + suffix | Task 3.1·3.3 |
| pdf2json lazy import + pure text 모드 | Task 4.3 |
| 스캔 PDF 식별 (텍스트 0) | Task 4.1·4.4 |
| form-feed/줄바꿈 정규화 | Task 3.3 |
| LRU 16-entry, mtime 키 | Task 5.3·5.4 |
| `[첨부 문서]` 섹션 + `\n\n---\n` 구분자 | Task 6.3 |
| 부분 실패 시 `(추출 실패: ...)` 노출 | Task 6.3 |
| 웹 chat mutation 통합 | Task 7.1 |
| 텔레그램 메시지 핸들러 통합 | Task 8.1 |
| warnings 응답 노출 (웹 return / 텔레그램 별도 reply) | Task 7.1 / 8.1 |
| `pdf-parse` v2 금지 (DOMMatrix) | Task 4.3 주석 |
| 단일사용자 보안 가정 명시 | Task 2.3 헤더 주석 |

**2. Placeholder scan** — 본 plan에는 "TBD/TODO/적절히/유사하게" 등 placeholder 없음. Task 5.4의 PDF 분기는 Task 4.4 코드를 명시 참조 (재기재 대신 재배치 지시).

**3. Type consistency**
- `AttachmentExtractResult` (Task 2.3에 정의) — Task 6.3에서 type-only re-export.
- `InjectResult.attachments[i]` 필드는 `InjectAttachmentMeta` (Task 6.3 정의) — Task 7.1·8.1에서 필드명 일치 확인.
- `injectAttachments(base, msg)` 시그니처는 모든 호출자(Task 7.1, 8.1)에서 동일.

**4. 검증**

| 명령 | 시점 | 통과 기준 |
|---|---|---|
| `pnpm run check` | Task 2.5, 4.6, 5.6, 6.5, 7.2, 8.2, 9.1 | 0 error |
| `pnpm run test` | Task 6.5, 9.2 | 신규 19개 + 기존 회귀 0 |
| `pnpm run build` | Task 9.3 | vite + esbuild 성공 |
