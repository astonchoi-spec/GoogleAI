import type { LLMEngine } from "./models.ts";
import { getAllEngines, getModelsByEngine } from "./models.ts";

export function getCommandArgs(messageText?: string): string[] {
  if (!messageText) return [];
  const tokens = messageText.trim().split(/\s+/);
  return tokens.slice(1);
}

export function normalizeEngineArg(engineArg?: string): LLMEngine | null {
  if (!engineArg) return null;
  const normalized = engineArg.trim().toLowerCase();
  const engines = getAllEngines();
  const match = engines.find((engine) => engine === normalized);
  return match ?? null;
}

export function normalizeModelArg(modelArg?: string): string | null {
  if (!modelArg) return null;
  const normalized = modelArg.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function formatEngineHelpText(): string {
  const engines = getAllEngines();
  return `사용 가능한 엔진:\n${engines.map((engine) => `- ${engine}`).join("\n")}\n\n사용법: /engine <엔진이름>`;
}

export function formatModelHelpText(engine: LLMEngine): string {
  const models = getModelsByEngine(engine);
  return `${engine} 엔진에서 사용 가능한 모델:\n${models.map((model) => `- ${model.key} (${model.name})`).join("\n")}\n\n사용법: /model <모델키>`;
}

