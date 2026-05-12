import type { ParsedIntent, PlannedIntent } from "../intentSchemas.ts";

/**
 * Optional context for `planIntent`. Reserved for Phase 4+ when the planner
 * will look at conversation history, recent decisions, or available
 * specialists. Phase 3 ignores every field — it is declared here only so
 * future callers can pass context without changing the function signature.
 */
export interface PlanIntentContext {
  /** Original user message, in case the planner wants to re-read it. */
  message?: string;
  /** Caller hint (telegram | web | cron | api). */
  channel?: string;
  /** Anything the dispatcher knows about the user (id, role, locale). */
  userId?: string;
}

/**
 * Phase 3: pass-through planner stub.
 *
 * Wraps a single `ParsedIntent` into a one-step `PlannedIntent` without any
 * decomposition. The dispatcher continues to execute `plan.steps[0]`, so
 * runtime behaviour is identical to the previous direct path.
 *
 * NOTE — Phase 3 contract:
 *   - Input intent is preserved verbatim (domain/action/type/confidence/params).
 *   - `steps.length === 1` always.
 *   - `source` is set to `"pass-through"` so logs/tests can detect Phase 3
 *     output explicitly.
 *   - LLM planner prompt at `server/intent/prompts/planner.md` exists but
 *     is *not* loaded yet — that is reserved for Phase 4.
 */
export async function planIntent(
  intent: ParsedIntent,
  _context?: PlanIntentContext,
): Promise<PlannedIntent> {
  return {
    steps: [intent],
    source: "pass-through",
  };
}
