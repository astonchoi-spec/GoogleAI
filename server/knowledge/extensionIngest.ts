// Aston NotebookLM Bridge — Chrome Extension 수신 엔드포인트.
// content.js → background.js → POST /api/rag/extension-ingest 로 들어옴.
// SHA-256 해시 기반 중복 방지 + 매핑 yaml URL 매칭으로 project 자동 결정.

import { type Request, type Response } from "express";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { NotebookLmAdapter } from "./adapters/notebooklm.ts";
import { PipelineRunner } from "./pipeline/runner.ts";
import { resolveWikiRoot } from "./storage/wikiWriter.ts";
import { exportsProjectDir } from "./driveSync.ts";

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

// 외부에서 주입받는 URL→project 매핑 (rag 도메인 의존 회피).
let urlToProject: Map<string, string> = new Map();

export function setExtensionUrlMappings(mappings: Array<{ url: string; project: string }>): void {
  urlToProject = new Map(mappings.map((m) => [normalizeNotebookUrl(m.url), m.project]));
}

/** notebook URL 의 trailing slash, query string 정리해서 비교 안정화. */
function normalizeNotebookUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return url.trim().replace(/\/+$/, "").toLowerCase();
  }
}

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
    const hashMatch = fm.match(/^raw_text_hash:\s*['"]?([^\s'"]+)['"]?\s*$/m);
    if (hashMatch) result.hashSet.add(hashMatch[1]);
  }
  return result;
}

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

interface IngestPayload {
  sourceUrl: string;
  notebookTitle: string;
  noteText: string;
  capturedAt: string;
}

interface ExistingHashIndex {
  [hash: string]: string; // hash → relative path
}

const pipelineRunner = new PipelineRunner();

/** 기존 회수 자료의 SHA-256 해시 인덱스 — frontmatter 의 raw_text_hash 또는 본문 직접 hash. */
async function buildExistingHashIndex(projectDir: string): Promise<ExistingHashIndex> {
  const out: ExistingHashIndex = {};
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(projectDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".md")) continue;
    const full = path.join(projectDir, e.name);
    try {
      const text = await fs.readFile(full, "utf-8");
      // frontmatter 의 raw_text_hash 추출
      const m = text.match(/raw_text_hash:\s*'?([0-9a-f]{16,})'?/i);
      if (m) {
        out[m[1]] = path.relative(resolveWikiRoot(), full).replaceAll("\\", "/");
      }
    } catch {
      // skip
    }
  }
  return out;
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/** Express handler — POST/OPTIONS/GET(health). */
export async function handleExtensionIngest(req: Request, res: Response): Promise<void> {
  // CORS 사전 처리 — Extension origin 은 chrome-extension://... 또는 null.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  // GET = 라우트 등록 확인 헬스체크 (브라우저에서 직접 접속 가능).
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
    res.status(400).json({
      ok: false,
      error: "sourceUrl 또는 noteText 누락",
    });
    return;
  }
  if (noteText.length < 20) {
    res.status(400).json({
      ok: false,
      error: "본문 너무 짧음 (최소 20자)",
    });
    return;
  }

  // 1) URL → project 매칭. 실패 시 fallback `_unmapped` 사용 — 회수는 항상 성공시키되
  //    회장님이 페이지에서 어떤 노트북에 매핑할지 별도 결정 가능하게 한다.
  const normalized = normalizeNotebookUrl(sourceUrl);
  const project = urlToProject.get(normalized) ?? "_unmapped";
  const isUnmapped = project === "_unmapped";

  // 2) 중복 체크 — 같은 본문 hash 가 이미 회수됐으면 skip
  const projectDir = exportsProjectDir(project);
  if (!fsSync.existsSync(projectDir)) {
    try {
      await fs.mkdir(projectDir, { recursive: true });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: `프로젝트 폴더 생성 실패: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
  }

  const noteHash = sha256(noteText);
  const existing = await buildExistingHashIndex(
    path.join(resolveWikiRoot(), "projects", project, "notebooklm"),
  );
  if (existing[noteHash]) {
    res.status(200).json({
      ok: true,
      status: "skipped",
      project,
      reason: "동일 본문 hash 가 이미 회수됨 (멱등성)",
      existingPath: existing[noteHash],
    });
    return;
  }

  // 3) Pipeline 통과 — NotebookLmAdapter 와 동일 흐름
  const adapter = new NotebookLmAdapter();
  const sourceRef = `extension:${noteHash.slice(0, 16)}`;
  const bodyWithMeta = [
    noteText,
    "",
    `출처: NotebookLM Chrome Extension`,
    `노트북: ${notebookTitle}`,
    `URL: ${sourceUrl}`,
  ].join("\n");
  const pipelineInput = adapter.toPipelineInput({
    project,
    body: bodyWithMeta,
    source_ref: sourceRef,
    received_at: capturedAt,
  });

  try {
    const result = await pipelineRunner.run(pipelineInput);
    if (result.ok) {
      res.status(result.was_skipped ? 200 : 201).json({
        ok: true,
        status: result.was_skipped ? "skipped" : "created",
        project,
        isUnmapped,
        savedPath: result.entry.saved_path,
        notebookTitle,
        quality: result.doc.quality,
        ...(isUnmapped && {
          mappingHint:
            `yaml 의 해당 노트북 entry 에 'notebook_url: "${sourceUrl}"' 1줄 추가 후 서버 재시작하면 다음부터 정확한 project 에 자동 적재됩니다.`,
        }),
      });
      console.log(
        `[rag/extension] ${result.was_skipped ? "skip" : "✅ 적재"}: ${project}${isUnmapped ? " (미매핑 fallback)" : ""} ← ${notebookTitle}`,
      );
    } else {
      res.status(500).json({
        ok: false,
        error: `pipeline I/O 실패. pending 큐: ${result.pending_path}`,
        project,
      });
    }
  } catch (err) {
    console.error("[rag/extension] pipeline error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
