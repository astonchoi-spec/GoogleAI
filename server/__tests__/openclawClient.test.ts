import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OpenClawClient } from "../agents/openclawClient.ts";
import type { AgentTask } from "../agents/agentTypes.ts";

const ORIG_URL = process.env.OPENCLAW_API_URL;
const ORIG_KEY = process.env.OPENCLAW_API_KEY;

function task(): AgentTask {
  return {
    id: "task1",
    templateId: "pf-comprehensive",
    templateLabel: "PF 종합 분석",
    target: "한남동644",
    inputs: {},
    status: "running",
    createdAt: new Date().toISOString(),
  };
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
}

beforeEach(() => {
  process.env.OPENCLAW_API_URL = "http://openclaw.local";
});

afterEach(() => {
  if (ORIG_URL === undefined) delete process.env.OPENCLAW_API_URL;
  else process.env.OPENCLAW_API_URL = ORIG_URL;
  if (ORIG_KEY === undefined) delete process.env.OPENCLAW_API_KEY;
  else process.env.OPENCLAW_API_KEY = ORIG_KEY;
});

describe("OpenClawClient", () => {
  it("detects no-auth health", async () => {
    const client = new OpenClawClient({
      fetchImpl: mockFetch(() => new Response("ok", { status: 200 })),
      requestTimeoutMs: 50,
    });
    const status = await client.probe();
    expect(status.available).toBe(true);
    expect(status.authType).toBe("none");
  });

  it("falls back to bearer auth when no-auth fails", async () => {
    process.env.OPENCLAW_API_KEY = "secret";
    const client = new OpenClawClient({
      fetchImpl: mockFetch((_url, init) => {
        const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
        return new Response("ok", { status: auth === "Bearer secret" ? 200 : 401 });
      }),
      requestTimeoutMs: 50,
    });
    const status = await client.probe();
    expect(status.authType).toBe("bearer");
  });

  it("uses X-API-Key auth after bearer fails", async () => {
    process.env.OPENCLAW_API_KEY = "secret";
    const client = new OpenClawClient({
      fetchImpl: mockFetch((_url, init) => {
        const key = (init?.headers as Record<string, string> | undefined)?.["x-api-key"];
        return new Response("ok", { status: key === "secret" ? 200 : 401 });
      }),
      requestTimeoutMs: 50,
    });
    const status = await client.probe();
    expect(status.authType).toBe("x-api-key");
  });

  it("extracts result from standard task endpoint", async () => {
    const client = new OpenClawClient({
      fetchImpl: mockFetch((url) => {
        if (url.endsWith("/health")) return new Response("ok", { status: 200 });
        if (url.endsWith("/api/tasks")) return Response.json({ result: "분석 완료" });
        return new Response("", { status: 404 });
      }),
      requestTimeoutMs: 50,
    });
    await client.probe();
    const result = await client.runTask(task());
    expect(result.ok).toBe(true);
    expect(result.markdown).toBe("분석 완료");
  });

  it("falls back to OpenAI-compatible response shape", async () => {
    const client = new OpenClawClient({
      fetchImpl: mockFetch((url) => {
        if (url.endsWith("/health")) return new Response("ok", { status: 200 });
        if (url.endsWith("/v1/run")) return Response.json({ choices: [{ message: { content: "호환 응답" } }] });
        return new Response("", { status: 404 });
      }),
      requestTimeoutMs: 50,
    });
    await client.probe();
    const result = await client.runTask(task());
    expect(result.ok).toBe(true);
    expect(result.markdown).toBe("호환 응답");
  });

  it("returns fallback when task endpoints fail", async () => {
    const client = new OpenClawClient({
      fetchImpl: mockFetch((url) => {
        if (url.endsWith("/health")) return new Response("ok", { status: 200 });
        return new Response("", { status: 500 });
      }),
      requestTimeoutMs: 50,
    });
    await client.probe();
    const result = await client.runTask(task());
    expect(result.fallback).toBe(true);
    expect(result.reason).toMatch(/엔드포인트/);
  });
});
