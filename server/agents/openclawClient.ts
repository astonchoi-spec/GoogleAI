import fs from "node:fs/promises";
import path from "node:path";
import type { AgentTask } from "./agentTypes.ts";
import {
  discoverOpenClaw,
  loadDiscovery,
  saveDiscovery,
  type OpenClawAuthType,
  type OpenClawDiscoveryResult,
} from "./openclawDiscovery.ts";
import {
  loadGatewayCaller,
  loadOpenClawLocalConfig,
  syncOpenClawEnv,
  toGatewayWsUrl,
} from "./openclawRuntime.ts";

export type OpenClawStatus = {
  available: boolean;
  simulationMode: boolean;
  url: string | null;
  authType: OpenClawAuthType;
  authSource: "env" | "openclaw-config" | "none" | "unknown";
  healthEndpoint: string | null;
  taskEndpoint: string | null;
  transport: "http" | "gateway-rpc" | "unknown";
  endpointPattern: string | null;
  model: string | null;
  lastProbeAt: string | null;
  reason?: string;
};

export type OpenClawRunResult = {
  ok: boolean;
  markdown: string;
  fallback: boolean;
  reason?: string;
};

type GatewayCall = (options: {
  method: string;
  params: Record<string, unknown>;
  timeoutMs?: number;
  url?: string;
  token?: string;
}) => Promise<unknown>;

type ClientOptions = {
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  gatewayCall?: GatewayCall;
};

const TASK_ENDPOINTS = ["/api/tasks", "/v1/run", "/execute"];
const RESULT_KEYS = ["result", "output", "content", "text"];

function requestTimeoutMs(): number {
  const raw = Number(process.env.OPENCLAW_REQUEST_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30000;
}

function getApiKey(): string | null {
  return process.env.OPENCLAW_API_KEY?.trim() || null;
}

function headersFor(authType: OpenClawAuthType): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = getApiKey();
  if (key && authType === "bearer") headers.authorization = `Bearer ${key}`;
  if (key && authType === "x-api-key") headers["x-api-key"] = key;
  return headers;
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of RESULT_KEYS) {
      const nested = extractText(obj[key]);
      if (nested) return nested;
    }
    const choices = obj.choices;
    if (Array.isArray(choices)) {
      for (const choice of choices) {
        const nested = extractText(choice);
        if (nested) return nested;
      }
    }
    const message = obj.message;
    if (message && typeof message === "object") {
      const nested = extractText((message as Record<string, unknown>).content);
      if (nested) return nested;
    }
  }
  return null;
}

function extractAssistantText(messages: unknown[] | undefined): string | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as { role?: string; content?: Array<{ type?: string; text?: string }> };
    if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
    const text = message.content
      .filter((entry) => entry?.type === "text" && typeof entry.text === "string")
      .map((entry) => entry.text?.trim() || "")
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return null;
}

async function readNotebookUrl(target: string): Promise<string | null> {
  const root = process.env.DEALS_ROOT?.trim();
  if (!root) return null;
  const compactTarget = target.replace(/\s+/g, "").toLowerCase();
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const compactName = entry.name.replace(/\s+/g, "").toLowerCase();
      if (!compactName.includes(compactTarget) && !compactTarget.includes(compactName)) continue;
      const raw = await fs.readFile(path.join(root, entry.name, "_deal.json"), "utf-8");
      const meta = JSON.parse(raw) as { notebookUrl?: string };
      return meta.notebookUrl?.trim() || null;
    }
  } catch (err) {
    console.error("[openclawClient] readNotebookUrl:", err);
  }
  return null;
}

async function buildPrompt(task: AgentTask): Promise<string> {
  if (task.templateId !== "notebook-query") {
    return [
      `템플릿: ${task.templateLabel}`,
      `대상: ${task.target}`,
      `입력: ${JSON.stringify(task.inputs)}`,
      "핵심만 마크다운으로 답하고, 결론과 리스크와 다음 행동을 짧게 정리해줘.",
    ].join("\n");
  }
  const notebookUrl = await readNotebookUrl(task.target);
  return [
    "NotebookLM 사이트(notebooklm.google.com)에서 아래 작업을 수행해줘.",
    notebookUrl ? `노트북 URL: ${notebookUrl}` : "노트북 URL: _deal.json에서 찾지 못함",
    `질문: ${task.inputs?.question ?? task.target}`,
    "질문 입력 후 답변을 기다리고 텍스트를 추출해줘.",
    "결과는 한국어 마크다운으로 반환해줘.",
  ].join("\n");
}

export class OpenClawClient {
  private status: OpenClawStatus = {
    available: false,
    simulationMode: true,
    url: null,
    authType: "none",
    authSource: "unknown",
    healthEndpoint: null,
    taskEndpoint: null,
    transport: "unknown",
    endpointPattern: null,
    model: null,
    lastProbeAt: null,
  };
  private discovery: OpenClawDiscoveryResult | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly gatewayCall?: GatewayCall;

  constructor(options: ClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.requestTimeoutMs ?? requestTimeoutMs();
    this.gatewayCall = options.gatewayCall;
  }

  getStatus(): OpenClawStatus {
    return { ...this.status };
  }

  async probe(): Promise<OpenClawStatus> {
    const local = await loadOpenClawLocalConfig();
    if (!process.env.OPENCLAW_API_URL?.trim() && local.apiKey) {
      await syncOpenClawEnv({
        OPENCLAW_API_URL: "http://127.0.0.1:8000",
        OPENCLAW_API_KEY: local.apiKey,
        AGENT_PERMISSION_LEVEL: "2",
        OPENCLAW_REQUEST_TIMEOUT_MS: "60000",
      });
    }
    const cached = await loadDiscovery();
    const envUrl = process.env.OPENCLAW_API_URL?.trim();
    this.discovery = envUrl
      ? { found: true, url: envUrl, healthEndpoint: null, taskEndpoint: null, authType: "unknown", detectedAt: new Date().toISOString(), source: "env" }
      : cached?.found
        ? cached
        : await discoverOpenClaw({ fetchImpl: this.fetchImpl });
    if (!this.discovery.found || !this.discovery.url) {
      await saveDiscovery(this.discovery);
      this.status = {
        available: false,
        simulationMode: true,
        url: null,
        authType: "none",
        authSource: local.authSource,
        healthEndpoint: null,
        taskEndpoint: null,
        transport: "unknown",
        endpointPattern: null,
        model: local.model,
        lastProbeAt: new Date().toISOString(),
        reason: this.discovery.reason,
      };
      return this.getStatus();
    }
    const authType = await this.detectAuth(this.discovery.url, this.discovery.healthEndpoint);
    if (authType === "unknown") {
      this.status = {
        available: false,
        simulationMode: true,
        url: this.discovery.url,
        authType,
        authSource: local.authSource,
        healthEndpoint: this.discovery.healthEndpoint,
        taskEndpoint: null,
        transport: "unknown",
        endpointPattern: null,
        model: local.model,
        lastProbeAt: new Date().toISOString(),
        reason: "OpenClaw health 인증 확인 실패",
      };
      await saveDiscovery({ ...this.discovery, authType });
      return this.getStatus();
    }
    const rpcReady = await this.probeGatewayRpc(this.discovery.url, local.apiKey);
    this.status = {
      available: rpcReady,
      simulationMode: !rpcReady,
      url: this.discovery.url,
      authType: rpcReady && local.apiKey ? "bearer" : authType,
      authSource: local.authSource,
      healthEndpoint: this.discovery.healthEndpoint,
      taskEndpoint: rpcReady ? "gateway:sessions.send" : this.discovery.taskEndpoint,
      transport: rpcReady ? "gateway-rpc" : "http",
      endpointPattern: rpcReady ? "sessions.create -> sessions.send -> agent.wait -> chat.history" : null,
      model: local.model,
      lastProbeAt: new Date().toISOString(),
      reason: rpcReady ? undefined : "Gateway RPC 연결 실패",
    };
    await saveDiscovery({ ...this.discovery, authType });
    return this.getStatus();
  }

  private async detectAuth(baseUrl: string, endpoint: string | null): Promise<OpenClawAuthType> {
    const healthPath = endpoint ?? "/health";
    const authTypes: OpenClawAuthType[] = ["none", "bearer", "x-api-key"];
    for (const authType of authTypes) {
      try {
        const response = await fetchWithTimeout(this.fetchImpl, `${normalizeBase(baseUrl)}${healthPath}`, {
          method: "GET",
          headers: headersFor(authType),
        }, this.timeoutMs);
        if (response.ok) return authType;
      } catch (err) {
        console.error("[openclawClient] detectAuth:", err instanceof Error ? err.message : err);
      }
    }
    return "unknown";
  }

  private async probeGatewayRpc(baseUrl: string, token: string | null): Promise<boolean> {
    if (!token) return false;
    try {
      const call = this.gatewayCall ?? await loadGatewayCaller();
      const result = await call({
        url: toGatewayWsUrl(baseUrl),
        token,
        method: "health",
        params: {},
        timeoutMs: Math.min(this.timeoutMs, 10000),
      });
      return Boolean((result as { ok?: boolean } | null)?.ok);
    } catch (err) {
      console.error("[openclawClient] probeGatewayRpc:", err instanceof Error ? err.message : err);
      return false;
    }
  }

  async runTask(task: AgentTask): Promise<OpenClawRunResult> {
    if (!this.status.available) await this.probe();
    if (!this.status.available || !this.status.url) {
      return { ok: false, markdown: "", fallback: true, reason: this.status.reason ?? "OpenClaw 미탐지" };
    }
    if (this.status.transport === "gateway-rpc") {
      const rpcResult = await this.runGatewayTask(task);
      if (rpcResult.ok) return rpcResult;
      const httpFallback = await this.runHttpFallback(task);
      return httpFallback.ok ? httpFallback : rpcResult;
    }
    return await this.runHttpFallback(task);
  }

  private async runGatewayTask(task: AgentTask): Promise<OpenClawRunResult> {
    const token = getApiKey();
    if (!token || !this.status.url) return { ok: false, markdown: "", fallback: true, reason: "OpenClaw 토큰 없음" };
    try {
      const call = this.gatewayCall ?? await loadGatewayCaller();
      const sessionKey = `agent:main:aston-${task.id}`;
      const label = `aston-${task.id}`;
      await call({
        url: toGatewayWsUrl(this.status.url),
        token,
        method: "sessions.create",
        params: { key: sessionKey, agentId: "main", label },
        timeoutMs: Math.min(this.timeoutMs, 10000),
      }).catch(() => null);
      await call({
        url: toGatewayWsUrl(this.status.url),
        token,
        method: "sessions.patch",
        params: { key: sessionKey, label, thinkingLevel: "off", model: this.status.model ?? "github-copilot/gpt-4.1" },
        timeoutMs: Math.min(this.timeoutMs, 10000),
      }).catch(() => null);
      const runId = `aston-${task.id}-${Date.now()}`;
      await call({
        url: toGatewayWsUrl(this.status.url),
        token,
        method: "sessions.send",
        params: {
          key: sessionKey,
          message: await buildPrompt(task),
          idempotencyKey: runId,
          timeoutMs: this.timeoutMs,
        },
        timeoutMs: Math.min(this.timeoutMs, 10000),
      });
      const waited = await call({
        url: toGatewayWsUrl(this.status.url),
        token,
        method: "agent.wait",
        params: { runId, timeoutMs: this.timeoutMs },
        timeoutMs: this.timeoutMs + 2000,
      });
      const waitStatus = (waited as { status?: string } | null)?.status;
      if (waitStatus !== "ok") {
        return { ok: false, markdown: "", fallback: true, reason: waitStatus === "timeout" ? "OpenClaw 응답 timeout" : "OpenClaw agent.wait 실패" };
      }
      const history = await call({
        url: toGatewayWsUrl(this.status.url),
        token,
        method: "chat.history",
        params: { sessionKey, limit: 20 },
        timeoutMs: Math.min(this.timeoutMs, 10000),
      });
      const text = extractAssistantText((history as { messages?: unknown[] } | null)?.messages);
      if (!text) return { ok: false, markdown: "", fallback: true, reason: "OpenClaw 응답 본문 없음" };
      this.status = { ...this.status, taskEndpoint: "gateway:sessions.send" };
      return { ok: true, markdown: text, fallback: false };
    } catch (err) {
      console.error("[openclawClient] runGatewayTask:", err instanceof Error ? err.message : err);
      return { ok: false, markdown: "", fallback: true, reason: err instanceof Error ? err.message : "OpenClaw gateway 호출 실패" };
    }
  }

  private async runHttpFallback(task: AgentTask): Promise<OpenClawRunResult> {
    if (!this.status.url) return { ok: false, markdown: "", fallback: true, reason: "OpenClaw URL 없음" };
    const baseUrl = normalizeBase(this.status.url);
    const prompt = await buildPrompt(task);
    const payloads = [
      { prompt, model: "default", tools: task.templateId === "notebook-query" ? ["browser"] : [] },
      { model: "default", messages: [{ role: "user", content: prompt }] },
    ];
    for (const endpoint of TASK_ENDPOINTS) {
      for (const payload of payloads) {
        try {
          const response = await fetchWithTimeout(this.fetchImpl, `${baseUrl}${endpoint}`, {
            method: "POST",
            headers: headersFor(this.status.authType),
            body: JSON.stringify(payload),
          }, this.timeoutMs);
          const bodyText = await response.text().catch(() => "");
          if (!response.ok) continue;
          let parsed: unknown = bodyText;
          try {
            parsed = bodyText ? JSON.parse(bodyText) : {};
          } catch {
            parsed = bodyText;
          }
          const result = extractText(parsed);
          if (result) {
            this.status = { ...this.status, taskEndpoint: endpoint, transport: "http" };
            return { ok: true, markdown: result, fallback: false };
          }
        } catch (err) {
          console.error("[openclawClient] runHttpFallback:", err instanceof Error ? err.message : err);
        }
      }
    }
    return { ok: false, markdown: "", fallback: true, reason: "OpenClaw 실행 엔드포인트를 찾지 못했습니다" };
  }
}

let singleton: OpenClawClient | null = null;

export function getOpenClawClient(): OpenClawClient {
  singleton ??= new OpenClawClient();
  return singleton;
}

export function resetOpenClawClientForTesting(client: OpenClawClient | null = null): void {
  singleton = client;
}
