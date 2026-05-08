import { normalizeIntent, parseIntent } from "./parseIntent.ts";
import { planIntent } from "./pipeline/planIntent.ts";
import { dispatchIntent } from "./pipeline/dispatchIntent.ts";
import { formatRouteResponse, formatReply } from "./pipeline/formatReply.ts";
import type { DispatchResult } from "./intentSchemas.ts";
import type {
  IntentResult,
  IntentRouteResponse,
  RouteIntentOptions,
} from "./types.ts";

// 외부 모듈에서 사용 중인 타입을 동일 경로로 노출 — 기존 import 경로 보존
export type {
  IntentDomain,
  IntentType,
  IntentAction,
  IntentResult,
  IntentRouteResponse,
  RouteIntentOptions,
} from "./types.ts";

// Re-export normalizeIntent so existing callers (`import { normalizeIntent }
// from "./intentService.ts"`) keep working after the Phase 2 split.
export { normalizeIntent };

// Phase 5 — formatReply lives in pipeline/formatReply.ts. Both new and
// legacy names are re-exported here so external callers (telegram bot,
// tRPC routers, dealRouting.test.ts) continue to work without edits.
export { formatReply };

/**
 * Backward-compatible alias for the new `parseIntent()` function.
 * Classification logic moved to `server/intent/pipeline/parseIntent.ts` in
 * Phase 2 (Connect AI benchmarking — CEO Classifier pattern).
 */
export async function classifyIntent(message: string): Promise<IntentResult> {
  return parseIntent(message);
}

/**
 * Phase 4 adapter — convert the new `DispatchResult` shape back to the
 * legacy `IntentRouteResponse` so the public API of `routeIntentMessage`
 * stays frozen. The two interfaces are structurally identical at the time
 * of Phase 4; this helper is kept as a function (rather than an `as` cast)
 * so future divergence can be handled here in one place.
 */
function dispatchToRouteResponse(d: DispatchResult): IntentRouteResponse {
  return {
    intent: d.intent,
    handled: d.handled,
    requiresConfirmation: d.requiresConfirmation,
    response: d.response,
    ...(d.data !== undefined ? { data: d.data } : {}),
    ...(d.confirmation ? { confirmation: d.confirmation } : {}),
    ...(d.handlerResponse ? { handlerResponse: d.handlerResponse } : {}),
  };
}

/**
 * Public API — frozen across all phases.
 *
 * Phase 5 final pipeline:
 *   message
 *     → parseIntent()        // Phase 2 — classify
 *     → planIntent()         // Phase 3 — pass-through stub
 *     → dispatchIntent()     // Phase 4 — execute via handlerRegistry
 *     → dispatchToRouteResponse()  // legacy IntentRouteResponse adapter
 *
 * `formatReply` / `formatIntentRouteMessage` are intentionally NOT called
 * here — `routeIntentMessage` only returns the routing payload. The
 * telegram bot and tRPC routers call the formatter on the returned
 * payload themselves (see server/llm/telegramBot/messageRouter.ts:62 and
 * server/routers/llm.ts:172). That contract was true before Phase 5 and
 * remains unchanged.
 */
export async function routeIntentMessage(options: RouteIntentOptions): Promise<IntentRouteResponse> {
  console.log("[INTENT] routeIntentMessage:", options.message.slice(0, 80));

  const parsed = await parseIntent(options.message);
  console.log("[INTENT] classified as:", parsed.domain, "/", parsed.action, "type:", parsed.type, "confidence:", parsed.confidence);

  const plan = await planIntent(parsed, {
    message: options.message,
    userId: options.userId,
  });
  console.log("[INTENT] planIntent pass-through, steps=", plan.steps.length, "source=", plan.source);

  const intent = plan.steps[0];
  const dispatched = await dispatchIntent(intent, options);
  return dispatchToRouteResponse(dispatched);
}

/**
 * Legacy formatter — kept as a thin alias over `formatRouteResponse`. The
 * actual logic now lives in `server/intent/pipeline/formatReply.ts`.
 *
 * Callers that still import this name:
 *   - server/llm/telegramBot/messageRouter.ts
 *   - server/routers/intent.ts
 *   - server/routers/llm.ts
 *   - server/__tests__/dealRouting.test.ts
 */
export function formatIntentRouteMessage(routed: IntentRouteResponse): string {
  return formatRouteResponse(routed);
}
