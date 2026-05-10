import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc.ts";
import { classifyIntent, formatIntentRouteMessage, routeIntentMessage } from "../intent/intentService.ts"; // MODIFIED: include shared formatter so web clients can render identical intent output.

// Phase 4-A 보강: 약하게 매칭된 인텐트는 handled=false 로 다운그레이드 → 클라이언트가 llm.chat (RAG) 으로 fallback.
// routers/llm.ts 의 INTENT_CONFIDENCE_THRESHOLD 와 동일 값을 유지.
// requiresConfirmation(execute 인텐트 확인 단계)는 임계치와 무관하게 항상 통과시킨다.
const INTENT_CONFIDENCE_THRESHOLD = 0.7;

export const intentRouter = router({
  classify: protectedProcedure
    .input(z.object({ message: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const intent = await classifyIntent(input.message);
      return { intent };
    }),

  route: protectedProcedure
    .input(z.object({
      message: z.string().min(1),
      allowExecute: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const routed = await routeIntentMessage({
        userId: String(ctx.user.id),
        message: input.message,
        allowExecute: input.allowExecute,
      });

      // 약한 매칭은 클라이언트가 llm.chat (RAG) 으로 떨어지도록 handled 을 다운그레이드
      if (
        routed.handled &&
        !routed.requiresConfirmation &&
        routed.intent.confidence < INTENT_CONFIDENCE_THRESHOLD
      ) {
        console.log(
          "[INTENT] route weak match (confidence",
          routed.intent.confidence.toFixed(2),
          "<",
          INTENT_CONFIDENCE_THRESHOLD,
          ") — handled=false 로 다운그레이드 → llm.chat fallback"
        );
        return {
          ...routed,
          handled: false,
          response: "",
          formattedMessage: "",
        };
      }

      return {
        ...routed,
        formattedMessage: routed.response || "",
      };
    }),
});
