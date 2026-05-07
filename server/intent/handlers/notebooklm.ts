import crypto from "node:crypto";
import { handleNbCommand } from "../../notebooklm/notebookQuery.ts";
import { loadMapping } from "../../notebooklm/mappingLoader.ts";
import { NotebookLmAdapter, notebookLmAdapter } from "../../knowledge/adapters/notebooklm.ts";
import { PipelineRunner } from "../../knowledge/pipeline/runner.ts";
import type { HandlerMap, IntentHandler } from "../types.ts";

const runner = new PipelineRunner();

const nbCommand: IntentHandler = async (intent) => {
  const raw = String(intent.params.raw ?? "");
  const text = handleNbCommand(raw);
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: text,
  };
};

const nbSave: IntentHandler = async (intent, options) => {
  const raw = String(intent.params.raw ?? "").trim();

  const parsed = NotebookLmAdapter.parseRaw(raw);
  if (!parsed) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: [
        "❌ 형식 오류. 올바른 형식:",
        "```",
        "/nb save {project-id}",
        "NotebookLM 답변 본문...",
        "```",
        "project-id 목록: `/nb list`",
      ].join("\n"),
    };
  }

  // project ID 검증
  const { notebooks } = loadMapping();
  const notebook = notebooks.find((n) => n.project === parsed.project);
  if (!notebook) {
    const suggestions = notebooks
      .filter((n) => n.project.includes(parsed.project) || parsed.project.includes(n.project.split("-")[0]))
      .slice(0, 3)
      .map((n) => `• \`${n.project}\` — ${n.display_name}`)
      .join("\n");
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: [
        `❌ project \`${parsed.project}\` 없음.`,
        ...(suggestions ? ["유사 항목:", suggestions] : ["`/nb list`로 전체 목록 확인"]),
      ].join("\n"),
    };
  }

  const textHash = crypto.createHash("sha256").update(parsed.body).digest("hex").slice(0, 16);
  const sourceRef = `nb:${parsed.project}:user:${options.userId}:hash:${textHash}`;

  const input = notebookLmAdapter.toPipelineInput({
    project: parsed.project,
    body: parsed.body,
    source_ref: sourceRef,
    received_at: new Date().toISOString(),
  });

  const result = await runner.run(input);

  if (!result.ok) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `⚠️ Wiki 저장 실패 — pending 큐에 보관됨\n📁 ${result.pending_path}`,
    };
  }

  const skipNote = result.was_skipped ? " (이미 저장된 동일 내용 — skip)" : "";
  const qualityNote = result.doc.quality !== "complete" ? ` (quality: ${result.doc.quality})` : "";

  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: [
      `✅ NotebookLM 회수 완료${skipNote}${qualityNote}`,
      `📓 ${notebook.display_name}`,
      `💬 ${result.doc.title}`,
      `📁 ${result.entry.saved_path}`,
    ].join("\n"),
    data: {
      saved_path: result.entry.saved_path,
      was_skipped: result.was_skipped,
      quality: result.doc.quality,
    },
  };
};

export const notebooklmHandlers: HandlerMap = {
  nb_command: nbCommand,
  nb_save: nbSave,
};
