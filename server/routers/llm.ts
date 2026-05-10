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
import { routeIntentMessage, formatIntentRouteMessage } from "../intent/intentService.ts";
import { searchLocalNotes, formatCitationFooter } from "../rag/localMdSearch.ts";

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

      // ── Step 1: Intent routing (Google Drive / Gmail / Calendar / 잔고 / 기술분석 등)
      console.log("[INTENT] llm.chat routing:", input.message.slice(0, 80));
      try {
        const routed = await routeIntentMessage({
          userId,
          message: input.message,
          allowExecute: true, // execute 타입은 확인 단계 요구
        });

        console.log(
          "[INTENT] result → domain:", routed.intent.domain,
          "/ action:", routed.intent.action,
          "/ confidence:", routed.intent.confidence.toFixed(2),
          "/ handled:", routed.handled,
          "/ requiresConfirmation:", routed.requiresConfirmation
        );

        if (routed.handled) {
          // 실제 API 호출 성공 — 결과를 사용자에게 반환
          const responseText = routed.response || formatIntentRouteMessage(routed) || "처리 완료";
          console.log("[INTENT] handled — returning result, length:", responseText.length);
          await sessionManager.addMessage(userId, "assistant", responseText);
          return { response: responseText, model: "intent-router", engine: "intent-service", data: routed.data, sources: undefined };
        }

        if (routed.requiresConfirmation) {
          // execute 타입 인텐트: 확인 메시지 반환
          const responseText = formatIntentRouteMessage(routed) || routed.response;
          console.log("[INTENT] requiresConfirmation — returning confirmation");
          await sessionManager.addMessage(userId, "assistant", responseText);
          return { response: responseText, model: "intent-router", engine: "intent-service", data: routed.data, sources: undefined };
        }

        // chat 도메인이면 Gemini 일반 대화로 fall-through
        console.log("[INTENT] no match (chat domain) — falling through to Gemini LLM");
      } catch (intentErr) {
        const errMsg = intentErr instanceof Error ? intentErr.message : String(intentErr);
        console.warn("[INTENT] routing error:", errMsg);

        // 인증 오류는 사용자에게 직접 반환
        const isAuthError =
          errMsg.includes("인증") ||
          errMsg.includes("Google") ||
          errMsg.includes("authenticate") ||
          errMsg.includes("token") ||
          errMsg.includes("OAuth");

        if (isAuthError) {
          const errorResponse = `요청한 기능을 실행하지 못했습니다.\n\n${errMsg}`;
          await sessionManager.addMessage(userId, "assistant", errorResponse);
          return { response: errorResponse, model: "intent-error", engine: "intent-service", data: undefined, sources: undefined };
        }
        // 그 외 오류는 Gemini 일반 대화로 fall-through
      }

      // ── Step 2: Gemini 일반 대화 (인텐트 매칭 실패 시 fallback)

      // ── Step 2-pre: 로컬 NotebookLM 회수 자료 RAG 검색 (실패해도 일반 대화 진행)
      const ragHits = await searchLocalNotes(input.message, { k: 3 }).catch((err) => {
        console.warn("[RAG] local search failed:", err);
        return [];
      });
      console.log("[RAG] hits:", ragHits.length);

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
      const baseSystemPrompt = `당신은 에스턴 워크스테이션의 업무형 AI 비서입니다. 한국어로 간결하고 실무적으로 답변하세요.

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

      const ragContextBlock = ragHits.length
        ? `\n\n참고할 회수 자료(${ragHits.length}건):\n${ragHits
            .map((h, i) => `[${i + 1}] ${h.project}/${h.fileName}\n${h.snippet}`)
            .join("\n\n")}\n\n위 자료를 우선 참고하되, 자료에 없는 사실을 만들어내지 마세요.`
        : "";

      const systemPrompt = `${baseSystemPrompt}${ragContextBlock}`;
      
      const response = await userLlmCaller.call(
        session.engine,
        session.modelKey,
        history.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
        })),
        systemPrompt
      );

      // Append RAG citation footer + sources
      const finalResponse = response.content + formatCitationFooter(ragHits);
      const ragSources = ragHits.map((h) => ({
        title: `${h.project}/${h.fileName}`,
        uri: `file://${h.filePath.replace(/\\/g, "/")}`,
      }));

      // Add assistant response to history (인용 절 포함)
      await sessionManager.addMessage(userId, "assistant", finalResponse);

      return {
        response: finalResponse,
        model: response.model,
        engine: response.engine,
        sources: ragSources.length > 0 ? ragSources : response.sources,
        data: undefined,
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
