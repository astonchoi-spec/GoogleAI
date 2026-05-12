import { stringifyPreview, type IntentRouteResponse } from "../types.ts";
import type {
  DispatchResult,
  FormattedIntentReply,
  HandlerResponseKind,
} from "../intentSchemas.ts";

// ---------------------------------------------------------------------------
// Raw-object protection helpers
//
// The previous `formatIntentRouteMessage` body in intentService.ts contained
// two tiny utilities that prevent internal RPC envelopes (e.g.
// `{ method: "...", params: { ... } }`) from leaking into telegram/web
// replies. Phase 5 lifts them out so they can be unit-tested directly and
// reused by future formatter variants.
// ---------------------------------------------------------------------------

/**
 * True when `data` looks like an internal tool envelope rather than a
 * user-facing payload. The original heuristic only checked `method` /
 * `files` because those were the two actual leaks observed in production
 * (deals router and Google Drive payloads). Kept identical to avoid
 * behavioural drift.
 */
export function containsRawObjectShape(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  return "method" in record || "files" in record;
}

/** Same shape as `containsRawObjectShape`, exported under a more generic
 *  name so future callers can branch on "is this a plain JS object that
 *  should never reach the user verbatim?" without coupling to the deals
 *  router heuristic. */
export function isPlainObjectReply(data: unknown): boolean {
  return Boolean(data) && typeof data === "object";
}

/** Bounded JSON preview used in console warnings. Never surfaced to users. */
export function safeStringifyForDebug(data: unknown, maxLength = 300): string {
  return stringifyPreview(data, maxLength);
}

/**
 * Convert raw `data` from a handler into a string that is safe to display
 * to the user. Behaviour matches the legacy `safeDisplayBody`:
 *   - undefined/null → empty string
 *   - string         → returned verbatim
 *   - tool envelope  → warning logged + Korean fallback message
 *   - other object   → warning logged + empty string
 *   - everything else → `String(data)`
 */
export function toUserVisibleText(data: unknown): string {
  if (data === undefined || data === null) return "";
  if (typeof data === "string") return data;
  if (containsRawObjectShape(data)) {
    console.warn(
      "[intent] raw object response blocked:",
      safeStringifyForDebug(data),
    );
    return "⚠️ 내부 데이터가 직접 노출될 수 있어 요약 표시로 전환했습니다.";
  }
  if (typeof data === "object") {
    console.warn(
      "[intent] object response omitted from user output:",
      safeStringifyForDebug(data),
    );
    return "";
  }
  return String(data);
}

// Legacy alias kept for any future reader who greps for the old name.
// Not re-exported from intentService.ts; only used internally here.
const safeDisplayBody = toUserVisibleText;

// ---------------------------------------------------------------------------
// Handler-response kind inference (Phase 5 draft)
//
// Existing handlers do not yet return `HandlerResponse`. They return
// `IntentRouteResponse` whose `data` field carries strings under one of
// six ad-hoc keys (`fileList`, `emailList`, `eventList`, `briefing`,
// `report`, `summary`). `inferKind()` lets future code branch on a
// stable enum even while the legacy shape is in use. It is exported but
// NOT yet relied on by `formatReply()` below — Phase 6+ will swap the
// formatter body to switch on `inferKind()` once handler migration begins.
// ---------------------------------------------------------------------------

const LEGACY_LIST_KEYS = ["fileList", "emailList", "eventList"] as const;
const LEGACY_REPORT_KEYS = ["briefing", "report", "summary"] as const;

export function inferKind(routed: {
  handled: boolean;
  requiresConfirmation: boolean;
  response: string;
  data?: unknown;
}): HandlerResponseKind {
  if (routed.requiresConfirmation) return "confirmation";
  if (!routed.handled) return "text";

  const data = routed.data as Record<string, unknown> | undefined;
  if (data && typeof data === "object") {
    if (LEGACY_LIST_KEYS.some((k) => typeof data[k] === "string")) return "list";
    if (LEGACY_REPORT_KEYS.some((k) => typeof data[k] === "string")) return "report";
  }
  return "text";
}

// ---------------------------------------------------------------------------
// Primary formatter — Phase 5 entry point
// ---------------------------------------------------------------------------

/**
 * Phase 5 entry point. Accepts the new `DispatchResult` shape produced by
 * `dispatchIntent` and returns a user-ready Korean string.
 *
 * Behaviour is byte-for-byte identical to the legacy
 * `formatIntentRouteMessage`. The function purposely does NOT yet branch
 * on `inferKind()` — handler migration in Phase 6+ will replace the body
 * with a `switch (kind)` once enough handlers emit `HandlerResponse`.
 */
export function formatReply(result: DispatchResult): FormattedIntentReply {
  // Phase 7-B 명시: `requiresConfirmation: true`는 dispatchIntent 의 실행 승인
  // 게이트 결과 (`intent.type === "execute" && !allowExecute`). 이 분기는
  // 모든 handlerResponse.kind 분기보다 우선 처리되어 `ACTION REQUIRES
  // CONFIRMATION` 헤더를 출력한다. handlerResponse.kind === "confirmation"
  // 과는 직교(orthogonal) 관계 — 두 가지가 동시에 true 여도 이 분기가 먼저
  // 처리되어 헤더가 출력되며, 하단의 handlerText 추출 로직은 실행되지 않는다.
  if (result.requiresConfirmation) {
    const paramsPreview = stringifyPreview(
      result.confirmation?.params ?? {},
      500,
    );
    return [
      "ACTION REQUIRES CONFIRMATION",
      result.response,
      `intent=${result.intent.domain}/${result.intent.action} type=${result.intent.type}`,
      ...(paramsPreview ? [`params=${paramsPreview}`] : []),
      "next=allowExecute=true 로 승인 재요청",
    ].join("\n");
  }

  if (!result.handled) {
    // 빈 문자열 반환 → 호출자가 Gemini 일반 대화로 fallback
    return "";
  }

  // Phase 6-A/6-B/6-C — prefer the migrated `HandlerResponse.text` when
  // the handler populated it under a supported kind:
  //   - Phase 6-A list  : google_drive_search / google_get_emails /
  //                       google_list_events
  //   - Phase 6-B report: trading_technical_analysis / analysis_indicators /
  //                       analysis_rsi / analysis_macd / analysis_bollinger
  //                       (trading_pre_check / trading_review_report use
  //                        empty text because their full body is already in
  //                        `response`; legacy fallback below is unchanged).
  //   - Phase 6-C text  : deals_command and any future single-block text
  //                       handler. Migrated deals handlers always set
  //                       text="" so this branch only fires when a future
  //                       handler explicitly opts in.
  //   - Phase 7-A error : 누적 8개 도메인 24개 에러성 분기 재분류 — Phase
  //                       6-D 시리즈 동안 임시 `kind="text"` + `meta.status`
  //                       로 마킹됐던 에러/검증 실패/not_found/dispatch_warning
  //                       분기를 `kind="error"`로 정식 재분류. 사용자 출력은
  //                       `text` 분기와 byte-for-byte 동일 (에러 prefix 추가
  //                       금지, meta.status 별 분기 처리 금지). meta는
  //                       다른 kind와 마찬가지로 절대 노출 금지.
  //   - Phase 7-B confirmation : 마지막 미활성 kind 활성화. 사용자 출력은
  //                       `text` 분기와 byte-for-byte 동일 (자동 prefix
  //                       금지, ACTION REQUIRES CONFIRMATION 헤더 자동
  //                       추가 금지). `requiresConfirmation: true` 분기와
  //                       `kind="confirmation"` 마커는 직교(orthogonal):
  //                         - `requiresConfirmation: true` = dispatchIntent
  //                           의 실행 승인 게이트(`ACTION REQUIRES
  //                           CONFIRMATION` 헤더 출력). 위 line ~123 분기.
  //                         - `kind="confirmation"` = 핸들러가 만든 응답
  //                           형태 마커. 사용자 응답 풍의 추가 처리는
  //                           아직 없음 (text 분기와 동일).
  //                       두 분기가 동시에 true면 `requiresConfirmation`
  //                       분기가 항상 먼저 처리되어 헤더 출력 (line 123
  //                       조건이 아래보다 위에 있음). Phase 7-B에서는
  //                       formatReply 활성화만 진행하고 핸들러 재분류는
  //                       하지 않음 — 현재 시스템은 승인 게이트가 이미
  //                       `requiresConfirmation`로 동작하므로 `kind=
  //                       "confirmation"`은 보조 마커로만 사용.
  //
  // The legacy `data.fileList` / `emailList` / `eventList` / `briefing` /
  // `report` / `summary` lookup remains intact below so non-migrated
  // handlers keep working byte-for-byte. Migrated handlers either populate
  // BOTH paths (kind=list/report with text mirroring data) or use text=""
  // to defer to legacy entirely (kind=report/text/error/confirmation
  // marker-only).
  //
  // `meta` on `handlerResponse` is intentionally NEVER read here — it is
  // diagnostics-only and must not surface to telegram/web users. The
  // `typeof === "string"` guard ensures non-string text values (e.g. an
  // accidental object) cannot leak through this path.
  const handlerKind = result.handlerResponse?.kind;
  const handlerText =
    (handlerKind === "list" ||
      handlerKind === "report" ||
      handlerKind === "text" ||
      handlerKind === "error" ||
      handlerKind === "confirmation") &&
    typeof result.handlerResponse?.text === "string"
      ? result.handlerResponse.text
      : "";

  const data = result.data as any;
  const primaryBody =
    handlerText
      || (typeof data?.fileList === "string" ? data.fileList : "")
      || (typeof data?.emailList === "string" ? data.emailList : "")
      || (typeof data?.eventList === "string" ? data.eventList : "")
      || (typeof data?.briefing === "string" ? data.briefing : "")
      || (typeof data?.report === "string" ? data.report : "")
      || (typeof data?.summary === "string" ? data.summary : "");
  const fallbackBody = primaryBody || safeDisplayBody(data);

  return [
    result.response,
    ...(fallbackBody ? [fallbackBody] : []),
  ].join("\n\n");
}

/**
 * Legacy adapter — accepts the original `IntentRouteResponse` shape that
 * tRPC routers and the telegram bot already construct. Kept as a thin
 * wrapper so existing import sites do not have to change:
 *   - server/llm/telegramBot/messageRouter.ts
 *   - server/routers/intent.ts
 *   - server/routers/llm.ts
 *   - server/__tests__/dealRouting.test.ts
 *
 * `IntentRouteResponse` and `DispatchResult` are structurally identical at
 * the time of Phase 5; future divergence (e.g. `kind` being added to
 * `DispatchResult` only) will be handled by widening this adapter.
 */
export function formatRouteResponse(routed: IntentRouteResponse): FormattedIntentReply {
  return formatReply(routed as unknown as DispatchResult);
}
