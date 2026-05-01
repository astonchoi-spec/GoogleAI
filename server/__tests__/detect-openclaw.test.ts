import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverOpenClaw, parseDockerPorts } from "../agents/openclawDiscovery.ts";

const ORIG_URL = process.env.OPENCLAW_API_URL;

beforeEach(() => {
  delete process.env.OPENCLAW_API_URL;
});

afterEach(() => {
  if (ORIG_URL === undefined) delete process.env.OPENCLAW_API_URL;
  else process.env.OPENCLAW_API_URL = ORIG_URL;
});

function mockFetch(routes: Record<string, { status?: number; body?: string }>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const route = routes[url] ?? { status: 404, body: "" };
    return new Response(route.body ?? "", { status: route.status ?? 200 });
  }) as typeof fetch;
}

describe("detect-openclaw", () => {
  it("detects OpenClaw on a health endpoint", async () => {
    const result = await discoverOpenClaw({
      hosts: ["localhost"],
      ports: [8000],
      execDockerPs: async () => "",
      fetchImpl: mockFetch({ "http://localhost:8000/health": { body: '{"service":"openclaw","status":"ok"}' } }),
    });
    expect(result.found).toBe(true);
    expect(result.url).toBe("http://localhost:8000");
    expect(result.healthEndpoint).toBe("/health");
  });

  it("detects OpenClaw from root body marker", async () => {
    const result = await discoverOpenClaw({
      hosts: ["127.0.0.1"],
      ports: [5000],
      execDockerPs: async () => "",
      fetchImpl: mockFetch({ "http://127.0.0.1:5000/": { body: "OpenClaw server" } }),
    });
    expect(result.found).toBe(true);
    expect(result.healthEndpoint).toBe("/");
  });

  it("returns a safe miss when no candidate responds", async () => {
    const result = await discoverOpenClaw({
      hosts: ["localhost"],
      ports: [1],
      execDockerPs: async () => "",
      fetchImpl: mockFetch({}),
    });
    expect(result.found).toBe(false);
    expect(result.reason).toMatch(/찾지 못했습니다/);
  });

  it("parses openclaw docker published ports", () => {
    const ports = parseDockerPorts("openclaw-app 0.0.0.0:7860->7860/tcp\nredis 6379/tcp");
    expect(ports).toEqual([7860]);
  });
});
