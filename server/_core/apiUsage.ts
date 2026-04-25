import { redis } from "./redis.ts";
import type { LLMEngine } from "../llm/models.ts";

export type ApiUsageSnapshot = {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalTokens: number;
  totalLatencyMs: number;
  averageLatencyMs: number;
  lastLatencyMs: number;
  lastEngine: LLMEngine | null;
  lastModel: string | null;
  lastCallAt: string | null;
  activityLogs: Array<{
    at: string;
    engine: LLMEngine;
    model: string;
    success: boolean;
    latencyMs: number;
    tokensUsed: number | null;
  }>;
  byEngine: Record<
    LLMEngine,
    {
      calls: number;
      successfulCalls: number;
      failedCalls: number;
      totalTokens: number;
      totalLatencyMs: number;
    }
  >;
};

type UsageState = {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalTokens: number;
  totalLatencyMs: number;
  lastLatencyMs: number;
  lastEngine: LLMEngine | null;
  lastModel: string | null;
  lastCallAt: string | null;
  activityLogs: Array<{
    at: string;
    engine: LLMEngine;
    model: string;
    success: boolean;
    latencyMs: number;
    tokensUsed: number | null;
  }>;
  byEngine: Record<
    LLMEngine,
    {
      calls: number;
      successfulCalls: number;
      failedCalls: number;
      totalTokens: number;
      totalLatencyMs: number;
    }
  >;
};

const STORAGE_KEY = "metrics:api-usage"; // MODIFIED: persist lightweight API usage telemetry in the shared Redis instance.

function createEmptyState(): UsageState {
  return {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    totalTokens: 0,
    totalLatencyMs: 0,
    lastLatencyMs: 0,
    lastEngine: null,
    lastModel: null,
    lastCallAt: null,
    activityLogs: [],
    byEngine: {
      gemma4: { calls: 0, successfulCalls: 0, failedCalls: 0, totalTokens: 0, totalLatencyMs: 0 },
      gemini: { calls: 0, successfulCalls: 0, failedCalls: 0, totalTokens: 0, totalLatencyMs: 0 },
      codex: { calls: 0, successfulCalls: 0, failedCalls: 0, totalTokens: 0, totalLatencyMs: 0 },
      claude: { calls: 0, successfulCalls: 0, failedCalls: 0, totalTokens: 0, totalLatencyMs: 0 },
    },
  };
}

async function readState(): Promise<UsageState> {
  const raw = await redis.get(STORAGE_KEY);
  if (!raw) return createEmptyState();

  try {
    const parsed = JSON.parse(raw) as Partial<UsageState>;
    return {
      ...createEmptyState(),
      ...parsed,
      byEngine: {
        ...createEmptyState().byEngine,
        ...(parsed.byEngine ?? {}),
      },
    };
  } catch {
    return createEmptyState();
  }
}

async function writeState(state: UsageState): Promise<void> {
  await redis.set(STORAGE_KEY, JSON.stringify(state));
}

export async function recordApiUsage(input: {
  engine: LLMEngine;
  model: string;
  success: boolean;
  latencyMs: number;
  tokensUsed?: number;
}): Promise<void> {
  const state = await readState();
  const engineState = state.byEngine[input.engine] ?? {
    calls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    totalTokens: 0,
    totalLatencyMs: 0,
  };

  state.totalCalls += 1;
  state.totalLatencyMs += input.latencyMs;
  state.lastLatencyMs = input.latencyMs;
  state.lastEngine = input.engine;
  state.lastModel = input.model;
  state.lastCallAt = new Date().toISOString();
  state.activityLogs = [
    {
      at: state.lastCallAt,
      engine: input.engine,
      model: input.model,
      success: input.success,
      latencyMs: input.latencyMs,
      tokensUsed: typeof input.tokensUsed === "number" ? input.tokensUsed : null,
    },
    ...state.activityLogs,
  ].slice(0, 10);
  engineState.calls += 1;
  engineState.totalLatencyMs += input.latencyMs;

  if (input.success) {
    state.successfulCalls += 1;
    engineState.successfulCalls += 1;
    if (typeof input.tokensUsed === "number") {
      state.totalTokens += input.tokensUsed;
      engineState.totalTokens += input.tokensUsed;
    }
  } else {
    state.failedCalls += 1;
    engineState.failedCalls += 1;
  }

  state.byEngine[input.engine] = engineState;
  await writeState(state);
}

export async function getApiUsageSnapshot(): Promise<ApiUsageSnapshot> {
  const state = await readState();
  return {
    ...state,
    averageLatencyMs: state.totalCalls > 0 ? Math.round(state.totalLatencyMs / state.totalCalls) : 0,
  };
}
