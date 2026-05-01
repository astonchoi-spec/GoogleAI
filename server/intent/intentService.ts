import { llmAdapter } from "../_core/llmAdapter.ts";
import { fallbackIntent } from "./fallbackIntent.ts";
import { handlerRegistry } from "./registry.ts";
import {
  stringifyPreview,
  type IntentResult,
  type IntentRouteResponse,
  type RouteIntentOptions,
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

export function normalizeIntent(intent: IntentResult): IntentResult {
  if (intent.domain === "chat" || intent.action === "chat") {
    return {
      domain: "chat",
      action: "chat",
      type: "query",
      confidence: Math.min(intent.confidence || 0.3, 0.3),
      params: {},
    };
  }
  return intent;
}

export async function classifyIntent(message: string): Promise<IntentResult> {
  console.log("[INTENT] classifyIntent called:", message.slice(0, 80));

  // Step 1: 키워드 기반 사전 분류 (빠르고 정확)
  const keywordResult = fallbackIntent(message);
  console.log("[INTENT] fallback result:", keywordResult.action, "confidence:", keywordResult.confidence);
  if (keywordResult.confidence >= 0.5) {
    console.log("[INTENT] keyword match:", keywordResult.action, "confidence:", keywordResult.confidence);
    console.log(`[intent] matched: ${keywordResult.action} for input: ${message}`);
    return keywordResult;
  }

  // Step 2: 키워드 매칭 실패 시에만 LLM 호출
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const prompt = `사용자 메시지를 분석해서 JSON으로 응답하세요.

현재 날짜: ${now}
도메인: trading, realestate, finance, google, chat
타입: query 또는 execute
액션:
- trading_balance
- trading_positions
- trading_technical_analysis
- trading_risk_calculation
- trading_add_alert
- realestate_portfolio_summary
- realestate_feasibility
- realestate_add_deal
- realestate_update_deal_stage
- finance_dart_disclosures
- google_create_event: 캘린더 일정 생성
- google_write_sheet: 시트 데이터 쓰기
- google_drive_search: 구글드라이브 파일 검색 → params: {query: "검색어", maxResults: 10}
- google_get_emails: 이메일 목록 조회 → params: {maxResults: 5, searchQuery?: "검색어"}
- google_send_email: 이메일 전송 → params: {to, subject, body}
- google_list_events: 캘린더 일정 목록 조회 → params: {maxResults: 5}
- execute_placeholder
- chat

반드시 JSON만 응답:
{"domain":"...","action":"...","type":"query|execute","confidence":0.0,"params":{}}

규칙:
- "드라이브", "구글드라이브", "Drive", "파일 검색", "파일 찾아" → google_drive_search, params.query에 검색 키워드 추출
- "메일 확인", "받은 메일", "이메일 목록", "Gmail" → google_get_emails
- "메일 보내", "이메일 전송", "send email" → google_send_email
- "일정 확인", "오늘 일정", "캘린더 목록", "다음 일정" → google_list_events
- "일정 추가", "일정 잡아", "미팅 생성" → google_create_event
- 조회성 작업은 type=query, 변경성 작업(생성/삭제/수정/등록)은 type=execute
- 파라미터를 최대한 추출
- JSON 외 텍스트 금지`;

  try {
    const parsed = await llmAdapter.parseJson<Partial<IntentResult>>(message, prompt);
    if (!parsed.domain || !parsed.action || !parsed.type) {
      console.log("[INTENT] LLM returned invalid JSON, using fallbackIntent");
      return fallbackIntent(message);
    }
    const result = normalizeIntent({
      domain: parsed.domain,
      action: parsed.action,
      type: parsed.type,
      confidence: Number.isFinite(parsed.confidence) ? Number(parsed.confidence) : 0,
      params: parsed.params && typeof parsed.params === "object" ? parsed.params : {},
    } as IntentResult);
    console.log("[INTENT] LLM classified:", result.action, "confidence:", result.confidence, "params:", JSON.stringify(result.params).slice(0, 100));
    return result;
  } catch (err) {
    console.log("[INTENT] LLM classify error, using fallbackIntent:", (err as Error).message);
    return fallbackIntent(message);
  }
}

export async function routeIntentMessage(options: RouteIntentOptions): Promise<IntentRouteResponse> {
  console.log("[INTENT] routeIntentMessage:", options.message.slice(0, 80));
  const intent = await classifyIntent(options.message);
  console.log("[INTENT] classified as:", intent.domain, "/", intent.action, "type:", intent.type, "confidence:", intent.confidence);
  const allowExecute = options.allowExecute ?? false;

  // execute 의도는 승인 단계 필요
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
    const handler = handlerRegistry[intent.action];
    if (handler) {
      return await handler(intent, options);
    }

    if (intent.action === "execute_placeholder") {
      return {
        intent,
        handled: false,
        requiresConfirmation: false,
        response: "실행 액션 라우팅은 현재 단계적으로 연결 중입니다. 다음 배치에서 실제 실행 경로를 연결합니다.",
      };
    }

    console.log("[INTENT] no handler for action:", intent.action, "→ falling back to Gemini");
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
      response: `데이터 케이스 실행 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function formatIntentRouteMessage(routed: IntentRouteResponse): string {
  if (routed.requiresConfirmation) {
    const paramsPreview = stringifyPreview(routed.confirmation?.params ?? {}, 500);
    return [
      "ACTION REQUIRES CONFIRMATION",
      routed.response,
      `intent=${routed.intent.domain}/${routed.intent.action} type=${routed.intent.type}`,
      ...(paramsPreview ? [`params=${paramsPreview}`] : []),
      "next=allowExecute=true 로 승인 재요청",
    ].join("\n");
  }

  if (!routed.handled) {
    // 빈 문자열 반환 → 호출자가 Gemini 일반 대화로 fallback
    return "";
  }

  const data = routed.data as any;
  const primaryBody =
    typeof data?.fileList === "string" ? data.fileList
      : typeof data?.emailList === "string" ? data.emailList
        : typeof data?.eventList === "string" ? data.eventList
          : typeof data?.briefing === "string" ? data.briefing
            : typeof data?.report === "string" ? data.report
              : typeof data?.summary === "string" ? data.summary
                : "";
  const fallbackBody = primaryBody || stringifyPreview(data);

  return [
    routed.response,
    ...(fallbackBody ? [fallbackBody] : []),
  ].join("\n\n");
}
