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
import type { Stats } from "node:fs";
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

const TRUNCATE_SUFFIX = "\n\n...(이하 생략 — 첨부 분량 초과)";

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

  let stat: Stats;
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

  const cacheKey = `${resolved}:${stat.mtimeMs}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const result = await computeResult(resolved, ext, stat, filename);
  cacheSet(cacheKey, result);
  return result;
}
