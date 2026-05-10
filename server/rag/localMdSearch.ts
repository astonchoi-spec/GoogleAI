// Phase 4-A — 로컬 NotebookLM 회수 자료(`*.md`) 검색 → Web Chat RAG 주입.
// 검색 루트: ${ASTON_WIKI_ROOT}/projects/*/notebooklm/*.md
// Public API: searchLocalNotes(query, opts?) / formatCitationFooter(hits)
//
// 모듈 경계: server/rag/ 도메인 — 외부 도메인 import 금지. stdlib + 자기 도메인 + types 만.

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

export async function searchLocalNotes(
  _query: string,
  _opts: SearchOptions = {},
): Promise<NoteHit[]> {
  return [];
}
