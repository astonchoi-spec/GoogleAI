/**
 * Multi-Model LLM Caller
 * Unified interface for calling different LLM engines
 */

import { Anthropic } from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import axios from "axios";
import type { LLMEngine } from "./models";
import { getModel } from "./models";

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

export interface LLMCallOptions {
  responseMimeType?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export class LLMCaller {
  private ollamaHost: string;
  private geminiApiKey: string;
  private openaiApiKey: string;
  private anthropicApiKey: string;
  private axiosInstance = axios.create({
    timeout: 30000, // 30 second timeout
  });

  constructor(
    ollamaHost: string = process.env.OLLAMA_HOST || "http://localhost:11434",
    geminiApiKey: string = process.env.GEMINI_API_KEY || "",
    openaiApiKey: string = process.env.OPENAI_API_KEY || "",
    anthropicApiKey: string = process.env.ANTHROPIC_API_KEY || ""
  ) {
    this.ollamaHost = ollamaHost;
    this.geminiApiKey = geminiApiKey;
    this.openaiApiKey = openaiApiKey;
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
  }): void {
    if (keys.gemini) this.geminiApiKey = keys.gemini;
    if (keys.openai) this.openaiApiKey = keys.openai;
    if (keys.anthropic) this.anthropicApiKey = keys.anthropic;
    if (keys.ollama) this.ollamaHost = keys.ollama;
  }

  /**
   * Call LLM with specified engine and model
   */
  async call(
    engine: LLMEngine,
    modelKey: string,
    messages: LLMMessage[],
    systemPrompt?: string,
    options?: LLMCallOptions
  ): Promise<LLMResponse> {
    const model = getModel(engine, modelKey);
    if (!model) {
      throw new Error(`Model not found: ${engine}:${modelKey}`);
    }

    switch (engine) {
      case "gemma4":
        return this.callGemma4(model.modelId, messages, systemPrompt);
      case "gemini":
        return this.callGemini(model.modelId, messages, systemPrompt, options);
      case "codex":
        return this.callCodex(model.modelId, messages, systemPrompt);
      case "claude":
        return this.callClaude(model.modelId, messages, systemPrompt);
      default:
        throw new Error(`Unknown engine: ${engine}`);
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
    systemPrompt?: string,
    options?: LLMCallOptions
  ): Promise<LLMResponse> {
    try {
      const apiKey = this.geminiApiKey;
      if (!apiKey) {
        throw new Error("Gemini API key not configured");
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelId,
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: options?.temperature,
          maxOutputTokens: options?.maxOutputTokens,
          responseMimeType: options?.responseMimeType,
        },
      });

      const history = messages.slice(0, -1).map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      }));

      const lastMessage = messages[messages.length - 1];
      if (!lastMessage) {
        throw new Error("No messages provided");
      }

      const result = await model.generateContent({
        contents: [
          ...history,
          {
            role: lastMessage.role === "user" ? "user" : "model",
            parts: [{ text: lastMessage.content }],
          },
        ],
      });

      const textContent = result.response.text();

      return {
        content: textContent,
        model: modelId,
        engine: "gemini",
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
      const client = new OpenAI({ apiKey: this.openaiApiKey });

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
