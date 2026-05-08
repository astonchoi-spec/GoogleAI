/**
 * Phase 3 compatibility shim.
 *
 * The classification stage now lives at
 * `server/intent/pipeline/parseIntent.ts`. This file re-exports its public
 * surface so existing imports of the form
 *
 *     import { parseIntent, normalizeIntent } from "../intent/parseIntent.ts";
 *
 * keep working without any caller-side change. New code should import
 * directly from `./pipeline/parseIntent.ts`.
 */
export * from "./pipeline/parseIntent.ts";
