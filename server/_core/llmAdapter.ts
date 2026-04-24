import LLMCaller, { type LLMMessage, type LLMResponse } from "../llm/caller.ts";
import type { LLMEngine } from "../llm/models.ts";
import { DEFAULT_ENGINE, DEFAULT_MODEL_KEY, getModel } from "../llm/models.ts";

export type LLMAdapterOptions = {
  engine?: LLMEngine;
  modelKey?: string;
  systemPrompt?: string;
};

export type ParsedIntent = Record<string, unknown>;

export interface LLMAdapter {
  chat(messages: LLMMessage[], options?: LLMAdapterOptions): Promise<LLMResponse>;
  parseJson<T extends ParsedIntent = ParsedIntent>(
    userMessage: string,
    systemPrompt: string,
    options?: LLMAdapterOptions
  ): Promise<T>;
  summarizeToolResult(input: {
    userMessage: string;
    toolName: string;
    result: unknown;
  }, options?: LLMAdapterOptions): Promise<string>;
}

class DirectLLMAdapter implements LLMAdapter {
  private readonly caller = new LLMCaller();

  async chat(messages: LLMMessage[], options: LLMAdapterOptions = {}): Promise<LLMResponse> {
    const { engine, modelKey } = resolveModel(options);
    return this.caller.call(engine, modelKey, messages, options.systemPrompt);
  }

  async parseJson<T extends ParsedIntent = ParsedIntent>(
    userMessage: string,
    systemPrompt: string,
    options: LLMAdapterOptions = {}
  ): Promise<T> {
    const response = await this.chat([{ role: "user", content: userMessage }], {
      ...options,
      systemPrompt,
    });
    const jsonText = extractJsonObject(response.content);
    if (!jsonText) {
      throw new Error("LLM response did not contain a JSON object");
    }
    return JSON.parse(jsonText) as T;
  }

  async summarizeToolResult(input: {
    userMessage: string;
    toolName: string;
    result: unknown;
  }, options: LLMAdapterOptions = {}): Promise<string> {
    const systemPrompt = [
      "You summarize tool results for a Korean business workstation.",
      "Return a concise Korean answer with key values, caveats, and next action if useful.",
      "Do not invent values not present in the tool result.",
    ].join("\n");

    const response = await this.chat(
      [{
        role: "user",
        content: JSON.stringify({
          userMessage: input.userMessage,
          toolName: input.toolName,
          result: input.result,
        }),
      }],
      { ...options, systemPrompt }
    );

    return response.content;
  }
}

function resolveModel(options: LLMAdapterOptions): { engine: LLMEngine; modelKey: string } {
  const envEngine = process.env.LLM_PROVIDER as LLMEngine | undefined;
  const envModelKey = process.env.LLM_MODEL_KEY;
  const engine = options.engine ?? envEngine ?? DEFAULT_ENGINE;
  const modelKey = options.modelKey ?? envModelKey ?? DEFAULT_MODEL_KEY;

  if (!getModel(engine, modelKey)) {
    throw new Error(`Configured LLM model not found: ${engine}:${modelKey}`);
  }

  return { engine, modelKey };
}

function extractJsonObject(raw: string): string | null {
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

export function createLLMAdapter(): LLMAdapter {
  const provider = process.env.LLM_ADAPTER || "direct";
  if (provider !== "direct") {
    throw new Error(`Unsupported LLM_ADAPTER "${provider}". Supported: direct`);
  }
  return new DirectLLMAdapter();
}

export const llmAdapter = createLLMAdapter();

