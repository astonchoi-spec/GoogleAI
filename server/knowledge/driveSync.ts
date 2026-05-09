// Drive Watcher — Aston-Wiki/notebooklm-exports/{project}/ 폴더 자동 감시.
// 신규 파일 감지 → 본문 추출 → NotebookLmAdapter → Knowledge Pipeline → Wiki 저장.
// 운영 약속:
//   {ASTON_WIKI_ROOT}/notebooklm-exports/{project}/*.{md,txt}  → 자동 회수 (본문 직접 읽기)
//   {ASTON_WIKI_ROOT}/notebooklm-exports/{project}/*.{docx,pdf,gdoc}  → 메타만 기록 + 안내
// 멱등성: data/notebooklm-drive-ingested.json — 파일 path + size + mtime hash 로 dedupe.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import chokidar, { type FSWatcher } from "chokidar";
import { NotebookLmAdapter } from "./adapters/notebooklm.ts";
import { PipelineRunner } from "./pipeline/runner.ts";
import { resolveWikiRoot } from "./storage/wikiWriter.ts";

// 외부에서 주입받는 project 화이트리스트 (rag 도메인 의존 회피).
// 부팅 시 server/_core/index.ts 가 loadRagMapping() 결과로 한 번 채운다.
let allowedProjects: string[] = [];
export function setAllowedProjects(projects: string[]): void {
  allowedProjects = [...projects];
}

const SUPPORTED_AUTO_INGEST = new Set([".md", ".txt"]);
const META_ONLY_TYPES = new Set([".docx", ".pdf", ".gdoc", ".gsheet"]);

const STATE_FILE = path.resolve(
  process.cwd(),
  "data",
  "notebooklm-drive-ingested.json",
);

interface IngestedRecord {
  filePath: string;
  fileHash: string;
  ingestedAt: string;
  project: string;
  savedPath?: string;
  reason: "auto-ingest" | "meta-only" | "skipped" | "failed";
  error?: string;
}

interface SyncStatus {
  enabled: boolean;
  watchedRoot: string;
  watchedProjects: string[];
  startedAt: string | null;
  lastEventAt: string | null;
  ingestedCount: number;
  recentEvents: IngestedRecord[];
}

const status: SyncStatus = {
  enabled: false,
  watchedRoot: "",
  watchedProjects: [],
  startedAt: null,
  lastEventAt: null,
  ingestedCount: 0,
  recentEvents: [],
};

let watcher: FSWatcher | null = null;
let pipelineRunner: PipelineRunner | null = null;

function getRunner(): PipelineRunner {
  if (!pipelineRunner) pipelineRunner = new PipelineRunner();
  return pipelineRunner;
}

export function exportsRootDir(): string {
  return path.join(resolveWikiRoot(), "notebooklm-exports");
}

export function exportsProjectDir(projectId: string): string {
  return path.join(exportsRootDir(), projectId);
}

export function sourcesRootDir(): string {
  return path.join(resolveWikiRoot(), "notebooklm-sources");
}

export function sourcesProjectDir(projectId: string): string {
  return path.join(sourcesRootDir(), projectId);
}

async function readState(): Promise<IngestedRecord[]> {
  try {
    const text = await fsp.readFile(STATE_FILE, "utf-8");
    const parsed = JSON.parse(text) as IngestedRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeState(items: IngestedRecord[]): Promise<void> {
  try {
    await fsp.mkdir(path.dirname(STATE_FILE), { recursive: true });
    await fsp.writeFile(STATE_FILE, JSON.stringify(items, null, 2), "utf-8");
  } catch (err) {
    console.error("[rag/driveSync] state write 실패:", err);
  }
}

async function fileFingerprint(filePath: string): Promise<string> {
  const stat = await fsp.stat(filePath);
  return crypto
    .createHash("sha256")
    .update(`${filePath}::${stat.size}::${stat.mtimeMs}`)
    .digest("hex")
    .slice(0, 24);
}

function projectFromPath(filePath: string): string | null {
  const root = exportsRootDir();
  const rel = path.relative(root, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const seg = rel.split(/[/\\]/);
  return seg[0] ?? null;
}

function recordEvent(rec: IngestedRecord): void {
  status.lastEventAt = rec.ingestedAt;
  status.recentEvents.unshift(rec);
  if (status.recentEvents.length > 20) status.recentEvents.length = 20;
  if (rec.reason === "auto-ingest") status.ingestedCount += 1;
}

async function handleNewFile(filePath: string): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  const project = projectFromPath(filePath);
  if (!project) return;

  // 화이트리스트 검증 (외부에서 setAllowedProjects 로 주입받은 목록)
  const validProjects = new Set(allowedProjects);
  if (!validProjects.has(project)) {
    recordEvent({
      filePath,
      fileHash: "",
      ingestedAt: new Date().toISOString(),
      project,
      reason: "skipped",
      error: `매핑 yaml 에 등록되지 않은 project: ${project}`,
    });
    return;
  }

  let fileHash: string;
  try {
    fileHash = await fileFingerprint(filePath);
  } catch (err) {
    recordEvent({
      filePath,
      fileHash: "",
      ingestedAt: new Date().toISOString(),
      project,
      reason: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // 멱등성 체크
  const state = await readState();
  if (state.some((r) => r.fileHash === fileHash && r.reason === "auto-ingest")) {
    return; // 이미 회수 완료
  }

  // 메타만 기록하는 타입
  if (META_ONLY_TYPES.has(ext)) {
    const rec: IngestedRecord = {
      filePath,
      fileHash,
      ingestedAt: new Date().toISOString(),
      project,
      reason: "meta-only",
      error: `${ext} 파일은 본문 자동 추출 미지원 — .md / .txt 로 변환 후 같은 폴더에 다시 저장하세요.`,
    };
    recordEvent(rec);
    state.push(rec);
    await writeState(state);
    return;
  }

  if (!SUPPORTED_AUTO_INGEST.has(ext)) {
    return; // 지원 안 하는 확장자 (.gdoc 등은 META_ONLY_TYPES 에서 처리, 그 외 무시)
  }

  // 본문 직접 추출 + 파이프라인 실행
  let body: string;
  try {
    body = await fsp.readFile(filePath, "utf-8");
  } catch (err) {
    recordEvent({
      filePath,
      fileHash,
      ingestedAt: new Date().toISOString(),
      project,
      reason: "failed",
      error: `read 실패: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  if (body.trim().length < 10) {
    recordEvent({
      filePath,
      fileHash,
      ingestedAt: new Date().toISOString(),
      project,
      reason: "skipped",
      error: "본문이 10자 미만",
    });
    return;
  }

  const adapter = new NotebookLmAdapter();
  const fileBasename = path.basename(filePath);
  const sourceRef = `drive:${fileHash}`;
  const pipelineInput = adapter.toPipelineInput({
    project,
    body: `${body}\n\n출처: NotebookLM Drive export — ${fileBasename}`,
    source_ref: sourceRef,
    received_at: new Date().toISOString(),
  });

  try {
    const result = await getRunner().run(pipelineInput);
    if (result.ok) {
      const rec: IngestedRecord = {
        filePath,
        fileHash,
        ingestedAt: new Date().toISOString(),
        project,
        savedPath: result.entry.saved_path,
        reason: "auto-ingest",
      };
      recordEvent(rec);
      state.push(rec);
      await writeState(state);
      console.log(
        `[rag/driveSync] ✅ 회수 완료: ${fileBasename} → ${result.entry.saved_path}`,
      );
    } else {
      recordEvent({
        filePath,
        fileHash,
        ingestedAt: new Date().toISOString(),
        project,
        reason: "failed",
        error: `pipeline I/O 실패: ${result.pending_path}`,
      });
    }
  } catch (err) {
    recordEvent({
      filePath,
      fileHash,
      ingestedAt: new Date().toISOString(),
      project,
      reason: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Drive Watcher 시작. 매핑 yaml 의 28개 project 폴더(`exports/{project}/`)를 모두 감시.
 * 폴더가 아직 없어도 chokidar 가 생성 시점에 자동 감지 (ignoreInitial: false 로 기존 파일도 1회 처리).
 */
export async function startDriveSync(): Promise<void> {
  if (watcher) return; // 이미 실행 중

  // 부팅 가드: 환경 비활성화 옵션
  if ((process.env.DRIVE_WATCHER_ENABLED ?? "true").toLowerCase() === "false") {
    status.enabled = false;
    console.log("[rag/driveSync] DRIVE_WATCHER_ENABLED=false — 비활성화");
    return;
  }

  // 어떤 단계 실패도 서버 부팅을 막지 않도록 전체 try-catch 로 감쌈.
  try {
    const root = exportsRootDir();
    // root 폴더가 없으면 만들기 시도. 실패해도 chokidar 는 미존재 경로를 받아둘 수 있음.
    if (!fs.existsSync(root)) {
      try {
        fs.mkdirSync(root, { recursive: true });
      } catch (err) {
        console.warn(
          "[rag/driveSync] exports root mkdir 실패 (드라이브 미마운트·권한 등) — watcher 비활성화 후 부팅 계속:",
          err instanceof Error ? err.message : err,
        );
        status.enabled = false;
        status.watchedRoot = root;
        return; // chokidar 시작 안 함, 부팅은 영향 0
      }
    }

    const projects = allowedProjects;
    if (projects.length === 0) {
      console.warn(
        "[rag/driveSync] setAllowedProjects() 가 호출되지 않았거나 빈 목록 — 부팅 보류",
      );
      status.enabled = false;
      return;
    }

    // sources / exports 양쪽 root + 28개 project 하위 폴더 자동 생성.
    // 회장님이 직접 폴더 만들 필요 없이 부팅 시점에 자동 보장.
    const sourcesRoot = sourcesRootDir();
    if (!fs.existsSync(sourcesRoot)) {
      try {
        fs.mkdirSync(sourcesRoot, { recursive: true });
      } catch (err) {
        console.warn(
          "[rag/driveSync] sources root mkdir 실패 (계속 진행):",
          err instanceof Error ? err.message : err,
        );
      }
    }
    let createdCount = 0;
    for (const p of projects) {
      for (const dir of [exportsProjectDir(p), sourcesProjectDir(p)]) {
        if (!fs.existsSync(dir)) {
          try {
            fs.mkdirSync(dir, { recursive: true });
            createdCount += 1;
          } catch (err) {
            console.warn(
              `[rag/driveSync] mkdir ${dir} 실패 (계속):`,
              err instanceof Error ? err.message : err,
            );
          }
        }
      }
    }
    if (createdCount > 0) {
      console.log(
        `[rag/driveSync] 📁 ${createdCount}개 폴더 자동 생성 완료 (sources + exports × 28 project)`,
      );
    }

    const watchPaths = projects.map((p) => exportsProjectDir(p));

    watcher = chokidar.watch(watchPaths, {
      ignoreInitial: false, // 부팅 시 기존 파일도 1회 점검 (멱등성 으로 중복 방지)
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
      depth: 0,
    });

    watcher.on("add", (filePath) => {
      void handleNewFile(filePath);
    });
    watcher.on("change", (filePath) => {
      void handleNewFile(filePath);
    });
    watcher.on("error", (err) => {
      console.error("[rag/driveSync] watcher error (부팅 영향 없음):", err);
    });

    status.enabled = true;
    status.watchedRoot = root;
    status.watchedProjects = projects;
    status.startedAt = new Date().toISOString();
    console.log(
      `[rag/driveSync] 🚀 시작: ${projects.length} 폴더 감시 (${root})`,
    );
    return;
  } catch (err) {
    console.error(
      "[rag/driveSync] 시작 중 예상치 못한 오류 — 부팅 계속, watcher 비활성화:",
      err,
    );
    status.enabled = false;
    if (watcher) {
      try {
        await watcher.close();
      } catch {}
      watcher = null;
    }
    return;
  }
}

export async function stopDriveSync(): Promise<void> {
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
  status.enabled = false;
}

export function getDriveSyncStatus(): SyncStatus {
  return {
    ...status,
    recentEvents: status.recentEvents.slice(0, 10),
  };
}

/**
 * 28개 project 의 sources + exports 폴더를 idempotent 하게 보장.
 * 페이지 "폴더 자동 생성" 버튼이 호출. 부팅 시 자동 생성과 동일 로직 + 결과 카운트 반환.
 */
export async function ensureProjectFolders(): Promise<{
  created: number;
  skipped: number;
  failed: Array<{ path: string; error: string }>;
  rootExists: boolean;
}> {
  const sourcesRoot = sourcesRootDir();
  const exportsRoot = exportsRootDir();
  const failed: Array<{ path: string; error: string }> = [];
  let created = 0;
  let skipped = 0;

  for (const root of [sourcesRoot, exportsRoot]) {
    if (!fs.existsSync(root)) {
      try {
        fs.mkdirSync(root, { recursive: true });
        created += 1;
      } catch (err) {
        failed.push({
          path: root,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      skipped += 1;
    }
  }

  for (const p of allowedProjects) {
    for (const dir of [exportsProjectDir(p), sourcesProjectDir(p)]) {
      if (fs.existsSync(dir)) {
        skipped += 1;
        continue;
      }
      try {
        fs.mkdirSync(dir, { recursive: true });
        created += 1;
      } catch (err) {
        failed.push({
          path: dir,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    created,
    skipped,
    failed,
    rootExists: fs.existsSync(exportsRoot) && fs.existsSync(sourcesRoot),
  };
}

/**
 * 수동 즉시 1회 폴링. 페이지의 "지금 동기화" 버튼이 호출.
 */
export async function triggerManualScan(): Promise<{
  scanned: number;
  newlyIngested: number;
}> {
  let scanned = 0;
  const beforeCount = status.ingestedCount;

  for (const project of allowedProjects) {
    const dir = exportsProjectDir(project);
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      scanned += 1;
      await handleNewFile(path.join(dir, entry.name));
    }
  }

  return {
    scanned,
    newlyIngested: status.ingestedCount - beforeCount,
  };
}

/**
 * 특정 project 의 sources 폴더 파일 메타 목록.
 * NotebookLM 입력 자료를 페이지에서 표시하는 용도.
 */
export async function listSourceFiles(projectId: string): Promise<
  Array<{
    filename: string;
    sizeBytes: number;
    mtime: string;
    extension: string;
  }>
> {
  const dir = sourcesProjectDir(projectId);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: Array<{
    filename: string;
    sizeBytes: number;
    mtime: string;
    extension: string;
  }> = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(dir, entry.name);
    try {
      const stat = await fsp.stat(full);
      out.push({
        filename: entry.name,
        sizeBytes: stat.size,
        mtime: stat.mtime.toISOString(),
        extension: path.extname(entry.name).toLowerCase(),
      });
    } catch {
      // skip
    }
  }
  out.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  return out;
}
