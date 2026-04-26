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
import { executeIntent, parseIntent } from "../_core/intentRouter.ts";

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

      try {
        const parsedIntent = await parseIntent(input.message);
        if (parsedIntent.intent !== "general.chat" || parsedIntent.clarification) {
          const intentResponse = await executeIntent(parsedIntent, ctx);
          await sessionManager.addMessage(userId, "assistant", intentResponse);

          return {
            response: intentResponse,
            model: "intent-router",
            engine: "gemini",
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const shouldReturnIntentError =
          message.includes("로그인") ||
          message.includes("API_KEY") ||
          message.includes("SPREADSHEET_ID") ||
          message.includes("거래소") ||
          message.includes("Redis") ||
          message.includes("Google");

        if (shouldReturnIntentError) {
          const intentErrorResponse = `요청한 기능을 실행하지 못했습니다.\n\n${message}`;
          await sessionManager.addMessage(userId, "assistant", intentErrorResponse);
          return {
            response: intentErrorResponse,
            model: "intent-router",
            engine: "gemini",
          };
        }

        console.warn("[IntentRouter] Falling back to general chat:", message);
      }

      // Get conversation history
      const history = await sessionManager.getHistory(userId, 10);

      // Prefer user's DB-stored keys; fall back to env vars for anonymous users
      const { getDecryptedApiSettings } = await import("../db.ts"); // MODIFIED: include the ESM extension so dev runtime can resolve the module.
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
      const systemPrompt = `당신은 에스턴 워크스테이션의 업무형 AI 비서입니다. 한국어로 간결하고 실무적으로 답변하세요.

현재 날짜와 시간: ${currentDate}
현재 사용 중인 엔진: ${session.engine}, 모델: ${currentModel?.name || session.modelKey}

규칙:
- 사용자가 묻지 않으면 네 역할, 내부 모델명, 연결 상태를 설명하지 마세요.
- 답변은 먼저 결론을 말하고, 필요한 경우에만 짧은 근거를 붙이세요.
- 웹 검색, Google 검색, 실시간 날씨, 실시간 시세처럼 현재 외부 조회가 필요한 정보는 Google Search grounding 도구 결과를 기준으로 답하세요.
- 프로젝트 구조, 기술 스택, 사용자가 제공한 문맥처럼 내부/제공 정보로 충분한 질문은 외부 검색 없이 답하세요.
- 확인하지 못한 값은 예시나 자리표시자로 꾸미지 말고, 연결된 데이터 소스가 없다고 한 문장으로 말하세요.
- 사용자가 이전 대화를 요약해 달라고 하면 실제 대화 내용만 요약하고, 시스템 설명이나 모델 설명을 넣지 마세요.
- 실행/변경 작업은 사용자의 명시적인 승인 없이는 완료했다고 말하지 마세요.`;
      
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
