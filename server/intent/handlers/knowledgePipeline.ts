// Phase B-1 — Knowledge Pipeline 인텐트 핸들러.
// /tg <body> 메시지를 받아 TelegramAdapter → PipelineRunner로 전달.
// messageRouter는 건드리지 않음 (CURRENT_TASK §8.10) — chat_id/message_id 미사용.
// source_ref는 userId + raw_text 해시로 구성 (멱등성: 같은 사용자가 같은 메시지 재전송 시 skip).

import crypto from "node:crypto";
import { telegramAdapter } from "../../knowledge/adapters/telegram.ts";
import { PipelineRunner } from "../../knowledge/pipeline/runner.ts";
import type { TelegramRawEvent } from "../../knowledge/types.ts";
import type { HandlerMap, IntentHandler } from "../types.ts";

const runner = new PipelineRunner();

const tgPipelineCapture: IntentHandler = async (intent, options) => {
  const rawText = String(intent.params.rawText ?? "").trim();

  if (!rawText) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: "❌ /tg 본문이 비어 있습니다.",
    };
  }

  // source_ref는 userId + sha256(rawText) 앞 16자.
  // chat_id/message_id가 messageRouter에서 전달되지 않아 결정 불가하므로 사용자+내용 기반.
  const userIdNum = Number(options.userId) || 0;
  const textHash = crypto.createHash("sha256").update(rawText).digest("hex").slice(0, 16);

  const event: TelegramRawEvent = {
    chat_id: userIdNum,
    message_id: parseInt(textHash, 16) % 0x7fffffff, // 결정적 의사 message_id
    text: rawText,
    received_at: new Date().toISOString(),
  };

  const input = telegramAdapter.toPipelineInput(event);
  // source_ref를 명시적으로 사용자+해시 기반으로 덮어씀
  input.source_ref = `tg:user:${options.userId}:hash:${textHash}`;

  // 명령은 있는데 본문이 비어 있으면 (예: "/tg #hannam-644")
  if (!input.raw_text) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: "❌ /tg 명령에 본문이 없습니다. 예: /tg #hannam-644 인허가 5/15 신청",
    };
  }

  const result = await runner.run(input);
  if (!result.ok) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `⚠️ Wiki 저장 실패 — pending 큐에 보관됨 (${result.pending_path})`,
      data: { pending_path: result.pending_path },
    };
  }

  const skipNote = result.was_skipped ? " (이미 저장된 동일 메모 — skip)" : "";
  const qualityNote = result.doc.quality !== "complete" ? ` (quality: ${result.doc.quality})` : "";
  const titleLine = result.doc.title ? `\n💬 ${result.doc.title}` : "";

  // 라우팅 결과에 따라 안내 문구 결정
  const routeReason = result.entry.saved_path;
  let projectLabel: string;
  if (result.doc.suggested_projects[0] && result.entry.saved_path.includes("_suggested")) {
    const suggested = result.doc.suggested_projects[0];
    projectLabel = `📂 inbox/_suggested/#${suggested}\n💡 /tg #${suggested} 를 붙이면 projects/${suggested}/notes/에 직접 저장됩니다`;
  } else if (result.doc.suggested_projects[0]) {
    projectLabel = `📂 #${result.doc.suggested_projects[0]}`;
  } else {
    projectLabel = `📂 inbox/${result.doc.source_type}`;
  }

  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: `✅ Wiki 저장 완료${skipNote}${qualityNote}\n${projectLabel}${titleLine}\n📁 ${routeReason}`,
    data: {
      saved_path: result.entry.saved_path,
      was_skipped: result.was_skipped,
      quality: result.doc.quality,
      step_failures: result.doc.step_failures,
    },
  };
};

export const knowledgeHandlers: HandlerMap = {
  tg_pipeline_capture: tgPipelineCapture,
};
