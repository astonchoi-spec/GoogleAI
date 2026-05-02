import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenClawClient } from "../agents/openclawClient.ts";
import type { AgentTask } from "../agents/agentTypes.ts";

const ORIG_ENV = {
  OPENCLAW_API_URL: process.env.OPENCLAW_API_URL,
  OPENCLAW_API_KEY: process.env.OPENCLAW_API_KEY,
  OPENCLAW_DEFAULT_MODEL: process.env.OPENCLAW_DEFAULT_MODEL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
};

function task(): AgentTask {
  return {
    id: "task1",
    templateId: "pf-comprehensive",
    templateLabel: "PF 종합 분석",
    target: "한남동44",
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
  process.env.OPENCLAW_API_KEY = "secret";
  process.env.OPENCLAW_DEFAULT_MODEL = "";
  process.env.GEMINI_API_KEY = "gemini-secret";
  delete process.env.GOOGLE_API_KEY;
});

afterEach(() => {
  for (const [key, value] of Object.entries(ORIG_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

describe("OpenClawClient", () => {
  it("detects bearer auth and gateway rpc", async () => {
    const gatewayCall = vi.fn(async () => ({ ok: true }));
    const client = new OpenClawClient({
      fetchImpl: mockFetch((_url, init) => {
        const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
        return new Response("ok", { status: auth === "Bearer secret" ? 200 : 401 });
      }),
      gatewayCall,
      requestTimeoutMs: 50,
    });
    const status = await client.probe();
    expect(status.available).toBe(true);
    expect(status.transport).toBe("gateway-rpc");
    expect(gatewayCall).toHaveBeenCalled();
  });

  it("runs through gateway rpc path", async () => {
    const gatewayCall = vi.fn(async ({ method }) => {
      if (method === "health") return { ok: true };
      if (method === "sessions.send") return { runId: "run1", status: "started" };
      if (method === "agent.wait") return { status: "ok" };
      if (method === "chat.history") {
        return { messages: [{ role: "assistant", content: [{ type: "text", text: "실제 응답" }] }] };
      }
      return { ok: true };
    });
    const client = new OpenClawClient({
      fetchImpl: mockFetch((_url, init) => {
        const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
        return new Response("ok", { status: auth === "Bearer secret" ? 200 : 401 });
      }),
      gatewayCall,
      requestTimeoutMs: 50,
    });
    await client.probe();
    const result = await client.runTask(task());
    expect(result.ok).toBe(true);
    expect(result.markdown).toBe("실제 응답");
  });

  it("falls back to http endpoint when gateway path times out", async () => {
    const gatewayCall = vi.fn(async ({ method }) => {
      if (method === "health") return { ok: true };
      if (method === "agent.wait") return { status: "timeout" };
      return { ok: true };
    });
    const client = new OpenClawClient({
      fetchImpl: mockFetch((url, init) => {
        const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
        if (url.endsWith("/health")) return new Response("ok", { status: auth === "Bearer secret" ? 200 : 401 });
        if (url.endsWith("/api/tasks")) return Response.json({ output: "HTTP fallback" });
        return new Response("", { status: 404 });
      }),
      gatewayCall,
      requestTimeoutMs: 50,
    });
    await client.probe();
    const result = await client.runTask(task());
    expect(result.ok).toBe(true);
    expect(result.markdown).toBe("HTTP fallback");
  });

  it("reuses Aston Gemini key in HTTP payload without exposing it in output", async () => {
    const gatewayCall = vi.fn(async ({ method }) => {
      if (method === "health") return { ok: false };
      return { status: "timeout" };
    });
    const seenBodies: string[] = [];
    const client = new OpenClawClient({
      fetchImpl: mockFetch((url, init) => {
        const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
        if (url.endsWith("/health")) return new Response("ok", { status: auth === "Bearer secret" ? 200 : 401 });
        if (url.endsWith("/api/tasks")) {
          seenBodies.push(String(init?.body ?? ""));
          return Response.json({ text: "provider key accepted" });
        }
        return new Response("", { status: 404 });
      }),
      gatewayCall,
      requestTimeoutMs: 50,
    });
    await client.probe();
    const result = await client.runTask(task());
    expect(result.ok).toBe(true);
    expect(seenBodies.some((body) => body.includes("providerApiKey"))).toBe(true);
    expect(result.markdown).not.toContain("gemini-secret");
  });

  it("returns fallback when both gateway and http fail", async () => {
    const gatewayCall = vi.fn(async ({ method }) => {
      if (method === "health") return { ok: true };
      if (method === "agent.wait") return { status: "timeout" };
      return { ok: true };
    });
    const client = new OpenClawClient({
      fetchImpl: mockFetch((url, init) => {
        const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
        if (url.endsWith("/health")) return new Response("ok", { status: auth === "Bearer secret" ? 200 : 401 });
        return new Response("", { status: 500 });
      }),
      gatewayCall,
      requestTimeoutMs: 50,
    });
    await client.probe();
    const result = await client.runTask(task());
    expect(result.fallback).toBe(true);
    expect(result.reason).toMatch(/실행 엔드포인트|timeout/);
  });
});
