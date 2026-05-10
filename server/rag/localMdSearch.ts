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

const KOREAN_RE = /[가-힣]/;

export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[\s,.!?;:()[\]{}"'`~/\\<>+*=|&^%$#@]+/u)
    .map((t) => t.trim())
    .filter((t) => {
      if (!t) return false;
      if (KOREAN_RE.test(t)) return t.length >= 2;
      return t.length >= 3;
    });
}

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
let cacheStampMs = Date.now();

const SNIPPET_LEN = 500;
const DEFAULT_K = 3;

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

function collectFrontmatterTags(note: CachedNote): Set<string> {
  const tagSet = new Set<string>();
  for (const key of ["tags", "categories"] as const) {
    const v = note.frontmatter[key];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string") tagSet.add(item.toLowerCase());
      }
    } else if (typeof v === "string") {
      tagSet.add(v.toLowerCase());
    }
  }
  return tagSet;
}

function scoreNote(note: CachedNote, tokens: string[]): number {
  const tagSet = collectFrontmatterTags(note);
  const titleStr = String(note.frontmatter.title ?? "").toLowerCase();
  const fileNameLower = note.fileName.toLowerCase();

  let score = 0;
  for (const t of tokens) {
    let count = 0;
    let idx = 0;
    while ((idx = note.bodyLower.indexOf(t, idx)) !== -1) {
      count += 1;
      idx += t.length;
    }
    if (count > 0) {
      const multiplier = tagSet.has(t) ? 1.5 : 1;
      score += count * multiplier;
    }

    if (titleStr.includes(t) || fileNameLower.includes(t)) {
      score += 5;
    }
  }
  return score;
}

function extractSnippet(body: string, _tokens: string[]): string {
  return body.slice(0, SNIPPET_LEN).trim();
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
  const k = opts.k ?? DEFAULT_K;
  return hits.slice(0, k);
}
