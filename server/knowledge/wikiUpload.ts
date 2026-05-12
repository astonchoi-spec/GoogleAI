// Step 1.5 — Aston Wiki 페이지 업로드 UI 백엔드.
// 회장님이 /wiki 페이지에서 PDF/문서를 드래그&드롭 → 이 라우터가
// `${ASTON_WIKI_ROOT}/notebooklm-exports/{project}/{filename}` 에 그대로 저장하면
// Drive Watcher (driveSync.ts) 가 자동으로 본문 추출 + Wiki 적재 → RAG 인용.
//
// 멀티파트 의존성을 추가하지 않기 위해 base64-in-JSON 방식 사용 (CLAUDE.md 신규 의존성 금지 준수).
// express.json({ limit: "50mb" }) 가 이미 등록되어 있어 50MB JSON body → 약 36MB 파일까지 수용.

import { type Request, type Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { exportsProjectDir } from "./driveSync.ts";

// 외부 주입 화이트리스트 (rag 도메인 import 회피 — 부팅 시 _core/index.ts 가 채움).
let allowedProjects: Set<string> = new Set();
export function setUploadAllowedProjects(projects: string[]): void {
  // research-inbox 와 _unmapped 는 항상 허용 (회장님 약속).
  allowedProjects = new Set([...projects, "research-inbox", "_unmapped"]);
}

export function getUploadAllowedProjects(): string[] {
  return Array.from(allowedProjects).sort();
}

// Drive Watcher 가 자동 회수하는 확장자(SUPPORTED_AUTO_INGEST) + 이미지(메타만).
const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".md",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
]);

// 디코딩 후 최대 크기 (express.json limit 50MB / base64 1.37x ≈ 36MB 안전 상한).
const MAX_DECODED_BYTES = 35 * 1024 * 1024;

export interface UploadPayload {
  project: string;
  filename: string;
  base64: string;
  contentType?: string;
  artifactKind?: string;
  tags?: string[];
}

export interface UploadResult {
  status: "created" | "renamed";
  project: string;
  savedPath: string;
  filename: string;
  size: number;
  willAutoIngest: boolean;
}

// 파일명 안전성 검사 — 경로 분리자/상대경로 차단.
function sanitizeFilename(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // 디렉토리 분리자 또는 .. 포함 시 거부.
  if (/[\\/]|\.\./.test(trimmed)) return null;
  // 윈도 예약 문자 제거.
  const cleaned = trimmed.replace(/[<>:"|?*\x00-\x1f]/g, "_");
  // 윈도 예약 이름(CON, PRN, AUX, NUL, COM1-9, LPT1-9) 차단.
  const stem = cleaned.replace(/\.[^.]+$/, "");
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(stem)) return null;
  if (cleaned.length > 200) return null;
  return cleaned;
}

// 확장자 추출 (소문자, 점 포함).
function getExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  if (i < 0) return "";
  return filename.slice(i).toLowerCase();
}

// 이미 같은 이름이 있으면 ` (2).pdf` 식으로 suffix 부여.
async function resolveAvailablePath(
  dir: string,
  filename: string,
): Promise<{ savedPath: string; renamed: boolean }> {
  const ext = getExtension(filename);
  const stem = ext ? filename.slice(0, -ext.length) : filename;
  let candidate = filename;
  let suffix = 2;
  // 최대 100회 시도.
  for (let i = 0; i < 100; i++) {
    const full = path.join(dir, candidate);
    try {
      await fs.access(full);
      // 이미 존재 — 다음 candidate.
      candidate = `${stem} (${suffix})${ext}`;
      suffix++;
    } catch {
      return { savedPath: full, renamed: i > 0 };
    }
  }
  // fallback — 타임스탬프 suffix.
  const ts = Date.now();
  return { savedPath: path.join(dir, `${stem}-${ts}${ext}`), renamed: true };
}

export async function saveUploadedFile(payload: UploadPayload): Promise<UploadResult> {
  // 1. project 화이트리스트.
  if (!allowedProjects.has(payload.project)) {
    throw new Error(
      `허용되지 않은 project: ${payload.project} (사용 가능: ${Array.from(allowedProjects).slice(0, 5).join(", ")} ... 총 ${allowedProjects.size}개)`,
    );
  }

  // 2. 파일명 안전성.
  const safeName = sanitizeFilename(payload.filename);
  if (!safeName) {
    throw new Error("잘못된 파일명입니다 (경로 분리자/상대경로 차단)");
  }

  // 3. 확장자 화이트리스트.
  const ext = getExtension(safeName);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      `허용되지 않은 확장자: ${ext || "(없음)"} (허용: ${Array.from(ALLOWED_EXTENSIONS).join(", ")})`,
    );
  }

  // 4. base64 디코딩 + 크기 검사.
  const base64 = payload.base64?.trim() ?? "";
  if (!base64) throw new Error("base64 payload 누락");
  // data URL prefix 제거 ("data:application/pdf;base64,..." 형태 허용).
  const stripped = base64.replace(/^data:[^;]+;base64,/, "");
  let buffer: Buffer;
  try {
    buffer = Buffer.from(stripped, "base64");
  } catch (e) {
    throw new Error("base64 디코딩 실패");
  }
  if (buffer.length === 0) throw new Error("디코딩 결과 빈 파일");
  if (buffer.length > MAX_DECODED_BYTES) {
    throw new Error(
      `파일 크기 초과: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (최대 ${MAX_DECODED_BYTES / 1024 / 1024}MB)`,
    );
  }

  // 5. 저장 폴더 보장 + 충돌 시 rename.
  const projectDir = exportsProjectDir(payload.project);
  await fs.mkdir(projectDir, { recursive: true });
  const { savedPath, renamed } = await resolveAvailablePath(projectDir, safeName);

  // 6. 디스크 기록.
  await fs.writeFile(savedPath, buffer);

  // 7. 자동 회수 여부 — 이미지(.png/.jpg/.jpeg) 는 Drive Watcher 가 자동 추출 못 함.
  const autoIngestExts = new Set([".pdf", ".docx", ".md", ".txt"]);
  const willAutoIngest = autoIngestExts.has(ext);

  return {
    status: renamed ? "renamed" : "created",
    project: payload.project,
    savedPath,
    filename: path.basename(savedPath),
    size: buffer.length,
    willAutoIngest,
  };
}

/** Express handler — POST/OPTIONS/GET(health). */
export async function handleWikiUpload(req: Request, res: Response): Promise<void> {
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
      endpoint: "/api/wiki/upload",
      method: "POST",
      allowedProjects: getUploadAllowedProjects(),
      allowedExtensions: Array.from(ALLOWED_EXTENSIONS),
      maxDecodedBytes: MAX_DECODED_BYTES,
      help: "POST { project, filename, base64, contentType?, artifactKind?, tags? } — base64 디코딩 후 ${ASTON_WIKI_ROOT}/notebooklm-exports/{project}/{filename} 저장. Drive Watcher 가 5초 내 자동 회수.",
    });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }

  const payload = req.body as Partial<UploadPayload>;
  const project = String(payload.project ?? "").trim();
  const filename = String(payload.filename ?? "").trim();
  const base64 = String(payload.base64 ?? "");
  const contentType = payload.contentType ? String(payload.contentType) : undefined;
  const artifactKind = payload.artifactKind ? String(payload.artifactKind) : undefined;
  const tags = Array.isArray(payload.tags)
    ? payload.tags.map((t) => String(t).trim()).filter(Boolean)
    : undefined;

  if (!project || !filename || !base64) {
    res.status(400).json({
      ok: false,
      error: "project / filename / base64 중 누락된 필드가 있습니다",
    });
    return;
  }

  try {
    const result = await saveUploadedFile({
      project,
      filename,
      base64,
      contentType,
      artifactKind,
      tags,
    });
    res.status(201).json({
      ok: true,
      ...result,
      message: result.willAutoIngest
        ? "업로드 완료 — Drive Watcher 가 5초 내 자동 회수합니다."
        : "업로드 완료 — 이미지 파일은 메타만 기록됩니다 (본문 추출 미지원).",
    });
    console.log(
      `[wiki/upload] ${result.status}: ${result.project}/${result.filename} (${(result.size / 1024).toFixed(1)}KB, autoIngest=${result.willAutoIngest})`,
    );
  } catch (err) {
    console.error("[wiki/upload] saveUploadedFile error:", err);
    res.status(400).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
