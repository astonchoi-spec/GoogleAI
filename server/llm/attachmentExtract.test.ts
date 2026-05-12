import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { extractAttachmentText } from "./attachmentExtract";

// node:fs/promises 네임스페이스를 spy 모드로 래핑 (실제 구현은 유지하면서 호출 추적 가능)
vi.mock("node:fs/promises", { spy: true });

// pdf2json mock — PDFParser는 EventEmitter 기반.
// loadPDF 호출 시 mock state에 따라 dataReady 또는 dataError 이벤트 발생.
// vi.hoisted로 선언해야 vi.mock 호이스팅 이후에도 클로저가 올바르게 참조함.
const { mockPdfState } = vi.hoisted(() => {
  return { mockPdfState: { value: "ok" as "ok" | "scan" | "error" } };
});

vi.mock("pdf2json", () => {
  // EventEmitter를 mock factory 내부에서 require — ESM 호이스팅 제약 우회.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require("node:events") as typeof import("node:events");
  class MockPDFParser extends EventEmitter {
    constructor(_ctx: unknown, _mode: number) {
      super();
    }
    loadPDF(_filePath: string) {
      setImmediate(() => {
        if (mockPdfState.value === "error") {
          this.emit("pdfParser_dataError", { parserError: "mock parse error" });
          return;
        }
        if (mockPdfState.value === "scan") {
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

  it("디렉토리는 거부 (확장자가 .pdf인 디렉토리)", async () => {
    const dirPath = path.join(tmpDir, "inner.pdf");
    await fs.mkdir(dirPath);
    const result = await extractAttachmentText(dirPath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/파일이 아닙니다/);
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

describe("extractAttachmentText — PDF (mocked pdf2json)", () => {
  beforeEach(() => {
    mockPdfState.value = "ok";
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
    mockPdfState.value = "scan";
    const filePath = path.join(tmpDir, "scanned.pdf");
    await fs.writeFile(filePath, "fake-pdf-bytes");
    const result = await extractAttachmentText(filePath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/OCR/);
    expect(result.pageCount).toBe(0);
  });

  it("파싱 에러", async () => {
    mockPdfState.value = "error";
    const filePath = path.join(tmpDir, "broken.pdf");
    await fs.writeFile(filePath, "fake-pdf-bytes");
    const result = await extractAttachmentText(filePath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/PDF 파싱 실패/);
    expect(result.error).toContain("mock parse error");
  });
});

describe("extractAttachmentText — LRU cache", () => {
  it("같은 파일 두 번째 호출은 캐시 히트 (fs.readFile 1회만 호출)", async () => {
    const filePath = path.join(tmpDir, "cached.txt");
    await fs.writeFile(filePath, "first", "utf8");

    const readSpy = vi.spyOn(fs, "readFile");
    try {
      const r1 = await extractAttachmentText(filePath);
      expect(r1.text).toBe("first");
      const r2 = await extractAttachmentText(filePath);
      expect(r2.text).toBe("first");
      expect(readSpy).toHaveBeenCalledTimes(1);
    } finally {
      readSpy.mockRestore();
    }
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
