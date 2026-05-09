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

/** Express handler. */
export async function handleExtensionIngest(req: Request, res: Response): Promise<void> {
  // CORS 사전 처리 — Extension origin 은 chrome-extension://... 또는 null.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
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

  // 1) URL → project 매칭
  const normalized = normalizeNotebookUrl(sourceUrl);
  const project = urlToProject.get(normalized);
  if (!project) {
    res.status(404).json({
      ok: false,
      error:
        `매핑 yaml 에 등록되지 않은 NotebookLM URL: ${sourceUrl}. ` +
        `data/rag-mapping.yaml 의 해당 노트북 entry 에 'notebook_url: "${sourceUrl}"' 추가 후 서버 재시작 필요.`,
    });
    return;
  }

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
        savedPath: result.entry.saved_path,
        notebookTitle,
        quality: result.doc.quality,
      });
      console.log(
        `[rag/extension] ${result.was_skipped ? "skip" : "✅ 적재"}: ${project} ← ${notebookTitle}`,
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
