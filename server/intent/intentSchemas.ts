import { z } from "zod";
import type {
  HandlerResponse,
  IntentAction,
  IntentDomain,
  IntentResult,
  IntentRouteResponse,
  IntentType,
} from "./types.ts";

// Re-export base enums so future callers can import from intentSchemas without
// reaching into types.ts directly.
export type { IntentAction, IntentDomain, IntentType };

/**
 * Phase 5/6-A — re-export the handler response standard schema.
 * Definitions live in `types.ts` (so `IntentRouteResponse` can reference
 * them without circular imports). This file keeps the names exported for
 * any caller that already imports `HandlerResponse` / `HandlerResponseKind`
 * from `intentSchemas`.
 */
export type { HandlerResponse, HandlerResponseKind } from "./types.ts";

/**
 * Phase 2 forward-looking type alias.
 *
 * `ParsedIntent` is the output of `parseIntent()`. It currently mirrors the
 * legacy `IntentResult` shape so the existing dispatcher in
 * `intentService.routeIntentMessage()` keeps working without translation.
 *
 * Future phases (Phase 3+) may extend this with optional fields (e.g.
 * `reply`, `sources`) but the base shape will remain backward compatible.
 */
export type ParsedIntent = IntentResult;

/**
 * Source of a `PlannedIntent`. Phase 3 only emits `pass-through`; future
 * phases that decompose multi-step requests will emit `decomposed`.
 *
 * Keeping this as a string-literal union (rather than a boolean flag) lets
 * us add new sources later (e.g. `"llm-planner"`, `"manual"`) without
 * breaking exhaustive switches in the dispatcher.
 */
export type PlanSource = "pass-through" | "decomposed";

/**
 * Phase 3 active type, Phase 4+ will populate `steps` with multiple entries.
 *
 * `planIntent()` wraps a single `ParsedIntent` into a one-step plan today.
 * Future phases can decompose multi-step requests into an ordered list of
 * `ParsedIntent` steps without changing this shape.
 *
 * The `source` field is optional so legacy code paths that build a
 * `PlannedIntent` literal (e.g. tests) do not have to set it.
 */
export interface PlannedIntent {
  /** Single-step requests have `steps.length === 1`. */
  steps: ParsedIntent[];
  /** Optional human-readable summary shown to the user before steps run. */
  summary?: string;
  /** How this plan was produced. Defaults to `"pass-through"` in Phase 3. */
  source?: PlanSource;
  /**
   * Free-form rationale for debugging / logs. Phase 3 leaves this empty;
   * Phase 4+ may write a short Korean-language explanation here.
   */
  planningReason?: string;
}

/**
 * Phase 5 placeholder.
 *
 * Mirrors the legacy `IntentRouteResponse` shape so dispatcher refactoring
 * can land without touching callers.
 */
export interface DispatchResult {
  intent: ParsedIntent;
  handled: boolean;
  requiresConfirmation: boolean;
  response: string;
  data?: unknown;
  confirmation?: IntentRouteResponse["confirmation"];
  /**
   * Phase 6-A — propagated from `IntentRouteResponse.handlerResponse`.
   * Migrated handlers populate this so `formatReply` can branch on
   * `handlerResponse.kind`. Optional — legacy handlers leave it
   * undefined.
   */
  handlerResponse?: HandlerResponse;
}

/**
 * Phase 5 placeholder. The final formatted reply is a plain string today;
 * the type alias documents the contract so future phases can evolve it
 * (e.g. into a structured object with attachments/buttons) without
 * surprising existing callers.
 */
export type FormattedIntentReply = string;

// ---------------------------------------------------------------------------
// zod schemas — runtime validation helpers.
//
// These are intentionally permissive (domain/action stay as `z.string()`)
// to match the legacy `parseJson<Partial<IntentResult>>` behavior. Future
// phases can tighten the schema with `z.enum` once handler coverage is
// confirmed.
// ---------------------------------------------------------------------------

export const ParsedIntentSchema = z.object({
  domain: z.string(),
  action: z.string(),
  type: z.enum(["query", "execute"]),
  confidence: z.number(),
  params: z.record(z.string(), z.unknown()),
});

/**
 * Loose schema used when validating raw LLM JSON output. Every field is
 * optional because the LLM occasionally drops keys; the caller is
 * responsible for filling defaults (see `parseIntent.ts`).
 */
export const PartialParsedIntentSchema = z.object({
  domain: z.string().optional(),
  action: z.string().optional(),
  type: z.enum(["query", "execute"]).optional(),
  confidence: z.number().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export type PartialParsedIntent = z.infer<typeof PartialParsedIntentSchema>;
