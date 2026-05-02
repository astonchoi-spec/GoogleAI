import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { OpenClawConfigFileStatus } from "./openclawRuntime.ts";

export type OpenClawAuthType = "none" | "bearer" | "x-api-key" | "unknown";

export type OpenClawDiscoveryCandidate = {
  url: string;
  endpoint: string;
  marker: string;
  source: "scan" | "docker";
};

export type OpenClawDiscoveryResult = {
  found: boolean;
  url: string | null;
  healthEndpoint: string | null;
  taskEndpoint: string | null;
  authType: OpenClawAuthType;
  detectedAt: string;
  source: "scan" | "docker" | "env" | "cache" | "none";
  reason?: string;
  candidates?: OpenClawDiscoveryCandidate[];
  modelHint?: string | null;
  configFiles?: OpenClawConfigFileStatus[];
};

export type DiscoveryOptions = {
  hosts?: string[];
  ports?: number[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  execDockerPs?: () => Promise<string>;
  ignoreEnv?: boolean;
};

const DEFAULT_HOSTS = ["localhost", "127.0.0.1", "host.docker.internal"];
const DEFAULT_PORTS = [8000, 8080, 8888, 3000, 5000, 7860, 11434];
const HEALTH_ENDPOINTS = ["/health", "/api/health", "/v1/health", "/"];
const BODY_MARKERS = ["openclaw", "claw", "agent", "api"];
const execFileAsync = promisify(execFile);

export function getDiscoveryPath(): string {
  return path.resolve(process.cwd(), "data", "openclaw-discovery.json");
}

function timeoutMs(): number {
  const raw = Number(process.env.OPENCLAW_PROBE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 3000;
}

function buildUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

function detectMarker(body: string, endpoint: string): string | null {
  const lower = body.toLowerCase();
  const bodyMarker = BODY_MARKERS.find((marker) => lower.includes(marker));
  if (bodyMarker) return bodyMarker;
  if (endpoint !== "/" && /"?(status|ok|healthy)"?\s*:?\s*"?\s*(ok|true|healthy|up)/i.test(body)) {
    return "health";
  }
  return null;
}

async function fetchText(url: string, fetchImpl: typeof fetch, ms: number): Promise<{ ok: boolean; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetchImpl(url, { method: "GET", signal: controller.signal });
    const text = await response.text().catch(() => "");
    return { ok: response.ok, text };
  } catch {
    return { ok: false, text: "" };
  } finally {
    clearTimeout(timer);
  }
}

async function defaultDockerPs(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("docker", ["ps", "--format", "{{.Names}} {{.Ports}}"], { windowsHide: true });
    return stdout;
  } catch (err) {
    console.warn("[openclawDiscovery] docker ps unavailable:", err instanceof Error ? err.message : err);
    return "";
  }
}

export function parseDockerPorts(output: string): number[] {
  const ports = new Set<number>();
  for (const line of output.split(/\r?\n/)) {
    if (!/openclaw/i.test(line)) continue;
    for (const match of line.matchAll(/(?:0\.0\.0\.0|127\.0\.0\.1|\[::\])?:(\d+)->/g)) {
      ports.add(Number(match[1]));
    }
  }
  return [...ports].filter((port) => Number.isFinite(port));
}

async function scanCandidates(
  hosts: string[],
  ports: number[],
  fetchImpl: typeof fetch,
  ms: number,
  source: "scan" | "docker",
): Promise<OpenClawDiscoveryCandidate[]> {
  const matches: OpenClawDiscoveryCandidate[] = [];
  for (const host of hosts) {
    for (const port of ports) {
      const baseUrl = buildUrl(host, port);
      for (const endpoint of HEALTH_ENDPOINTS) {
        const { ok, text } = await fetchText(`${baseUrl}${endpoint}`, fetchImpl, ms);
        const marker = ok ? detectMarker(text, endpoint) : null;
        if (!ok || !marker) continue;
        matches.push({ url: baseUrl, endpoint, marker, source });
      }
    }
  }
  return matches;
}

export async function discoverOpenClaw(options: DiscoveryOptions = {}): Promise<OpenClawDiscoveryResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const hosts = options.hosts ?? DEFAULT_HOSTS;
  const basePorts = options.ports ?? DEFAULT_PORTS;
  const ms = options.timeoutMs ?? timeoutMs();
  const envUrl = process.env.OPENCLAW_API_URL?.trim();
  if (envUrl && !options.ignoreEnv) {
    return {
      found: true,
      url: envUrl,
      healthEndpoint: null,
      taskEndpoint: null,
      authType: "unknown",
      detectedAt: new Date().toISOString(),
      source: "env",
      candidates: [{ url: envUrl, endpoint: "(env)", marker: "env", source: "scan" }],
    };
  }

  const dockerOutput = await (options.execDockerPs ?? defaultDockerPs)();
  const dockerPorts = parseDockerPorts(dockerOutput);
  const dockerMatches = dockerPorts.length > 0 ? await scanCandidates(hosts, dockerPorts, fetchImpl, ms, "docker") : [];
  if (dockerMatches.length > 0) {
    const best = dockerMatches[0];
    return {
      found: true,
      url: best.url,
      healthEndpoint: best.endpoint,
      taskEndpoint: null,
      authType: "unknown",
      detectedAt: new Date().toISOString(),
      source: "docker",
      candidates: dockerMatches,
    };
  }

  const scanMatches = await scanCandidates(hosts, basePorts, fetchImpl, ms, "scan");
  if (scanMatches.length > 0) {
    const best = scanMatches[0];
    return {
      found: true,
      url: best.url,
      healthEndpoint: best.endpoint,
      taskEndpoint: null,
      authType: "unknown",
      detectedAt: new Date().toISOString(),
      source: "scan",
      candidates: scanMatches,
    };
  }

  return {
    found: false,
    url: null,
    healthEndpoint: null,
    taskEndpoint: null,
    authType: "none",
    detectedAt: new Date().toISOString(),
    source: "none",
    reason: "후보 포트와 Docker 컨테이너에서 OpenClaw 응답을 찾지 못했습니다.",
    candidates: [],
  };
}

export async function saveDiscovery(result: OpenClawDiscoveryResult): Promise<void> {
  const target = getDiscoveryPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
}

export async function loadDiscovery(): Promise<OpenClawDiscoveryResult | null> {
  try {
    const raw = await fs.readFile(getDiscoveryPath(), "utf-8");
    return JSON.parse(raw) as OpenClawDiscoveryResult;
  } catch {
    return null;
  }
}
