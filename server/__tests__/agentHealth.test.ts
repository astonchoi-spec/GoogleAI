import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAgentHealthSnapshot } from "../agents/agentHealth.ts";
import { OpenClawClient, resetOpenClawClientForTesting } from "../agents/openclawClient.ts";
import { saveOpenClawSmoke } from "../agents/openclawSmoke.ts";

const ORIG_ENV = {
  OPENCLAW_API_URL: process.env.OPENCLAW_API_URL,
  OPENCLAW_API_KEY: process.env.OPENCLAW_API_KEY,
  OPENCLAW_DEFAULT_MODEL: process.env.OPENCLAW_DEFAULT_MODEL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
};

beforeEach(() => {
  process.env.OPENCLAW_API_URL = "http://openclaw.local";
  process.env.OPENCLAW_API_KEY = "secret";
  process.env.OPENCLAW_DEFAULT_MODEL = "google/gemini-2.5-pro";
  process.env.GEMINI_API_KEY = "gemini-key";
});

afterEach(async () => {
  resetOpenClawClientForTesting(null);
  for (const [key, value] of Object.entries(ORIG_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await fs.rm("data/openclaw-smoke.json", { force: true });
  vi.restoreAllMocks();
});

describe("agentHealth", () => {
  it("returns flattened OpenClaw health fields and smoke metadata", async () => {
    const client = new OpenClawClient({
      fetchImpl: (async (_input, init) => {
        const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
        return new Response("ok", { status: auth === "Bearer secret" ? 200 : 401 });
      }) as typeof fetch,
      gatewayCall: vi.fn(async () => ({ ok: true })),
      requestTimeoutMs: 50,
    });
    resetOpenClawClientForTesting(client);
    await client.probe();
    await saveOpenClawSmoke({
      checkedAt: "2026-05-02T00:00:00.000Z",
      available: true,
      url: "http://openclaw.local",
      modelHint: "gemini",
      responsePreview: { arithmetic: "2", domain: "한남동 강보합" },
      errorReason: null,
      status: "passed",
    });

    const snapshot = await getAgentHealthSnapshot();
    expect(snapshot.openclawDetected).toBe(true);
    expect(snapshot.openclawUrl).toBe("http://openclaw.local");
    expect(snapshot.simulationMode).toBe(false);
    expect(snapshot.modelHint).toBe("google/gemini");
    expect(snapshot.lastSmokeAt).toBe("2026-05-02T00:00:00.000Z");
    expect(snapshot.lastSmokeStatus).toBe("passed");
    expect(snapshot.queueStatus).toEqual({ total: 0, active: 0, completed: 0, failed: 0 });
  });
});
