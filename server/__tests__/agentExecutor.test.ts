import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { makeAgentRunner, makeSimulationRunner, isSimulationMode } from "../agents/agentExecutor.ts";
import { OpenClawClient, resetOpenClawClientForTesting } from "../agents/openclawClient.ts";
import type { AgentTask } from "../agents/agentTypes.ts";

let tmpDir: string;
const ORIG_URL = process.env.OPENCLAW_API_URL;
const ORIG_PATH = process.env.AGENT_WIKI_PATH;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `agent-exec-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  process.env.AGENT_WIKI_PATH = tmpDir;
  delete process.env.OPENCLAW_API_URL;
});

afterEach(async () => {
  if (ORIG_URL === undefined) delete process.env.OPENCLAW_API_URL;
  else process.env.OPENCLAW_API_URL = ORIG_URL;
  if (ORIG_PATH === undefined) delete process.env.AGENT_WIKI_PATH;
  else process.env.AGENT_WIKI_PATH = ORIG_PATH;
  resetOpenClawClientForTesting(null);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "abc12",
    templateId: "pf-comprehensive",
    templateLabel: "PF 종합 분석",
    target: "한남동644",
    inputs: {},
    status: "running",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("agentExecutor", () => {
  it("isSimulationMode true when OPENCLAW_API_URL is empty", () => {
    expect(isSimulationMode()).toBe(true);
  });

  it("isSimulationMode false when URL is set", () => {
    process.env.OPENCLAW_API_URL = "http://localhost:9999";
    expect(isSimulationMode()).toBe(false);
  });

  it("simulation runner produces markdown and writes file", async () => {
    const runner = makeSimulationRunner({ sleepMs: 10 });
    const controller = new AbortController();
    const out = await runner(makeTask(), controller.signal);
    expect(out.markdown).toContain("PF 종합 분석");
    expect(out.markdown).toContain("한남동644");
    expect(out.wikiPath).toBeTruthy();
    expect(out.wikiPath?.endsWith(".md")).toBe(true);
    const written = await fs.readFile(out.wikiPath!, "utf-8");
    expect(written).toContain("PF 종합 분석");
  });

  it("aborting before completion rejects the runner", async () => {
    const runner = makeSimulationRunner({ sleepMs: 1000 });
    const controller = new AbortController();
    const promise = runner(makeTask(), controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow();
  });

  it("returns null wikiPath when AGENT_WIKI_PATH is unset", async () => {
    delete process.env.AGENT_WIKI_PATH;
    const runner = makeSimulationRunner({ sleepMs: 10 });
    const out = await runner(makeTask(), new AbortController().signal);
    expect(out.wikiPath).toBeNull();
  });

  it("renders different markdown per template", async () => {
    const runner = makeSimulationRunner({ sleepMs: 10 });
    const trading = await runner(makeTask({ templateId: "trading-decision", templateLabel: "트레이딩", target: "BTC", inputs: { side: "long" } }), new AbortController().signal);
    expect(trading.markdown).toMatch(/롱/);
    const legal = await runner(makeTask({ templateId: "pf-legal-risk", templateLabel: "법무", target: "한남동644" }), new AbortController().signal);
    expect(legal.markdown).toMatch(/리스크/);
  });

  it("agent runner falls back to simulation when OpenClaw task call fails", async () => {
    process.env.OPENCLAW_API_URL = "http://openclaw.local";
    const client = new OpenClawClient({
      fetchImpl: (async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/health")) return new Response("ok", { status: 200 });
        return new Response("", { status: 500 });
      }) as typeof fetch,
      requestTimeoutMs: 50,
    });
    resetOpenClawClientForTesting(client);
    const runner = makeAgentRunner({ sleepMs: 10 });
    const out = await runner(makeTask(), new AbortController().signal);
    expect(out.markdown).toContain("⚠️ OpenClaw 호출 실패");
    expect(out.markdown).toContain("시뮬레이션");
  });
});
