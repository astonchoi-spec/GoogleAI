// data/rag-mapping.yaml 로더 — Track A 28개 노트북 + Track B 데이터 스토어 매핑.
// 기존 server/notebooklm/mappingLoader.ts 와 같은 파싱 패턴을 따른다 (모듈 경계상 재사용 X — 코드 사본).

import fs from "fs";
import path from "path";
import {
  VALID_RAG_CATEGORIES,
  VALID_RAG_STATUSES,
  VALID_DATA_STORES,
  type RagMapping,
  type RagMappingEntry,
} from "./types.ts";

function resolveMappingPath(): string {
  return path.resolve(process.cwd(), "data", "rag-mapping.yaml");
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2) {
    if (
      (t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'"))
    ) {
      return t.slice(1, -1);
    }
  }
  return t;
}

export function parseYamlMapping(content: string): RagMapping {
  const lines = content.split("\n");
  const notebooks: RagMappingEntry[] = [];
  let current: (Partial<RagMappingEntry> & { tags?: string[] }) | null = null;
  let inTagsList = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = rawLine.length - rawLine.trimStart().length;
    if (indent === 0 && trimmed === "notebooks:") continue;

    // 새 항목: indent 2, "- key: value"
    if (indent === 2 && trimmed.startsWith("- ")) {
      if (current) notebooks.push(current as RagMappingEntry);
      current = {};
      inTagsList = false;
      const rest = trimmed.slice(2);
      const colonIdx = rest.indexOf(":");
      if (colonIdx > -1) {
        const key = rest.slice(0, colonIdx).trim();
        const val = rest.slice(colonIdx + 1).trim();
        if (val) (current as Record<string, unknown>)[key] = unquote(val);
      }
      continue;
    }

    if (!current) continue;

    // tags 배열 값: indent 6, "- value"
    if (indent === 6 && trimmed.startsWith("- ")) {
      if (inTagsList) {
        if (!current.tags) current.tags = [];
        current.tags.push(unquote(trimmed.slice(2)));
      }
      continue;
    }

    // 일반 필드: indent 4
    if (indent === 4) {
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;
      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();

      if (key === "tags") {
        inTagsList = true;
        current.tags = val ? [unquote(val)] : [];
        continue;
      }

      inTagsList = false;
      if (val) (current as Record<string, unknown>)[key] = unquote(val);
    }
  }

  if (current) notebooks.push(current as RagMappingEntry);
  return { notebooks };
}

export interface RagValidationError {
  index: number;
  notebook_name: string;
  errors: string[];
}

export function validateMapping(mapping: RagMapping): RagValidationError[] {
  const issues: RagValidationError[] = [];
  const projectsSeen = new Set<string>();

  for (let i = 0; i < mapping.notebooks.length; i++) {
    const nb = mapping.notebooks[i];
    const errs: string[] = [];

    if (!nb.notebook_name?.trim()) errs.push("notebook_name 누락");
    if (!nb.project?.trim()) errs.push("project 누락");
    if (!nb.display_name?.trim()) errs.push("display_name 누락");
    if (!VALID_RAG_CATEGORIES.has(nb.category))
      errs.push(`category 유효하지 않음: ${nb.category}`);
    if (!VALID_RAG_STATUSES.has(nb.status))
      errs.push(`status 유효하지 않음: ${nb.status}`);
    if (!VALID_DATA_STORES.has(nb.data_store))
      errs.push(`data_store 유효하지 않음: ${nb.data_store}`);
    if (!nb.data_store_filter?.trim()) errs.push("data_store_filter 누락");
    if (nb.project && projectsSeen.has(nb.project))
      errs.push(`project 중복: ${nb.project}`);
    if (nb.project) projectsSeen.add(nb.project);

    if (errs.length > 0) {
      issues.push({
        index: i,
        notebook_name: nb.notebook_name ?? `#${i}`,
        errors: errs,
      });
    }
  }

  return issues;
}

let _cache: { mtime: number; mapping: RagMapping } | null = null;

export function loadRagMapping(): RagMapping {
  const filePath = resolveMappingPath();

  try {
    const stat = fs.statSync(filePath);
    const mtime = stat.mtimeMs;
    if (_cache && _cache.mtime === mtime) return _cache.mapping;

    const content = fs.readFileSync(filePath, "utf-8");
    const mapping = parseYamlMapping(content);
    _cache = { mtime, mapping };
    return mapping;
  } catch (e) {
    console.error("[rag] mappingLoader 오류:", e);
    return { notebooks: [] };
  }
}

export function invalidateRagCache(): void {
  _cache = null;
}
