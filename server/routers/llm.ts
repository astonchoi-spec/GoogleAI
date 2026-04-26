/**
 * tRPC Router for LLM Engine Management
 * Handles model switching, chat, and status queries
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc.ts";
import { LLMCaller } from "../llm/caller.ts";
import { sessionManager } from "../llm/session.ts";
import { getModel, getModelsByEngine, getAllEngines, getDefaultModel } from "../llm/models.ts";
import type { LLMEngine } from "../llm/models.ts";

const llmCaller = new LLMCaller();

export const llmRouter = router({
  /**
   * Get current user session and settings
   */
  getStatus: publicProcedure.query(async ({ ctx }: any) => {
    const userId = ctx.user?.id.toString() || "anonymous";
    const session = await sessionManager.getSession(userId);
    const model = getModel(session.engine, session.modelKey);

    return {
      engine: session.engine,
      modelKey: session.modelKey,
      modelName: model?.name || "Unknown",
      modelDescription: model?.description || "",
      historyLength: session.conversationHistory.length,
      lastUpdated: new Date(session.lastUpdated),
    };
  }),

  /**
   * Get all available engines
   */
  getEngines: publicProcedure.query((): any => {
    return getAllEngines().map((engine) => ({
      name: engine,
      models: getModelsByEngine(engine).map((m) => ({
        key: m.key,
        name: m.name,
        description: m.description,
      })),
    }));
  }),

  /**
   * Get models for specific engine
   */
  getModels: publicProcedure
    .input(z.object({ engine: z.string() }))
    .query(({ input }: any) => {
      const engine = input.engine as LLMEngine;
      return getModelsByEngine(engine).map((m) => ({
        key: m.key,
        name: m.name,
        description: m.description,
      }));
    }),

  /**
   * Switch to different engine
   */
  switchEngine: publicProcedure
    .input(z.object({ engine: z.string() }))
    .mutation(async ({ ctx, input }: any) => {
      const userId = ctx.user?.id.toString() || "anonymous";
      const engine = input.engine as LLMEngine;

      if (!getAllEngines().includes(engine)) {
        throw new Error(`Unknown engine: ${engine}`);
      }

      const models = getModelsByEngine(engine);
      if (models.length === 0) {
        throw new Error(`No models available for engine: ${engine}`);
      }

      const firstModel = models[0];
      await sessionManager.switchEngine(userId, engine, firstModel.key);

      return {
        success: true,
        engine,
        modelKey: firstModel.key,
        modelName: firstModel.name,
      };
    }),

  /**
   * Switch to different model within current engine
   */
  switchModel: publicProcedure
    .input(z.object({ modelKey: z.string() }))
    .mutation(async ({ ctx, input }: any) => {
      const userId = ctx.user?.id.toString() || "anonymous";
      const session = await sessionManager.getSession(userId);
      const model = getModel(session.engine, input.modelKey);

      if (!model) {
        throw new Error(`Model not found: ${input.modelKey}`);
      }

      await sessionManager.switchEngine(userId, session.engine, input.modelKey);

      return {
        success: true,
        engine: session.engine,
        modelKey: input.modelKey,
        modelName: model.name,
      };
    }),

  /**
   * Switch engine and model at once
   */
  switchEngineAndModel: publicProcedure
    .input(z.object({ engine: z.string(), modelKey: z.string() }))
    .mutation(async ({ ctx, input }: any) => {
      const userId = ctx.user?.id.toString() || "anonymous";
      const engine = input.engine as LLMEngine;
      const model = getModel(engine, input.modelKey);

      if (!model) {
        throw new Error(`Model not found: ${engine}:${input.modelKey}`);
      }

      await sessionManager.switchEngine(userId, engine, input.modelKey);

      return {
        success: true,
        engine,
        modelKey: input.modelKey,
        modelName: model.name,
      };
    }),

  /**
   * Send message and get LLM response
   * Public: works for anonymous users using env API keys, or authenticated users using their own keys
   */
  chat: publicProcedure
    .input(z.object({ message: z.string() }))
    .mutation(async ({ ctx, input }: any) => {
      const userId = ctx.user?.id?.toString() ?? "anonymous";
      const session = await sessionManager.getSession(userId);

      // Add user message to history
      await sessionManager.addMessage(userId, "user", input.message);

      // Get conversation history
      const history = await sessionManager.getHistory(userId, 10);

      // Prefer user's DB-stored keys; fall back to env vars for anonymous users
      const { getDecryptedApiSettings } = await import("../db");
      const userApiKeys = ctx.user ? await getDecryptedApiSettings(ctx.user.id) : {};

      const userLlmCaller = new LLMCaller(
        userApiKeys.ollama || process.env.OLLAMA_HOST, // MODIFIED: preserve env Ollama host when no user override exists.
        userApiKeys.gemini || process.env.GEMINI_API_KEY,
        userApiKeys.openai || process.env.OPENAI_API_KEY,
        process.env.OPENAI_BASE_URL, // MODIFIED: keep constructor arguments aligned so Anthropic key is not treated as an OpenAI base URL.
        userApiKeys.anthropic || process.env.ANTHROPIC_API_KEY
      );

      // Call LLM with enhanced system prompt
      const currentDate = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      const currentModel = getModel(session.engine, session.modelKey);
      const systemPrompt = `당신은 구글 생태계와 텔레그램을 통합하는 AI 어시스턴트입니다. 사용자의 질문에 친절하고 정확하게 답변해주세요.

현재 날짜와 시간: ${currentDate}
현재 사용 중인 엔진: ${session.engine}, 모델: ${currentModel?.name || session.modelKey}`;
      
      const response = await userLlmCaller.call(
        session.engine,
        session.modelKey,
        history.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
        })),
        systemPrompt
      );

      // Add assistant response to history
      await sessionManager.addMessage(userId, "assistant", response.content);

      return {
        response: response.content,
        model: response.model,
        engine: response.engine,
      };
    }),

  /**
   * Get conversation history
   */
  getHistory: publicProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ ctx, input }: any) => {
      const userId = ctx.user?.id.toString() || "anonymous";
      const history = await sessionManager.getHistory(userId, input.limit);

      return history.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp),
      }));
    }),

  /**
   * Clear conversation history
   */
  clearHistory: publicProcedure.mutation(async ({ ctx }: any) => {
    const userId = ctx.user?.id.toString() || "anonymous";
    await sessionManager.clearHistory(userId);

    return { success: true };
  }),
});

export default llmRouter;
