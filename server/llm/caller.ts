/**
 * Multi-Model LLM Caller
 * Unified interface for calling different LLM engines
 */

import { Anthropic } from "@anthropic-ai/sdk";
import OpenAI from "openai";
import axios from "axios";
import type { LLMEngine } from "./models.ts";
import { getModel } from "./models.ts";
import { recordApiUsage } from "../_core/apiUsage.ts"; // MODIFIED: capture lightweight API telemetry for the monitoring dashboard.

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  engine: LLMEngine;
  tokensUsed?: number;
}

type GeminiGroundingChunk = {
  web?: {
    uri?: string;
    title?: string;
  };
};

type GeminiGroundingMetadata = {
  groundingChunks?: GeminiGroundingChunk[];
  webSearchQueries?: string[];
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    groundingMetadata?: GeminiGroundingMetadata;
  }>;
  usageMetadata?: {
    totalTokenCount?: number;
  };
};

function shouldEnableGeminiGrounding(modelId: string): boolean {
  if (process.env.GEMINI_GROUNDING_ENABLED === "false") return false; // MODIFIED: allow disabling search grounding without code changes.
  return modelId.startsWith("gemini-2.") || modelId.startsWith("gemini-3."); // MODIFIED: current Gemini models support google_search grounding.
}

function appendGroundingSources(content: string, chunks: GeminiGroundingChunk[] | undefined): string {
  const sources = (chunks ?? [])
    .map((chunk) => chunk.web)
    .filter((web): web is { uri: string; title?: string } => !!web?.uri)
    .filter((web, index, array) => array.findIndex((item) => item.uri === web.uri) === index)
    .slice(0, 5);

  if (sources.length === 0) return content;

  // TODO: 검색 출처 UI 표시 - 현재는 응답 텍스트 하단에 임시로 출처를 붙이고, 이후 전용 citation UI로 분리한다.
  const sourceLines = sources.map((source, index) => {
    const title = source.title?.trim() || `출처 ${index + 1}`;
    return `- [${title}](${source.uri})`;
  });

  return `${content}\n\n출처:\n${sourceLines.join("\n")}`; // MODIFIED: surface Google Search grounding citations in chat responses.
}

function logGeminiGroundingMetadata(modelId: string, metadata?: GeminiGroundingMetadata): void {
  const queries = metadata?.webSearchQueries ?? [];
  const sources = (metadata?.groundingChunks ?? [])
    .map((chunk) => chunk.web)
    .filter((web): web is { uri: string; title?: string } => !!web?.uri)
    .filter((web, index, array) => array.findIndex((item) => item.uri === web.uri) === index);

  if (queries.length === 0 && sources.length === 0) return;

  console.info("[Gemini Grounding]", {
    model: modelId,
    queries,
    sources: sources.map((source) => ({
      title: source.title ?? "",
      uri: source.uri,
    })),
  }); // MODIFIED: log grounding queries and source URLs for server-side verification.
}

export class LLMCaller {
  private ollamaHost: string;
  private geminiApiKey: string;
  private openaiApiKey: string;
  private openaiBaseUrl?: string;
  private anthropicApiKey: string;
  private axiosInstance = axios.create({
    timeout: 30000, // 30 second timeout
  });

  constructor(
    ollamaHost: string = process.env.OLLAMA_HOST || "http://localhost:11434",
    geminiApiKey: string = process.env.GEMINI_API_KEY || "",
    openaiApiKey: string = process.env.OPENAI_API_KEY || "",
    openaiBaseUrl: string = process.env.OPENAI_BASE_URL || "",
    anthropicApiKey: string = process.env.ANTHROPIC_API_KEY || ""
  ) {
    this.ollamaHost = ollamaHost;
    this.geminiApiKey = geminiApiKey;
    this.openaiApiKey = openaiApiKey;
    this.openaiBaseUrl = openaiBaseUrl || undefined;
    this.anthropicApiKey = anthropicApiKey;
  }

  /**
   * Set API keys dynamically (for user-provided keys)
   */
  setApiKeys(keys: {
    gemini?: string;
    openai?: string;
    anthropic?: string;
    ollama?: string;
    openaiBaseUrl?: string;
  }): void {
    if (keys.gemini) this.geminiApiKey = keys.gemini;
    if (keys.openai) this.openaiApiKey = keys.openai;
    if (keys.anthropic) this.anthropicApiKey = keys.anthropic;
    if (keys.ollama) this.ollamaHost = keys.ollama;
    if (keys.openaiBaseUrl) this.openaiBaseUrl = keys.openaiBaseUrl;
  }

  /**
   * Call LLM with specified engine and model
   */
  async call(
    engine: LLMEngine,
    modelKey: string,
    messages: LLMMessage[],
    systemPrompt?: string
  ): Promise<LLMResponse> {
    const model = getModel(engine, modelKey);
    if (!model) {
      throw new Error(`Model not found: ${engine}:${modelKey}`);
    }

    const startedAt = Date.now(); // MODIFIED: measure end-to-end provider latency for monitoring.

    try {
      const response = await (async () => {
        switch (engine) {
          case "gemma4":
            return this.callGemma4(model.modelId, messages, systemPrompt);
          case "gemini":
            return this.callGemini(model.modelId, messages, systemPrompt);
          case "codex":
            return this.callCodex(model.modelId, messages, systemPrompt);
          case "claude":
            return this.callClaude(model.modelId, messages, systemPrompt);
          default:
            throw new Error(`Unknown engine: ${engine}`);
        }
      })();

      await recordApiUsage({
        engine: response.engine,
        model: response.model,
        success: true,
        latencyMs: Date.now() - startedAt,
        tokensUsed: response.tokensUsed,
      });

      return response;
    } catch (error) {
      await recordApiUsage({
        engine,
        model: model.modelId,
        success: false,
        latencyMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  /**
   * Call Gemma4 via Ollama (Local)
   */
  private async callGemma4(
    modelId: string,
    messages: LLMMessage[],
    systemPrompt?: string
  ): Promise<LLMResponse> {
    try {
      const ollamaMessages = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      if (systemPrompt) {
        ollamaMessages.unshift({
          role: "system",
          content: systemPrompt,
        });
      }

      const response = await this.axiosInstance.post(`${this.ollamaHost}/api/chat`, {
        model: modelId,
        messages: ollamaMessages,
        stream: false,
      });

      return {
        content: response.data.message.content,
        model: modelId,
        engine: "gemma4",
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️ Gemma4 failed (${errorMsg}), falling back to Gemini...`);
      // Fallback to Gemini if Gemma4 fails
      if (this.geminiApiKey) {
        return this.callGemini("gemini-2.5-flash", messages, systemPrompt);
      }
      throw new Error(`Gemma4 API error: ${errorMsg}`);
    }
  }

  /**
   * Call Gemini via Google Generative AI
   */
  private async callGemini(
    modelId: string,
    messages: LLMMessage[],
    systemPrompt?: string
  ): Promise<LLMResponse> {
    try {
      const apiKey = this.geminiApiKey;
      if (!apiKey) {
        throw new Error("Gemini API key not configured");
      }

      const history = messages.slice(0, -1).map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      }));

      const lastMessage = messages[messages.length - 1];
      if (!lastMessage) {
        throw new Error("No messages provided");
      }

      const response = await this.axiosInstance.post<GeminiGenerateContentResponse>( // MODIFIED: use REST so current google_search grounding is supported by this older SDK project.
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
        {
          ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
          contents: [
            ...history,
            {
              role: lastMessage.role === "user" ? "user" : "model",
              parts: [{ text: lastMessage.content }],
            },
          ],
          ...(shouldEnableGeminiGrounding(modelId) ? { tools: [{ google_search: {} }] } : {}),
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
        }
      );

      const candidate = response.data.candidates?.[0];
      const textContent = candidate?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim();

      if (!textContent) {
        throw new Error("Gemini returned an empty response");
      }

      const groundedContent = appendGroundingSources(
        textContent,
        candidate?.groundingMetadata?.groundingChunks
      );
      logGeminiGroundingMetadata(modelId, candidate?.groundingMetadata);

      return {
        content: groundedContent,
        model: modelId,
        engine: "gemini",
        tokensUsed: response.data.usageMetadata?.totalTokenCount,
      };
    } catch (error) {
      throw new Error(`Gemini API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Call Codex (GPT) via OpenAI
   */
  private async callCodex(
    modelId: string,
    messages: LLMMessage[],
    systemPrompt?: string
  ): Promise<LLMResponse> {
    try {
      const client = new OpenAI({
        apiKey: this.openaiApiKey,
        baseURL: this.openaiBaseUrl,
      });

      const apiMessages = messages.map((msg) => ({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      }));

      if (systemPrompt) {
        apiMessages.unshift({
          role: "system" as const,
          content: systemPrompt,
        });
      }

      const response = await client.chat.completions.create({
        model: modelId,
        messages: apiMessages,
      });

      const content = response.choices[0]?.message.content || "";

      return {
        content,
        model: modelId,
        engine: "codex",
        tokensUsed: response.usage?.total_tokens,
      };
    } catch (error) {
      throw new Error(`Codex API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Call Claude via Anthropic
   */
  private async callClaude(
    modelId: string,
    messages: LLMMessage[],
    systemPrompt?: string
  ): Promise<LLMResponse> {
    try {
      const client = new Anthropic({ apiKey: this.anthropicApiKey });

      const apiMessages = messages.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

      const response = await client.messages.create({
        model: modelId,
        max_tokens: 1024,
        system: systemPrompt,
        messages: apiMessages,
      });

      const content = response.content[0]?.type === "text" ? response.content[0].text : "";

      return {
        content,
        model: modelId,
        engine: "claude",
        tokensUsed: response.usage?.input_tokens,
      };
    } catch (error) {
      throw new Error(`Claude API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export default LLMCaller;
