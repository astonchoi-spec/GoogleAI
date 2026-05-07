// 단계 6 — 라우팅. 규칙 기반, LLM 미사용.
// 자동 promotion (LLM → projects/) 절대 X.

import path from "node:path";
import type { TaggedDocument, RoutingDecision } from "../types.ts";
import { resolveWikiRoot } from "../storage/wikiWriter.ts";

export class Router {
  route(doc: TaggedDocument): RoutingDecision {
    const root = resolveWikiRoot();
    const explicitProject = doc.command_hints?.explicit_project;

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

    // 자동 promotion 절대 X — 항상 inbox/
    return {
      target_folder: path.join(root, "inbox", doc.source_type),
      routing_reason: "inbox_fallback",
    };
  }
}

export const router = new Router();
