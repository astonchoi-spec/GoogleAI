// TelegramAdapter — 봇 메시지를 PipelineInput으로 변환.
// 명령 prefix(/tg)가 없는 메시지는 본 어댑터가 처리하지 않음 (intent 라우터에서 걸러짐).

import { parseCommand } from "../parser/tokenDispatcher.ts";
import { defaultTokenHandlers } from "../parser/handlers/projectToken.ts";
import type { PipelineInput, TelegramRawEvent } from "../types.ts";

export class TelegramAdapter {
  readonly source_type = "telegram" as const;

  toPipelineInput(event: TelegramRawEvent): PipelineInput {
    const parsed = parseCommand(event.text, defaultTokenHandlers);

    const hints: Record<string, string | number | boolean | undefined> = {
      chat_id: event.chat_id,
      message_id: event.message_id,
    };
    if (event.from?.username) hints.username = event.from.username;
    if (event.chat_title) hints.chat_title = event.chat_title;

    return {
      source_type: "telegram",
      source_ref: `tg:${event.chat_id}:${event.message_id}`,
      raw_text: parsed.body, // 명령 토큰 제거된 본문
      hints,
      command_hints: parsed.hints,
      received_at: event.received_at,
    };
  }
}

export const telegramAdapter = new TelegramAdapter();
