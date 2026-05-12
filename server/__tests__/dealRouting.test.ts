import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  classifyIntent,
  formatIntentRouteMessage,
  routeIntentMessage,
  type IntentRouteResponse,
} from "../intent/intentService.ts";

vi.mock("../_core/llmAdapter.ts", () => ({
  llmAdapter: {
    parseJson: vi.fn(),
    chat: vi.fn(),
  },
}));

let tmpDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `deal-routing-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  process.env.DEALS_ROOT = tmpDir;
});

afterEach(async () => {
  delete process.env.DEALS_ROOT;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("deal intent routing priority", () => {
  it.each([
    "딜 추가 한남동644",
    "딜 목록",
    "딜 한남동644",
    "딜 노트북 한남동644 https://notebooklm.google.com/notebook/xxx",
    "딜 상태 한남동644 완료",
    "딜시트",
    "딜시트 서식",
  ])("routes %s to deals_command before other domains", async (message) => {
    const intent = await classifyIntent(message);
    expect(intent.domain).toBe("deals");
    expect(intent.action).toBe("deals_command");
    expect(intent.confidence).toBeGreaterThanOrEqual(0.98);
  });

  it("executes create/list/detail/notebook deal commands without JSON output", async () => {
    const create = await routeIntentMessage({ userId: "1", message: "딜 추가 한남동644", allowExecute: true });
    expect(create.intent.domain).toBe("deals");
    expect(create.response).toContain("✅ 딜 추가 완료");
    expect(formatIntentRouteMessage(create)).not.toContain("{");

    const list = await routeIntentMessage({ userId: "1", message: "딜 목록", allowExecute: true });
    expect(list.intent.action).toBe("deals_command");
    expect(list.response).toContain("📋 딜 목록 (1건)");
    expect(list.response).toContain("한남동644");

    const detail = await routeIntentMessage({ userId: "1", message: "딜 한남동644", allowExecute: true });
    expect(detail.response).toContain("📁 한남동644");
    expect(detail.response).toContain("자료 (0건)");

    const notebook = await routeIntentMessage({
      userId: "1",
      message: "딜 노트북 한남동644 https://notebooklm.google.com/notebook/7f6bacf1-cb37-4a14-a630-99cdeb5b7556",
      allowExecute: true,
    });
    expect(notebook.response).toContain("✅ NotebookLM 링크 등록 완료");
    expect(notebook.response).toContain("7f6bacf1-cb37-4a14-a630-99cdeb5b7556");
  });

  it("keeps non-deal regression routes intact", async () => {
    await expect(classifyIntent("내일 오후 3시 미팅 추가")).resolves.toMatchObject({
      domain: "google",
      action: "google_create_event",
    });
    await expect(classifyIntent("구글 드라이브 검색 보고서")).resolves.toMatchObject({
      domain: "google",
      action: "google_drive_search",
    });
    await expect(classifyIntent("위키 검색 briefing")).resolves.toMatchObject({
      domain: "wiki",
      action: "wiki_search",
    });
    await expect(classifyIntent("브리핑 테스트")).resolves.toMatchObject({
      domain: "intelligence",
      action: "intelligence_morning_briefing",
    });
  });

  it("blocks raw object previews in formatted intent output", () => {
    const routed: IntentRouteResponse = {
      intent: { domain: "realestate", action: "realestate_land_use", type: "query", confidence: 0.6, params: {} },
      handled: true,
      requiresConfirmation: false,
      response: "토지이용규제 정보를 조회했습니다.",
      data: { method: "realestate.landUse", params: { pnu: "test" } },
    };

    const text = formatIntentRouteMessage(routed);
    expect(text).toContain("토지이용규제 정보를 조회했습니다.");
    expect(text).toContain("내부 데이터");
    expect(text).not.toContain('"method"');
    expect(text).not.toContain("{");
  });
});
