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
