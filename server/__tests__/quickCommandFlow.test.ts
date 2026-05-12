import { describe, expect, it, vi } from "vitest";
import {
  buildQuickCommandPath,
  formatIntentRouteResult,
  GENERIC_ERROR_MESSAGE,
  HOME_QUICK_COMMANDS,
  readChatCommandParams,
  resolveAssistantResponse,
} from "../../client/src/chat/quickCommand.ts";

describe("quickCommand flow helpers", () => {
  it("calls intent.route first for quick commands", async () => {
    const intentRoute = vi.fn(async ({ message }: { message: string }) => ({
      handled: true,
      response: `${message} 결과`,
      data: { summary: `${message} 상세` },
    }));
    const llmChat = vi.fn(async () => ({ response: "fallback" }));

    const result = await resolveAssistantResponse({
      userMessage: HOME_QUICK_COMMANDS[0],
      isAuthenticated: true,
      intentRoute,
      llmChat,
    });

    expect(intentRoute).toHaveBeenCalledTimes(1);
    expect(intentRoute).toHaveBeenCalledWith({ message: HOME_QUICK_COMMANDS[0] });
    expect(llmChat).not.toHaveBeenCalled();
    expect(result).toEqual({
      text: `${HOME_QUICK_COMMANDS[0]} 결과\n\n${HOME_QUICK_COMMANDS[0]} 상세`,
      failed: false,
    });
  });

  it("routes all five home quick commands through the same auto-submit path builder", () => {
    const requestId = 12345;

    const parsed = HOME_QUICK_COMMANDS.map((command) =>
      readChatCommandParams(buildQuickCommandPath(command, requestId).split("/chat")[1] ?? "")
    );

    expect(parsed).toHaveLength(5);
    for (const [index, item] of parsed.entries()) {
      expect(item.command).toBe(HOME_QUICK_COMMANDS[index]);
      expect(item.autoSubmit).toBe(true);
      expect(item.requestId).toBe(String(requestId));
    }
  });

  it("returns a user-facing error message when routing and fallback both fail", async () => {
    const intentRoute = vi.fn(async () => {
      throw new Error("intent route failed");
    });
    const llmChat = vi.fn(async () => {
      throw new Error("llm failed");
    });

    const result = await resolveAssistantResponse({
      userMessage: HOME_QUICK_COMMANDS[4],
      isAuthenticated: true,
      intentRoute,
      llmChat,
    });

    expect(intentRoute).toHaveBeenCalledTimes(1);
    expect(llmChat).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      text: GENERIC_ERROR_MESSAGE,
      failed: true,
    });
  });

  it("formats list-style intent results for chat display", () => {
    const text = formatIntentRouteResult({
      handled: true,
      response: "메일 요약을 가져왔습니다.",
      data: { emailList: "1. 제목 A\n2. 제목 B" },
    });

    expect(text).toBe("메일 요약을 가져왔습니다.\n\n1. 제목 A\n2. 제목 B");
  });
});
