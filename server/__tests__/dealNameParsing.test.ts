import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { classifyIntent, routeIntentMessage } from "../intent/intentService.ts";

vi.mock("../_core/llmAdapter.ts", () => ({
  llmAdapter: {
    parseJson: vi.fn(),
    chat: vi.fn(),
  },
}));

let tmpDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `deal-name-parsing-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  process.env.DEALS_ROOT = tmpDir;
});

afterEach(async () => {
  delete process.env.DEALS_ROOT;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("deal name parsing in PF status queries", () => {
  it.each([
    ["한남 PF 진행상황", "한남"],
    ["서초 PF 상태", "서초"],
    ["용산 진행상황", "용산"],
    ["강남 현황", "강남"],
  ])("routes %s to deals_command with synthetic command", async (message, expectedDealName) => {
    const intent = await classifyIntent(message);
    expect(intent.domain).toBe("deals");
    expect(intent.action).toBe("deals_command");
    expect(intent.params.syntheticCommand).toBe(`딜 ${expectedDealName}`);
  });

  it.each([
    "PF 진행상황",
    "포트폴리오 상태",
    "전체 현황",
  ])("does not match reserved keyword %s as deal name", async (message) => {
    const intent = await classifyIntent(message);
    expect(intent.action).not.toBe("deals_command");
  });

  it("executes deal detail when synthetic command is set", async () => {
    // 딜 생성 후 진행상황 질의 → 딜 상세로 라우팅되는지 확인
    await routeIntentMessage({ userId: "1", message: "딜 추가 한남동644", allowExecute: true });
    const status = await routeIntentMessage({
      userId: "1",
      message: "한남동644 PF 진행상황",
      allowExecute: true,
    });
    expect(status.intent.domain).toBe("deals");
    expect(status.response).toContain("📁 한남동644");
  });
});
