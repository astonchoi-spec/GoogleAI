import { handlerRegistry } from "../registry.ts";
import type { DispatchResult, ParsedIntent } from "../intentSchemas.ts";
import type { IntentRouteResponse, RouteIntentOptions } from "../types.ts";

/**
 * Convert a handler's `IntentRouteResponse` into the new `DispatchResult`
 * schema. The two shapes are intentionally type-identical at the time of
 * Phase 4 (Phase 5 may diverge), so this is a structural identity copy
 * rather than a runtime transformation.
 */
function fromHandlerResponse(response: IntentRouteResponse): DispatchResult {
  return {
    intent: response.intent,
    handled: response.handled,
    requiresConfirmation: response.requiresConfirmation,
    response: response.response,
    ...(response.data !== undefined ? { data: response.data } : {}),
    ...(response.confirmation ? { confirmation: response.confirmation } : {}),
    ...(response.handlerResponse ? { handlerResponse: response.handlerResponse } : {}),
  };
}

/**
 * Phase 4: dispatch stage of the intent pipeline.
 *
 * Responsibilities (extracted verbatim from the previous
 * `routeIntentMessage` body — behaviour MUST remain identical):
 *   1. Approval gate — `execute` intents are blocked until the caller sets
 *      `options.allowExecute = true`.
 *   2. Handler lookup via `handlerRegistry[intent.action]`.
 *   3. Built-in `execute_placeholder` short-circuit message.
 *   4. Gemini fallback message when no handler is registered.
 *   5. try/catch around handler execution to surface errors as Korean text.
 *
 * Returns a `DispatchResult`. The caller (`intentService.routeIntentMessage`)
 * is responsible for converting it back to `IntentRouteResponse` so the
 * public API stays frozen across phases.
 */
export async function dispatchIntent(
  intent: ParsedIntent,
  options: RouteIntentOptions,
): Promise<DispatchResult> {
  const allowExecute = options.allowExecute ?? false;

  // 1. Approval gate — execute intents need explicit confirmation.
  if (intent.type === "execute" && !allowExecute) {
    return {
      intent,
      handled: false,
      requiresConfirmation: true,
      response: "실행 요청으로 분류되었습니다. 안전을 위해 확인 단계가 필요합니다.",
      confirmation: {
        action: intent.action,
        domain: intent.domain,
        params: intent.params,
      },
    };
  }

  try {
    // 2. Registered handler path.
    const handler = handlerRegistry[intent.action];
    if (handler) {
      const handlerResult = await handler(intent, options);
      return fromHandlerResponse(handlerResult);
    }

    // 3. Placeholder action — known but intentionally unrouted.
    if (intent.action === "execute_placeholder") {
      return {
        intent,
        handled: false,
        requiresConfirmation: false,
        response: "실행 액션 라우팅은 현재 단계적으로 연결 중입니다. 다음 배치에서 실제 실행 경로를 연결합니다.",
      };
    }

    // 4. Unknown action — let the caller fall back to Gemini chat.
    console.log(
      "[INTENT] no handler for action:",
      intent.action,
      "→ falling back to Gemini",
    );
    return {
      intent,
      handled: false,
      requiresConfirmation: false,
      response: "Gemini 일반 대화로 처리합니다.",
    };
  } catch (error) {
    return {
      intent,
      handled: false,
      requiresConfirmation: false,
      response: `데이터 케이스 실행 중 오류가 발생했습니다: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
