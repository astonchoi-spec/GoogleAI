import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type OpenClawAuthType = "none" | "bearer" | "x-api-key" | "unknown";

export type OpenClawDiscoveryResult = {
  found: boolean;
  url: string | null;
  healthEndpoint: string | null;
  taskEndpoint: string | null;
  authType: OpenClawAuthType;
  detectedAt: string;
  source: "scan" | "docker" | "env" | "cache" | "none";
  reason?: string;
};

export type DiscoveryOptions = {
  hosts?: string[];
  ports?: number[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  execDockerPs?: () => Promise<string>;
};

const DEFAULT_HOSTS = ["localhost", "127.0.0.1", "host.docker.internal"];
const DEFAULT_PORTS = [8000, 8002, 52108, 8080, 8888, 3000, 5000, 7860, 11434];
const HEALTH_ENDPOINTS = ["/health", "/api/health", "/v1/health", "/"];
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

function isOpenClawBody(body: string, endpoint: string): boolean {
  const lower = body.toLowerCase();
  if (lower.includes("openclaw")) return true;
  if (endpoint === "/") return false;
  return /"?(status|ok|healthy)"?\s*:?\s*"?\s*(ok|true|healthy|up)/i.test(body);
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
): Promise<OpenClawDiscoveryResult | null> {
  for (const host of hosts) {
    for (const port of ports) {
      const baseUrl = buildUrl(host, port);
      for (const endpoint of HEALTH_ENDPOINTS) {
        const { ok, text } = await fetchText(`${baseUrl}${endpoint}`, fetchImpl, ms);
        if (ok && isOpenClawBody(text, endpoint)) {
          return {
            found: true,
            url: baseUrl,
            healthEndpoint: endpoint,
            taskEndpoint: null,
            authType: "unknown",
            detectedAt: new Date().toISOString(),
            source,
          };
        }
      }
    }
  }
  return null;
}

export async function discoverOpenClaw(options: DiscoveryOptions = {}): Promise<OpenClawDiscoveryResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const hosts = options.hosts ?? DEFAULT_HOSTS;
  const basePorts = options.ports ?? DEFAULT_PORTS;
  const ms = options.timeoutMs ?? timeoutMs();
  const envUrl = process.env.OPENCLAW_API_URL?.trim();
  if (envUrl) {
    return { found: true, url: envUrl, healthEndpoint: null, taskEndpoint: null, authType: "unknown", detectedAt: new Date().toISOString(), source: "env" };
  }

  const dockerOutput = await (options.execDockerPs ?? defaultDockerPs)();
  const dockerPorts = parseDockerPorts(dockerOutput);
  if (dockerPorts.length > 0) {
    const dockerResult = await scanCandidates(hosts, dockerPorts, fetchImpl, ms, "docker");
    if (dockerResult) return dockerResult;
  }

  const scanResult = await scanCandidates(hosts, basePorts, fetchImpl, ms, "scan");
  if (scanResult) return scanResult;
  return { found: false, url: null, healthEndpoint: null, taskEndpoint: null, authType: "none", detectedAt: new Date().toISOString(), source: "none", reason: "후보 포트와 Docker 컨테이너에서 OpenClaw 응답을 찾지 못했습니다." };
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
