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

export type OpenClawStatus = {
  available: boolean;
  simulationMode: boolean;
  url: string | null;
  authType: OpenClawAuthType;
  healthEndpoint: string | null;
  taskEndpoint: string | null;
  lastProbeAt: string | null;
  reason?: string;
};

export type OpenClawRunResult = {
  ok: boolean;
  markdown: string;
  fallback: boolean;
  reason?: string;
};

type ClientOptions = {
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
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
      "한국어 마크다운으로 핵심 판단, 리스크, 다음 행동을 간결하게 정리하세요.",
    ].join("\n");
  }
  const notebookUrl = await readNotebookUrl(task.target);
  return [
    "NotebookLM 웹사이트(notebooklm.google.com)를 열어 다음 작업을 수행하세요.",
    notebookUrl ? `딜 노트북 URL: ${notebookUrl}` : "딜 노트북 URL: _deal.json에서 찾지 못함",
    `질문: ${task.inputs?.question ?? task.target}`,
    "질문 입력란에 질문을 입력하고 응답을 기다린 뒤 텍스트를 추출하세요.",
    "결과는 한국어 마크다운으로 반환하세요.",
  ].join("\n");
}

export class OpenClawClient {
  private status: OpenClawStatus = {
    available: false,
    simulationMode: true,
    url: null,
    authType: "none",
    healthEndpoint: null,
    taskEndpoint: null,
    lastProbeAt: null,
  };
  private discovery: OpenClawDiscoveryResult | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.requestTimeoutMs ?? requestTimeoutMs();
  }

  getStatus(): OpenClawStatus {
    return { ...this.status };
  }

  async probe(): Promise<OpenClawStatus> {
    const cached = await loadDiscovery();
    const envUrl = process.env.OPENCLAW_API_URL?.trim();
    this.discovery = envUrl
      ? { found: true, url: envUrl, healthEndpoint: null, taskEndpoint: null, authType: "unknown", detectedAt: new Date().toISOString(), source: "env" }
      : cached?.found
        ? cached
        : await discoverOpenClaw({ fetchImpl: this.fetchImpl });
    if (!this.discovery.found || !this.discovery.url) {
      await saveDiscovery(this.discovery);
      this.status = { available: false, simulationMode: true, url: null, authType: "none", healthEndpoint: null, taskEndpoint: null, lastProbeAt: new Date().toISOString(), reason: this.discovery.reason };
      return this.getStatus();
    }
    const authType = await this.detectAuth(this.discovery.url, this.discovery.healthEndpoint);
    if (authType === "unknown") {
      this.status = { available: false, simulationMode: true, url: this.discovery.url, authType, healthEndpoint: this.discovery.healthEndpoint, taskEndpoint: null, lastProbeAt: new Date().toISOString(), reason: "OpenClaw health 인증 확인 실패" };
      await saveDiscovery({ ...this.discovery, authType });
      return this.getStatus();
    }
    this.status = {
      available: true,
      simulationMode: false,
      url: this.discovery.url,
      authType,
      healthEndpoint: this.discovery.healthEndpoint,
      taskEndpoint: this.discovery.taskEndpoint,
      lastProbeAt: new Date().toISOString(),
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

  async runTask(task: AgentTask): Promise<OpenClawRunResult> {
    if (!this.status.available) await this.probe();
    if (!this.status.available || !this.status.url) {
      return { ok: false, markdown: "", fallback: true, reason: this.status.reason ?? "OpenClaw 미탐지" };
    }
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
            this.status = { ...this.status, taskEndpoint: endpoint };
            return { ok: true, markdown: result, fallback: false };
          }
        } catch (err) {
          console.error("[openclawClient] runTask:", err instanceof Error ? err.message : err);
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
