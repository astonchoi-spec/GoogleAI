// 단계 6 — 라우팅. 규칙 기반, LLM 미사용.
// 자동 promotion (LLM → projects/) 절대 X.
// 키워드 힌트가 있어도 inbox/_suggested/{project}/ 까지만 이동.

import path from "node:path";
import type { TaggedDocument, RoutingDecision } from "../types.ts";
import { resolveWikiRoot } from "../storage/wikiWriter.ts";

// 자동 라우팅에 필요한 최소 신뢰도
const KEYWORD_HINT_MIN_CONFIDENCE = 0.75;

export class Router {
  route(doc: TaggedDocument): RoutingDecision {
    const root = resolveWikiRoot();
    const explicitProject = doc.command_hints?.explicit_project;

    // (1) 명시적 프로젝트 — projects/{project}/{subfolder}/
    if (explicitProject) {
      const SUBFOLDER: Partial<Record<string, string>> = {
        notebooklm: "notebooklm",
        meeting: "meetings",
      };
      const subfolder = SUBFOLDER[doc.source_type] ?? "notes";
      return {
        target_folder: path.join(root, "projects", explicitProject, subfolder),
        routing_reason: "explicit_command",
      };
    }

    // (2) LLM 키워드 힌트 — 자동 승격 X, inbox/_suggested/{project}/ 만 허용
    const topProject = doc.suggested_projects[0];
    if (topProject && doc.classification_confidence >= KEYWORD_HINT_MIN_CONFIDENCE) {
      const suggestedFolder = path.join(root, "projects", topProject, "notes");
      return {
        target_folder: path.join(root, "inbox", "_suggested", topProject),
        routing_reason: "keyword_hint_suggested",
        suggested_alternative: suggestedFolder,
      };
    }

    // (3) 분류 불가 / 낮은 신뢰도 — inbox/{source_type}/
    return {
      target_folder: path.join(root, "inbox", doc.source_type),
      routing_reason: "inbox_fallback",
    };
  }
}

export const router = new Router();
