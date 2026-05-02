import fs from "node:fs/promises";
import path from "node:path";
import { getTemplate } from "./agentTemplates.ts";
import type { AgentTask } from "./agentTypes.ts";
import {
  discoverOpenClaw,
  loadDiscovery,
  saveDiscovery,
  type OpenClawAuthType,
  type OpenClawDiscoveryResult,
} from "./openclawDiscovery.ts";
import { loadGatewayCaller, loadOpenClawLocalConfig, toGatewayWsUrl } from "./openclawRuntime.ts";

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
  modelHint: string | null;
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

type PromptRequest = {
  prompt: string;
  task: AgentTask;
  tools?: string[];
};

const TASK_ENDPOINTS = ["/api/tasks", "/v1/run", "/execute"];
const RESULT_KEYS = ["result", "output", "content", "text"];

function requestTimeoutMs(): number {
  const raw = Number(process.env.OPENCLAW_REQUEST_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 120000;
}

function getGatewayToken(): string | null {
  return process.env.OPENCLAW_API_KEY?.trim() || null;
}

function headersFor(authType: OpenClawAuthType): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = getGatewayToken();
  if (key && authType === "bearer") headers.authorization = `Bearer ${key}`;
  if (key && authType === "x-api-key") headers["x-api-key"] = key;
  return headers;
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
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
    if (Array.isArray(obj.choices)) {
      for (const choice of obj.choices) {
        const nested = extractText(choice);
        if (nested) return nested;
      }
    }
    if (obj.message && typeof obj.message === "object") {
      const nested = extractText((obj.message as Record<string, unknown>).content);
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

async function buildPrompt(task: AgentTask): Promise<PromptRequest> {
  const template = getTemplate(task.templateId);
  if (task.templateId !== "notebook-query") {
    return {
      task,
      prompt: [
        `템플릿: ${task.templateLabel}`,
        `대상: ${task.target}`,
        `입력값: ${JSON.stringify(task.inputs)}`,
        template?.instructions ? `지시사항:\n${template.instructions}` : null,
        "응답은 한국어 마크다운으로 작성하고, 결론과 리스크와 다음 행동을 짧게 정리해줘.",
      ].filter(Boolean).join("\n"),
      tools: [],
    };
  }

  const notebookUrl = await readNotebookUrl(task.target);
  return {
    task,
    prompt: [
      template?.instructions ?? "NotebookLM 웹사이트를 열고 질문을 처리해줘.",
      notebookUrl ? `notebookUrl: ${notebookUrl}` : "notebookUrl: 없음",
      `dealName: ${task.target}`,
      `question: ${task.inputs.question ?? task.target}`,
    ].join("\n"),
    tools: ["browser"],
  };
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
    modelHint: null,
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
    const cached = await loadDiscovery();
    const envUrl = process.env.OPENCLAW_API_URL?.trim();
    const autoDetect = process.env.OPENCLAW_AUTO_DETECT !== "false";
    const scanned = envUrl ? null : await discoverOpenClaw({ fetchImpl: this.fetchImpl });
    this.discovery = envUrl
      ? {
          found: true,
          url: envUrl,
          healthEndpoint: null,
          taskEndpoint: null,
          authType: "unknown",
          detectedAt: new Date().toISOString(),
          source: "env",
          modelHint: local.modelHint,
          configFiles: local.configFiles,
        }
      : scanned?.found
        ? scanned
        : cached?.found
          ? cached
          : scanned!;

    if (!this.discovery.found || !this.discovery.url) {
      await saveDiscovery({
        ...this.discovery,
        modelHint: local.modelHint,
        configFiles: local.configFiles,
      });
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
        modelHint: local.modelHint,
        lastProbeAt: new Date().toISOString(),
        reason: this.discovery.reason,
      };
      return this.getStatus();
    }

    let authType = await this.detectAuth(this.discovery.url, this.discovery.healthEndpoint);
    if (authType === "unknown" && envUrl && autoDetect) {
      // MODIFIED: stale manual URL must not block fresh detection after OpenClaw re-initialization.
      const redetected = await discoverOpenClaw({ fetchImpl: this.fetchImpl, ignoreEnv: true });
      if (redetected.found && redetected.url) {
        this.discovery = redetected;
        authType = await this.detectAuth(redetected.url, redetected.healthEndpoint);
      }
    }
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
        modelHint: local.modelHint,
        lastProbeAt: new Date().toISOString(),
        reason: "OpenClaw health 인증 확인 실패",
      };
      await saveDiscovery({ ...this.discovery, authType, modelHint: local.modelHint, configFiles: local.configFiles });
      return this.getStatus();
    }

    const discoveredUrl = this.discovery.url;
    if (!discoveredUrl) {
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
        modelHint: local.modelHint,
        lastProbeAt: new Date().toISOString(),
        reason: "OpenClaw URL 확인 실패",
      };
      return this.getStatus();
    }
    const rpcReady = await this.probeGatewayRpc(discoveredUrl, local.apiKey);
    this.status = {
      available: true,
      simulationMode: false,
      url: discoveredUrl,
      authType: rpcReady && local.apiKey ? "bearer" : authType,
      authSource: local.authSource,
      healthEndpoint: this.discovery.healthEndpoint,
      taskEndpoint: rpcReady ? "gateway:sessions.send" : this.discovery.taskEndpoint,
      transport: rpcReady ? "gateway-rpc" : "http",
      endpointPattern: rpcReady ? "sessions.create -> sessions.send -> agent.wait -> chat.history" : null,
      model: local.model,
      modelHint: local.modelHint,
      lastProbeAt: new Date().toISOString(),
      reason: undefined,
    };
    await saveDiscovery({
      ...this.discovery,
      authType: this.status.authType,
      modelHint: local.modelHint,
      configFiles: local.configFiles,
    });
    return this.getStatus();
  }

  private async detectAuth(baseUrl: string, endpoint: string | null): Promise<OpenClawAuthType> {
    const healthPath = endpoint ?? "/health";
    const authTypes: OpenClawAuthType[] = ["none", "bearer", "x-api-key"];
    for (const authType of authTypes) {
      try {
        const response = await fetchWithTimeout(
          this.fetchImpl,
          `${normalizeBase(baseUrl)}${healthPath}`,
          { method: "GET", headers: headersFor(authType) },
          this.timeoutMs,
        );
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
    const promptRequest = await buildPrompt(task);
    return this.runPrompt(promptRequest.prompt, { task, tools: promptRequest.tools });
  }

  async runPrompt(prompt: string, options: { task?: AgentTask; tools?: string[] } = {}): Promise<OpenClawRunResult> {
    if (!this.status.available) await this.probe();
    if (!this.status.available || !this.status.url) {
      return { ok: false, markdown: "", fallback: true, reason: this.status.reason ?? "OpenClaw 미탐지" };
    }

    const task = options.task ?? {
      id: `smoke-${Date.now()}`,
      templateId: "openclaw-smoke",
      templateLabel: "OpenClaw Smoke",
      target: "smoke",
      inputs: {},
      status: "running",
      createdAt: new Date().toISOString(),
    };

    if (this.status.transport === "gateway-rpc") {
      const rpcResult = await this.runGatewayPrompt({ prompt, task, tools: options.tools });
      if (rpcResult.ok) return rpcResult;
    }

    return this.runHttpFallback({ prompt, task, tools: options.tools });
  }

  private async runGatewayPrompt(request: PromptRequest): Promise<OpenClawRunResult> {
    const token = getGatewayToken();
    if (!token || !this.status.url) return { ok: false, markdown: "", fallback: true, reason: "OpenClaw 토큰 없음" };
    try {
      const call = this.gatewayCall ?? await loadGatewayCaller();
      const sessionKey = `agent:main:aston-${request.task.id}`;
      const label = `aston-${request.task.id}`;
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
        params: {
          key: sessionKey,
          label,
          thinkingLevel: "off",
          model: process.env.OPENCLAW_DEFAULT_MODEL?.trim() || this.status.model || "google/gemini",
        },
        timeoutMs: Math.min(this.timeoutMs, 10000),
      }).catch(() => null);
      const runId = `aston-${request.task.id}-${Date.now()}`;
      await call({
        url: toGatewayWsUrl(this.status.url),
        token,
        method: "sessions.send",
        params: {
          key: sessionKey,
          message: request.prompt,
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
      this.status = { ...this.status, available: true, simulationMode: false, taskEndpoint: "gateway:sessions.send", transport: "gateway-rpc" };
      return { ok: true, markdown: text, fallback: false };
    } catch (err) {
      console.error("[openclawClient] runGatewayPrompt:", err instanceof Error ? err.message : err);
      return { ok: false, markdown: "", fallback: true, reason: err instanceof Error ? err.message : "OpenClaw gateway 호출 실패" };
    }
  }

  private async runHttpFallback(request: PromptRequest): Promise<OpenClawRunResult> {
    if (!this.status.url) return { ok: false, markdown: "", fallback: true, reason: "OpenClaw URL 없음" };
    const baseUrl = normalizeBase(this.status.url);
    const local = await loadOpenClawLocalConfig();
    const payloads = [
      {
        prompt: request.prompt,
        model: process.env.OPENCLAW_DEFAULT_MODEL?.trim() || this.status.model || local.modelHint || "google/gemini",
        tools: request.tools ?? [],
        providerApiKey: local.geminiApiKey ?? undefined, // MODIFIED: reuse Aston Gemini key only in-memory when OpenClaw supports provider-side key injection.
      },
      {
        model: process.env.OPENCLAW_DEFAULT_MODEL?.trim() || this.status.model || local.modelHint || "google/gemini",
        messages: [{ role: "user", content: request.prompt }],
        providerApiKey: local.geminiApiKey ?? undefined,
      },
    ];

    for (const endpoint of TASK_ENDPOINTS) {
      for (const payload of payloads) {
        try {
          const response = await fetchWithTimeout(
            this.fetchImpl,
            `${baseUrl}${endpoint}`,
            {
              method: "POST",
              headers: headersFor(this.status.authType),
              body: JSON.stringify(payload),
            },
            this.timeoutMs,
          );
          const bodyText = await response.text().catch(() => "");
          if (!response.ok) continue;
          let parsed: unknown = bodyText;
          try {
            parsed = bodyText ? JSON.parse(bodyText) : {};
          } catch {
            parsed = bodyText;
          }
          const result = extractText(parsed);
          if (!result) continue;
          this.status = { ...this.status, available: true, simulationMode: false, taskEndpoint: endpoint, transport: "http" };
          return { ok: true, markdown: result, fallback: false };
        } catch (err) {
          console.error("[openclawClient] runHttpFallback:", err instanceof Error ? err.message : err);
        }
      }
    }

    return { ok: false, markdown: "", fallback: true, reason: "OpenClaw 실행 엔드포인트를 찾지 못했습니다." };
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

