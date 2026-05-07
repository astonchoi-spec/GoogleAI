import { describe, it, expect } from "vitest";
import { telegramAdapter } from "../../knowledge/adapters/telegram.ts";
import type { TelegramRawEvent } from "../../knowledge/types.ts";

describe("TelegramAdapter", () => {
  function event(overrides: Partial<TelegramRawEvent> = {}): TelegramRawEvent {
    return {
      chat_id: 1234567,
      message_id: 9876,
      text: "/tg #hannam-644 인허가 5/15 신청",
      received_at: "2026-05-07T14:30:00+09:00",
      ...overrides,
    };
  }

  it("/tg #project 명령 → explicit_project 추출 + body는 본문만", () => {
    const r = telegramAdapter.toPipelineInput(event());
    expect(r.source_type).toBe("telegram");
    expect(r.source_ref).toBe("tg:1234567:9876");
    expect(r.command_hints?.explicit_project).toBe("hannam-644");
    expect(r.command_hints?.explicit_command).toBe("tg");
    expect(r.raw_text).toBe("인허가 5/15 신청");
  });

  it("/tg 본문만 (project 없음)", () => {
    const r = telegramAdapter.toPipelineInput(event({ text: "/tg 메모입니다" }));
    expect(r.command_hints?.explicit_project).toBeUndefined();
    expect(r.raw_text).toBe("메모입니다");
  });

  it("hints에 chat_id, message_id, username 보존", () => {
    const r = telegramAdapter.toPipelineInput(
      event({ from: { id: 999, username: "aston" }, chat_title: "DM with Aston" }),
    );
    expect(r.hints?.chat_id).toBe(1234567);
    expect(r.hints?.message_id).toBe(9876);
    expect(r.hints?.username).toBe("aston");
    expect(r.hints?.chat_title).toBe("DM with Aston");
  });

  it("source_ref는 chat_id:message_id 형식", () => {
    const r = telegramAdapter.toPipelineInput(event({ chat_id: 111, message_id: 222 }));
    expect(r.source_ref).toBe("tg:111:222");
  });

  it("향후 토큰(+@!due:)은 unknown_tokens에 보존", () => {
    const r = telegramAdapter.toPipelineInput(
      event({ text: "/tg #hannam-644 +홍길동 @삼성 due:2026-05-15 본문 내용" }),
    );
    expect(r.command_hints?.explicit_project).toBe("hannam-644");
    expect(r.command_hints?.unknown_tokens).toEqual(["+홍길동", "@삼성", "due:2026-05-15"]);
    expect(r.raw_text).toBe("본문 내용");
  });
});
