/**
 * Multi-Model LLM Registry
 * Supports: Gemma4 (Local), Gemini, Codex, Claude
 */

export type LLMEngine = "gemma4" | "gemini" | "codex" | "claude";

export interface ModelConfig {
  engine: LLMEngine;
  key: string;
  name: string;
  modelId: string;
  description: string;
}

export const LLM_MODELS: Record<LLMEngine, Record<string, ModelConfig>> = {
  gemma4: {
    e2b: {
      engine: "gemma4",
      key: "e2b",
      name: "Gemma 4 (2B)",
      modelId: "gemma4:e2b",
      description: "경량 로컬 모델 (2B 파라미터)",
    },
    e4b: {
      engine: "gemma4",
      key: "e4b",
      name: "Gemma 4 (4B) - 기본값",
      modelId: "gemma4:e4b",
      description: "균형잡힌 로컬 모델 (4B 파라미터)",
    },
    "26b": {
      engine: "gemma4",
      key: "26b",
      name: "Gemma 4 (26B)",
      modelId: "gemma4:26b-a4b",
      description: "고성능 로컬 모델 (26B 파라미터)",
    },
    "31b": {
      engine: "gemma4",
      key: "31b",
      name: "Gemma 4 (31B)",
      modelId: "gemma4:31b",
      description: "최고 성능 로컬 모델 (31B 파라미터)",
    },
  },
  gemini: {
    flash: {
      engine: "gemini",
      key: "flash",
      name: "Gemini 2.5 Flash",
      modelId: "gemini-2.5-flash",
      description: "빠르고 효율적인 Google 모델",
    },
    pro: {
      engine: "gemini",
      key: "pro",
      name: "Gemini 2.5 Pro",
      modelId: "gemini-2.5-pro",
      description: "고성능 Google 모델",
    },
    "3.1pro": {
      engine: "gemini",
      key: "3.1pro",
      name: "Gemini 3.1 Pro Preview",
      modelId: "gemini-3.1-pro-preview",
      description: "최신 Google 모델 (프리뷰)",
    },
    "3.1live": {
      engine: "gemini",
      key: "3.1live",
      name: "Gemini 3.1 Flash Live Preview",
      modelId: "gemini-3.1-flash-live-preview",
      description: "실시간 처리 Google 모델",
    },
  },
  codex: {
    "5.4": {
      engine: "codex",
      key: "5.4",
      name: "GPT-5.4",
      modelId: "gpt-5.4",
      description: "최신 OpenAI 모델",
    },
    mini: {
      engine: "codex",
      key: "mini",
      name: "GPT-5.4 Mini",
      modelId: "gpt-5.4-mini",
      description: "경량 OpenAI 모델",
    },
    codex: {
      engine: "codex",
      key: "codex",
      name: "GPT-5.3 Codex",
      modelId: "gpt-5.3-codex",
      description: "코드 생성 특화 OpenAI 모델",
    },
    spark: {
      engine: "codex",
      key: "spark",
      name: "GPT-5.3 Codex Spark",
      modelId: "gpt-5.3-codex-spark",
      description: "고속 코드 생성 OpenAI 모델",
    },
  },
  claude: {
    sonnet: {
      engine: "claude",
      key: "sonnet",
      name: "Claude Sonnet 4",
      modelId: "claude-sonnet-4",
      description: "균형잡힌 Anthropic 모델",
    },
    opus45: {
      engine: "claude",
      key: "opus45",
      name: "Claude Opus 4.5",
      modelId: "claude-opus-4-5",
      description: "고성능 Anthropic 모델",
    },
    opus: {
      engine: "claude",
      key: "opus",
      name: "Claude Opus 4.6",
      modelId: "claude-opus-4-6",
      description: "최신 Anthropic 모델",
    },
  },
};

export const DEFAULT_ENGINE: LLMEngine = "gemini";
export const DEFAULT_MODEL_KEY = "flash";

export function getModel(engine: LLMEngine, modelKey: string): ModelConfig | null {
  return LLM_MODELS[engine]?.[modelKey] || null;
}

export function getModelsByEngine(engine: LLMEngine): ModelConfig[] {
  return Object.values(LLM_MODELS[engine] || {});
}

export function getAllEngines(): LLMEngine[] {
  return Object.keys(LLM_MODELS) as LLMEngine[];
}

export function getDefaultModel(): ModelConfig {
  const model = getModel(DEFAULT_ENGINE, DEFAULT_MODEL_KEY);
  if (!model) {
    throw new Error(`Default model not found: ${DEFAULT_ENGINE}:${DEFAULT_MODEL_KEY}`);
  }
  return model;
}
