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
  summarizeToolResult(
    input: {
      userMessage: string;
      toolName: string;
      result: unknown;
    },
    options?: LLMAdapterOptions
  ): Promise<string>;
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

abstract class BaseLLMAdapter implements LLMAdapter {
  protected abstract createCaller(): LLMCaller;

  async chat(messages: LLMMessage[], options: LLMAdapterOptions = {}): Promise<LLMResponse> {
    const { engine, modelKey } = resolveModel(options);
    return this.createCaller().call(engine, modelKey, messages, options.systemPrompt);
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

  async summarizeToolResult(
    input: {
      userMessage: string;
      toolName: string;
      result: unknown;
    },
    options: LLMAdapterOptions = {}
  ): Promise<string> {
    const systemPrompt = [
      "You summarize tool results for a Korean business workstation.",
      "Return a concise Korean answer with key values, caveats, and next action if useful.",
      "Do not invent values not present in the tool result.",
    ].join("\n");

    const response = await this.chat(
      [
        {
          role: "user",
          content: JSON.stringify({
            userMessage: input.userMessage,
            toolName: input.toolName,
            result: input.result,
          }),
        },
      ],
      { ...options, systemPrompt }
    );

    return response.content;
  }
}

class DirectLLMAdapter extends BaseLLMAdapter {
  protected createCaller(): LLMCaller {
    return new LLMCaller();
  }
}

class OpenRouterAdapter extends BaseLLMAdapter {
  protected createCaller(): LLMCaller {
    return new LLMCaller(
      process.env.OLLAMA_HOST || "http://localhost:11434",
      process.env.GEMINI_API_KEY || "",
      process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "",
      process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      process.env.ANTHROPIC_API_KEY || ""
    );
  }
}

class HermesAdapter extends BaseLLMAdapter {
  protected createCaller(): LLMCaller {
    return new LLMCaller(
      process.env.OLLAMA_HOST || "http://localhost:11434",
      process.env.GEMINI_API_KEY || "",
      process.env.HERMES_API_KEY || process.env.OPENAI_API_KEY || "",
      process.env.HERMES_BASE_URL || process.env.OPENAI_BASE_URL || "",
      process.env.ANTHROPIC_API_KEY || ""
    );
  }
}

class OpenClawAdapter implements LLMAdapter {
  async chat(messages: LLMMessage[], options: LLMAdapterOptions = {}): Promise<LLMResponse> {
    const endpoint = process.env.OPENCLAW_API_URL;
    if (!endpoint) {
      throw new Error("OPENCLAW_API_URL is not configured");
    }

    const { engine, modelKey } = resolveModel(options);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(process.env.OPENCLAW_API_KEY
          ? { authorization: `Bearer ${process.env.OPENCLAW_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        engine,
        modelKey,
        systemPrompt: options.systemPrompt ?? "",
        messages,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`OpenClaw bridge failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`);
    }

    const payload = (await response.json()) as Partial<LLMResponse> & { content?: string };
    const content = payload.content ?? "";
    if (!content) {
      throw new Error("OpenClaw bridge did not return content");
    }

    return {
      content,
      model: payload.model ?? `${engine}:${modelKey}`,
      engine: payload.engine ?? engine,
      tokensUsed: payload.tokensUsed,
    };
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
      throw new Error("OpenClaw response did not contain a JSON object");
    }
    return JSON.parse(jsonText) as T;
  }

  async summarizeToolResult(
    input: {
      userMessage: string;
      toolName: string;
      result: unknown;
    },
    options: LLMAdapterOptions = {}
  ): Promise<string> {
    const systemPrompt = [
      "You summarize tool results for a Korean business workstation.",
      "Return a concise Korean answer with key values, caveats, and next action if useful.",
      "Do not invent values not present in the tool result.",
    ].join("\n");

    const response = await this.chat(
      [
        {
          role: "user",
          content: JSON.stringify({
            userMessage: input.userMessage,
            toolName: input.toolName,
            result: input.result,
          }),
        },
      ],
      { ...options, systemPrompt }
    );

    return response.content;
  }
}

function normalizeAdapterName(value: string | undefined): string {
  return (value || "direct").trim().toLowerCase();
}

export function createLLMAdapter(): LLMAdapter {
  switch (normalizeAdapterName(process.env.LLM_ADAPTER)) {
    case "direct":
      return new DirectLLMAdapter();
    case "openrouter":
      return new OpenRouterAdapter();
    case "hermes":
      return new HermesAdapter();
    case "openclaw":
      return new OpenClawAdapter();
    default:
      throw new Error(
        `Unsupported LLM_ADAPTER "${process.env.LLM_ADAPTER}". Supported: direct, openrouter, hermes, openclaw`
      );
  }
}

export const llmAdapter = createLLMAdapter();

