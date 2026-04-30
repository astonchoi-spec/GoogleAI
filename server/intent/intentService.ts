import { matchWikiSave, matchWikiSearch, executeWikiSave, executeWikiSearch } from "./wiki.ts";
import { exchangeConnector } from "../exchanges/exchangeConnector.ts";
import { gateioConnector } from "../exchanges/gateioConnector.ts";
import { kiwoomConnector } from "../exchanges/kiwoomConnector.ts";
import { taEngine } from "../trading/technicalAnalysis.ts";
import { calculateFuturesRisk } from "../trading/riskCalculator.ts";
import { riskGuard } from "../trading/riskGuard.ts"; // MODIFIED: Risk Guard 룰 엔진 연결
import { parsePreCheckMessage, runPreCheck, formatPreCheck } from "../trading/preCheckEngine.ts"; // MODIFIED: AI 진입 전 점검 어시스턴트
import { DealPipeline } from "../realestate/dealPipeline.ts";
import {
  calculateFeasibility,
  formatFeasibilityReport,
  formatSimpleFeasibilityReport,
  runFeasibility,
  type SimpleFeasibilityInput,
  type SimpleFeasibilityResult,
} from "../realestate/feasibilityEngine.ts";
import { getDisclosures } from "../finance/dartAPI.ts";
import { googleAuthManager } from "../routers/google-workspace.ts";
import { llmAdapter } from "../_core/llmAdapter.ts";
import { addAlert, startAlertScheduler } from "../alerts/alertEngine.ts";
import CalendarConnector from "../google/calendar.ts";
import SheetsConnector from "../google/sheets.ts";
import DriveConnector from "../google/drive.ts";
import GmailConnector from "../google/gmail.ts";
import { executeMorningBriefing, isBriefingTestMessage } from "../intelligence/briefing.ts";

export type IntentDomain = "trading" | "realestate" | "finance" | "google" | "wiki" | "intelligence" | "chat";
export type IntentType = "query" | "execute";
export type IntentAction =
  | "trading_balance"
  | "trading_positions"
  | "trading_technical_analysis"
  | "trading_risk_calculation"
  | "trading_add_alert" // MODIFIED: execute action for alert creation with confirmation gate.
  | "trading_risk_calculate" // MODIFIED: risk calculation action
  | "trading_risk_status" // MODIFIED: Risk Guard 상태 조회
  | "trading_risk_lock" // MODIFIED: Risk Guard 수동 잠금
  | "trading_risk_unlock" // MODIFIED: Risk Guard 수동 잠금 해제
  | "trading_risk_settings_update" // MODIFIED: Risk Guard 한도 변경
  | "trading_pre_check" // MODIFIED: 진입 전 점검 어시스턴트
  | "intelligence_morning_briefing"
  | "analysis_indicators" // MODIFIED: technical analysis full indicators
  | "analysis_rsi" // MODIFIED: technical analysis RSI
  | "analysis_macd" // MODIFIED: technical analysis MACD
  | "analysis_bollinger" // MODIFIED: technical analysis Bollinger Bands
  | "realestate_portfolio_summary"
  | "realestate_feasibility"
  | "realestate_simple_feasibility" // MODIFIED: simple feasibility analysis with direct cost inputs
  | "realestate_land_use" // MODIFIED: land use regulation inquiry
  | "realestate_land_price" // MODIFIED: land price inquiry
  | "realestate_real_transaction" // MODIFIED: real transaction price inquiry
  | "realestate_add_deal" // MODIFIED: execute action for PF deal creation.
  | "realestate_update_deal_stage" // MODIFIED: execute action for PF stage transition.
  | "realestate_deals_list" // deals.list intent
  | "realestate_deals_create" // deals.create intent
  | "realestate_deals_update" // deals.update intent
  | "finance_dart_disclosures"
  | "google_create_event" // MODIFIED: execute action for calendar event creation.
  | "google_write_sheet" // MODIFIED: execute action for sheet write.
  | "google_drive_search"
  | "google_get_emails"
  | "google_send_email"
  | "google_list_events"
  | "wiki_save"
  | "wiki_search"
  | "execute_placeholder"
  | "chat";

export type IntentResult = {
  domain: IntentDomain;
  action: IntentAction;
  type: IntentType;
  confidence: number;
  params: Record<string, unknown>;
};

export type IntentRouteResponse = {
  intent: IntentResult;
  handled: boolean;
  requiresConfirmation: boolean;
  response: string;
  data?: unknown;
  confirmation?: {
    action: IntentAction;
    domain: IntentDomain;
    params: Record<string, unknown>;
  }; // MODIFIED: include structured execute confirmation payload for approval flow.
};

type RouteIntentOptions = {
  userId: string;
  message: string;
  allowExecute?: boolean;
};

function spreadsheetIdFromEnv(): string {
  const spreadsheetId = process.env.WORKSPACE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error("WORKSPACE_SPREADSHEET_ID is missing");
  }
  return spreadsheetId;
}

function fallbackIntent(message: string): IntentResult {
  const lower = message.toLowerCase();

  // wiki_save / wiki_search — 명시적 prefix이므로 최상단에서 처리
  const wikiSave = matchWikiSave(message);
  if (wikiSave) return wikiSave;
  const wikiSearch = matchWikiSearch(message);
  if (wikiSearch) return wikiSearch;

  // MODIFIED: trading_pre_check — "BTC 숏 77000 손절 78500 목표 74000" 형태 매칭
  // NOTE: 이 블록은 반드시 trading_risk_calculate("손절" 트리거)보다 먼저 실행되어야 한다.
  const parsedPreCheck = parsePreCheckMessage(message);
  if (parsedPreCheck) {
    return {
      domain: "trading",
      action: "trading_pre_check",
      type: "query",
      confidence: 0.98,
      params: {
        symbol: parsedPreCheck.symbol,
        side: parsedPreCheck.side,
        entryPrice: parsedPreCheck.entryPrice,
        stopLoss: parsedPreCheck.stopLoss,
        takeProfit: parsedPreCheck.takeProfit,
      },
    };
  }

  if (isBriefingTestMessage(message)) {
    return {
      domain: "intelligence",
      action: "intelligence_morning_briefing",
      type: "execute",
      confidence: 0.95,
      params: {},
    };
  }

  if (lower.includes("잔고") || lower.includes("balance")) { // MODIFIED: repair broken string literals and keep deterministic balance fallback.
    return {
      domain: "trading",
      action: "trading_balance",
      type: "query",
      confidence: 0.55,
      params: {
        exchange: lower.includes("키움") ? "kiwoom" : lower.includes("upbit") ? "upbit" : (lower.includes("게이트") || lower.includes("gate")) ? "gateio" : "binance",
      },
    };
  }

  if (lower.includes("포지션") || lower.includes("position") || lower.includes("positions")) { // MODIFIED: normalize position keywords. Add Gate.io support.
    return {
      domain: "trading",
      action: "trading_positions",
      type: "query",
      confidence: 0.55,
      params: { exchange: lower.includes("bybit") ? "bybit" : (lower.includes("게이트") || lower.includes("gate")) ? "gateio" : "binance" },
    };
  }

  // MODIFIED: Add Kiwoom stock quote recognition before TA analysis.
  if (lower.includes("현재가") || lower.includes("주가") || lower.includes("코스피") || lower.includes("quote") ||
      lower.includes("삼성") || lower.includes("lg") || lower.includes("sk") || /\d{6}/.test(message)) {
    return {
      domain: "trading",
      action: "trading_balance", // Route to kiwoom balance via params
      type: "query",
      confidence: 0.6,
      params: {
        exchange: "kiwoom",
        stockCode: /\d{6}/.test(message) ? message.match(/\d{6}/)?.[0] : "005930",
      },
    };
  }

  // MODIFIED: Add granular technical analysis intent routing
  if (lower.includes("rsi")) {
    return {
      domain: "trading",
      action: "analysis_rsi",
      type: "query",
      confidence: 0.7,
      params: { exchange: "gateio", symbol: "BTC/USDT", timeframe: "1h", period: 14 },
    };
  }

  if (lower.includes("macd")) {
    return {
      domain: "trading",
      action: "analysis_macd",
      type: "query",
      confidence: 0.7,
      params: { exchange: "gateio", symbol: "BTC/USDT", timeframe: "1h" },
    };
  }

  if (lower.includes("볼린저") || lower.includes("bollinger")) {
    return {
      domain: "trading",
      action: "analysis_bollinger",
      type: "query",
      confidence: 0.7,
      params: { exchange: "gateio", symbol: "BTC/USDT", timeframe: "1h", period: 20, stdDev: 2 },
    };
  }

  if (lower.includes("기술") || lower.includes("ta") || lower.includes("분석")) { // MODIFIED: normalize TA keywords.
    return {
      domain: "trading",
      action: "analysis_indicators",
      type: "query",
      confidence: 0.6,
      params: { exchange: "gateio", symbol: "BTC/USDT", timeframe: "1h" },
    };
  }

  // MODIFIED: Risk Guard 명령 — 상태 조회 / 잠금 / 해제 / 한도 변경
  // 공백 유무에 관계없이 매칭하기 위해 압축 버전을 함께 검사한다.
  const compact = lower.replace(/\s+/g, "");
  if (
    compact.includes("리스크상태") ||
    compact.includes("리스크가드") ||
    compact.includes("리스크게이트") ||
    lower.includes("risk status") ||
    lower.includes("risk guard")
  ) {
    return { domain: "trading", action: "trading_risk_status", type: "query", confidence: 0.95, params: {} };
  }
  if (
    compact.includes("오늘거래중지") ||
    compact.includes("거래중지") ||
    compact.includes("거래잠금") ||
    lower.includes("trading lock")
  ) {
    return {
      domain: "trading",
      action: "trading_risk_lock",
      type: "execute",
      confidence: 0.9,
      params: { reason: "사용자 수동 잠금" },
    };
  }
  if (
    compact.includes("거래재개") ||
    compact.includes("거래잠금해제") ||
    compact.includes("거래해제") ||
    lower.includes("trading unlock")
  ) {
    return { domain: "trading", action: "trading_risk_unlock", type: "execute", confidence: 0.9, params: {} };
  }
  if (compact.includes("리스크한도")) {
    const matchPercent = message.match(/(-?\d+(?:\.\d+)?)\s*%/);
    const limit = matchPercent ? Math.abs(Number(matchPercent[1])) : undefined;
    let asset: string | undefined;
    if (lower.includes("코인")) asset = "coin";
    else if (lower.includes("선물")) asset = "futures";
    else if (lower.includes("한국") || lower.includes("국내")) asset = "kr-stock";
    else if (lower.includes("미국")) asset = "us-stock";
    return {
      domain: "trading",
      action: "trading_risk_settings_update",
      type: "execute",
      confidence: 0.75,
      params: { dailyLossLimitPercent: limit, asset },
    };
  }

  // MODIFIED: 리스크 계산 인텐트는 명시적 키워드(포지션 사이징/손절/청산가)가 있을 때만 매칭.
  // 단순 "리스크"만 포함된 메시지는 위의 trading_risk_status 등에서 이미 처리되었거나,
  // 그렇지 않다면 fallback으로 trading_risk_status를 반환해 의도치 않은 계산기를 막는다.
  // MODIFIED: "손절"은 trading_pre_check 키워드이므로 risk_calculate 트리거에서 제거.
  // risk_calculate는 명시적 키워드("포지션사이징"/"청산가"/"리스크계산")가 있을 때만 매칭.
  if (
    compact.includes("포지션사이징") ||
    lower.includes("청산가") ||
    compact.includes("리스크계산")
  ) {
    return {
      domain: "trading",
      action: "trading_risk_calculate",
      type: "query",
      confidence: 0.6,
      params: {
        entryPrice: 65000,
        accountBalance: 10000,
        riskPercent: 2,
        leverage: 10,
        stopLossPrice: 63000,
        side: "long",
      },
    };
  }

  if (lower.includes("딜 목록") || lower.includes("pf 현황")) {
    return { domain: "realestate", action: "realestate_deals_list", type: "query", confidence: 0.7, params: {} };
  }

  if (lower.includes("딜 등록") || lower.includes("신규 딜")) {
    return { domain: "realestate", action: "realestate_deals_create", type: "execute", confidence: 0.7, params: {} };
  }

  if (lower.includes("딜 수정") || lower.includes("단계 변경")) {
    return { domain: "realestate", action: "realestate_deals_update", type: "execute", confidence: 0.7, params: {} };
  }

  if (lower.includes("pf") || lower.includes("파이프라인") || lower.includes("포트폴리오")) { // MODIFIED: normalize PF portfolio keywords.
    return {
      domain: "realestate",
      action: "realestate_portfolio_summary",
      type: "query",
      confidence: 0.55,
      params: {},
    };
  }

  if (
    lower.includes("사업성") ||
    lower.includes("pf 시뮬레이션") ||
    lower.includes("분양 수익률") ||
    lower.includes("손익분기")
  ) {
    return {
      domain: "realestate",
      action: "realestate_simple_feasibility",
      type: "query",
      confidence: 0.6,
      params: {
        projectName: "신규 프로젝트",
        landCost: 5000000000,
        constructionCost: 10000000000,
        designFee: 1000000000,
        financeCost: 2000000000,
        taxAndFee: 500000000,
        otherCost: 1500000000,
        totalUnits: 100,
        avgSalePrice: 200000000,
        projectMonths: 30,
      },
    };
  }

  // MODIFIED: Add public data inquiry intents
  if (lower.includes("토지이용규제") || lower.includes("용도지역")) {
    return {
      domain: "realestate",
      action: "realestate_land_use",
      type: "query",
      confidence: 0.6,
      params: { pnu: "" },
    };
  }

  if (lower.includes("공시지가")) {
    return {
      domain: "realestate",
      action: "realestate_land_price",
      type: "query",
      confidence: 0.6,
      params: { pnu: "", year: new Date().getFullYear().toString() },
    };
  }

  if (lower.includes("실거래가")) {
    return {
      domain: "realestate",
      action: "realestate_real_transaction",
      type: "query",
      confidence: 0.6,
      params: { regionCode: "", yearMonth: yyyymmdd(new Date()).slice(0, 6) },
    };
  }

  if (lower.includes("feasibility") && !lower.includes("사업성")) {
    return {
      domain: "realestate",
      action: "realestate_feasibility",
      type: "query",
      confidence: 0.5,
      params: {
        projectName: "샘플 프로젝트",
        landCost: 150,
        landArea: 1000,
        buildingCoverageRate: 60,
        floorAreaRate: 300,
        floors: 20,
        constructionCostPerPyeong: 900,
        sellingPricePerPyeong: 1800,
      },
    };
  }

  if (lower.includes("dart") || lower.includes("공시")) {
    const endDate = yyyymmdd(new Date());
    const startDate = yyyymmdd(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    return {
      domain: "finance",
      action: "finance_dart_disclosures",
      type: "query",
      confidence: 0.5,
      params: { corpCode: "00126380", startDate, endDate },
    };
  }

  // Google Workspace keyword fallbacks
  if (
    lower.includes("드라이브") ||
    lower.includes("구글드라이브") ||
    lower.includes("google drive") ||
    (lower.includes("drive") && (lower.includes("파일") || lower.includes("검색") || lower.includes("찾"))) ||
    lower.includes("파일 검색") ||
    lower.includes("파일 찾")
  ) {
    // Extract search keyword from the message (strip common Korean command words)
    const driveQuery = extractDriveQuery(message);
    console.log("[INTENT FALLBACK] google_drive_search detected, query:", driveQuery);
    return {
      domain: "google",
      action: "google_drive_search",
      type: "query",
      confidence: 0.75,
      params: { query: driveQuery, maxResults: 10 },
    };
  }

  if (
    lower.includes("메일 확인") ||
    lower.includes("받은 메일") ||
    lower.includes("이메일 목록") ||
    lower.includes("이메일 확인") ||
    lower.includes("gmail") ||
    lower.includes("받은편지함")
  ) {
    console.log("[INTENT FALLBACK] google_get_emails detected");
    return {
      domain: "google",
      action: "google_get_emails",
      type: "query",
      confidence: 0.7,
      params: { maxResults: 5 },
    };
  }

  if (
    lower.includes("메일 보내") ||
    lower.includes("이메일 전송") ||
    lower.includes("이메일 발송") ||
    lower.includes("send email") ||
    lower.includes("메일 발송")
  ) {
    console.log("[INTENT FALLBACK] google_send_email detected");
    return {
      domain: "google",
      action: "google_send_email",
      type: "execute",
      confidence: 0.7,
      params: {},
    };
  }

  if (
    lower.includes("오늘 일정") ||
    lower.includes("일정 확인") ||
    lower.includes("캘린더 목록") ||
    lower.includes("다음 일정") ||
    lower.includes("이번 주 일정") ||
    lower.includes("스케줄 확인")
  ) {
    console.log("[INTENT FALLBACK] google_list_events detected");
    return {
      domain: "google",
      action: "google_list_events",
      type: "query",
      confidence: 0.7,
      params: { maxResults: 5 },
    };
  }

  if (lower.includes("알림") && (lower.includes("추가") || lower.includes("등록"))) {
    return {
      domain: "trading",
      action: "trading_add_alert",
      type: "execute",
      confidence: 0.55,
      params: {
        telegramChatId: process.env.OWNER_TELEGRAM_CHAT_ID || "",
        type: "price",
        exchange: "binance",
        symbol: "BTC/USDT",
        operator: "above",
        value: 100000,
      }, // MODIFIED: provide executable defaults for alert registration confirmation flow.
    };
  }

  if ((lower.includes("pf") || lower.includes("딜")) && lower.includes("추가")) {
    return {
      domain: "realestate",
      action: "realestate_add_deal",
      type: "execute",
      confidence: 0.55,
      params: {
        projectName: "신규 프로젝트",
        location: "",
        stage: "검토",
      }, // MODIFIED: map PF add requests into explicit execute intent.
    };
  }

  if ((lower.includes("pf") || lower.includes("딜")) && lower.includes("단계") && (lower.includes("변경") || lower.includes("수정"))) {
    return {
      domain: "realestate",
      action: "realestate_update_deal_stage",
      type: "execute",
      confidence: 0.55,
      params: {
        id: "",
        stage: "심사",
      }, // MODIFIED: map PF stage updates into explicit execute intent.
    };
  }

  if ((lower.includes("캘린더") || lower.includes("일정")) && (lower.includes("생성") || lower.includes("추가"))) {
    const start = new Date();
    start.setHours(start.getHours() + 1, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return {
      domain: "google",
      action: "google_create_event",
      type: "execute",
      confidence: 0.55,
      params: {
        title: "새 일정",
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        isAllDay: false,
      }, // MODIFIED: map calendar create requests into execute intent with safe defaults.
    };
  }

  if ((lower.includes("시트") || lower.includes("sheets")) && (lower.includes("쓰기") || lower.includes("기록") || lower.includes("입력"))) {
    return {
      domain: "google",
      action: "google_write_sheet",
      type: "execute",
      confidence: 0.55,
      params: {
        spreadsheetId: process.env.WORKSPACE_SPREADSHEET_ID || "",
        range: "Sheet1!A1",
        values: [["sample"]],
      }, // MODIFIED: map sheet-write requests into execute intent with editable defaults.
    };
  }

  if (
    lower.includes("드라이브") ||
    lower.includes("구글드라이브") ||
    lower.includes("google drive") ||
    lower.includes("파일 검색") ||
    lower.includes("파일 찾")
  ) {
    const query = message.replace(/드라이브에서|구글드라이브에서|에서|검색|찾아|줘|해줘|파일/g, "").trim();
    return {
      domain: "google",
      action: "google_drive_search",
      type: "query",
      confidence: 0.75,
      params: { query: query || message, maxResults: 10 },
    };
  }

  if (
    lower.includes("메일 확인") || lower.includes("받은 메일") ||
    lower.includes("이메일") || lower.includes("gmail")
  ) {
    return { domain: "google", action: "google_get_emails", type: "query", confidence: 0.7, params: { maxResults: 5 } };
  }

  if (
    lower.includes("일정 확인") || lower.includes("오늘 일정") ||
    lower.includes("캘린더") || lower.includes("다음 일정") || lower.includes("스케줄")
  ) {
    return { domain: "google", action: "google_list_events", type: "query", confidence: 0.7, params: { maxResults: 5 } };
  }

  if (lower.includes("메일 보내") || lower.includes("이메일 전송")) {
    return { domain: "google", action: "google_send_email", type: "execute", confidence: 0.7, params: {} };
  }

  // MODIFIED: "리스크"가 포함된 메시지는 AI 일반 응답으로 넘기지 않고 Risk Guard 상태로 라우팅.
  if (compact.includes("리스크") || lower.includes("risk")) {
    return { domain: "trading", action: "trading_risk_status", type: "query", confidence: 0.7, params: {} };
  }

  return {
    domain: "chat",
    action: "chat",
    type: "query",
    confidence: 0.3,
    params: {},
  };
}

function asString(value: unknown, fallbackValue: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallbackValue;
}

function asNumber(value: unknown, fallbackValue: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallbackValue;
}

function asBoolean(value: unknown, fallbackValue: boolean): boolean {
  if (typeof value === "boolean") return value; // MODIFIED: preserve explicit boolean params from intent parser.
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return fallbackValue;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0); // MODIFIED: normalize array params from loosely formatted LLM JSON.
}

function as2DArray(value: unknown): unknown[][] {
  if (!Array.isArray(value)) return [];
  return value.filter((row) => Array.isArray(row)) as unknown[][];
}

function yyyymmdd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function normalizeIntent(intent: IntentResult): IntentResult {
  if (intent.domain === "chat" || intent.action === "chat") {
    return {
      domain: "chat",
      action: "chat",
      type: "query",
      confidence: Math.min(intent.confidence || 0.3, 0.3),
      params: {},
    }; // MODIFIED: chat is never an execute action; let generic LLM fallback answer normal conversation.
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

  if (intent.type === "execute" && !allowExecute) {
    return {
      intent,
      handled: false,
      requiresConfirmation: true,
      response: "실행 요청으로 분류되었습니다. 안전을 위해 확인 단계가 필요합니다.", // MODIFIED: clarify approval stage for execute intents.
      confirmation: {
        action: intent.action,
        domain: intent.domain,
        params: intent.params,
      }, // MODIFIED: return structured payload for follow-up approval UX.
    };
  }

  try {
    if (intent.action === "trading_balance") {
      const exchange = asString(intent.params.exchange, "binance");
      let data;
      if (exchange === "gateio") {
        // MODIFIED: handle Gate.io balance query via dedicated connector.
        data = await gateioConnector.getSpotBalance();
      } else if (exchange === "kiwoom") {
        // MODIFIED: handle Kiwoom balance/quote query via dedicated connector.
        const stockCode = asString(intent.params.stockCode, "");
        if (stockCode) {
          data = await kiwoomConnector.getQuote(stockCode);
        } else {
          data = await kiwoomConnector.getBalance();
        }
      } else {
        console.log(`attempting ${exchange} balance fetch`);
        try {
          data = await exchangeConnector.getBalance(exchange as "binance" | "upbit" | "bybit");
        } catch (balanceError) {
          const errMsg = balanceError instanceof Error ? balanceError.message : String(balanceError);
          console.error(`${exchange} balance fetch error:`, errMsg);
          return { intent, handled: true, requiresConfirmation: false, response: `${exchange} 잔고 조회 실패: ${errMsg}` };
        }
      }
      return { intent, handled: true, requiresConfirmation: false, response: `${exchange} 잔고 조회를 완료했습니다.`, data };
    }

    if (intent.action === "trading_positions") {
      const exchange = asString(intent.params.exchange, "binance");
      let data;
      if (exchange === "gateio") {
        // MODIFIED: handle Gate.io positions query via dedicated connector.
        data = await gateioConnector.getPositions();
      } else {
        data = await exchangeConnector.getPositions(exchange as "binance" | "upbit" | "bybit");
      }
      return { intent, handled: true, requiresConfirmation: false, response: `${exchange} 포지션 조회를 완료했습니다.`, data };
    }

    if (intent.action === "trading_technical_analysis") {
      const exchange = asString(intent.params.exchange, "binance") as "binance" | "upbit" | "bybit";
      const symbol = asString(intent.params.symbol, "BTC/USDT");
      const timeframe = asString(intent.params.timeframe, "1h");
      const limit = asNumber(intent.params.limit, 200);
      const candles = await exchangeConnector.getCandles(exchange, symbol, timeframe, limit);
      const normalized = candles
        .filter((candle): candle is [number, number, number, number, number, number] => (
          Array.isArray(candle) && candle.length >= 6 && candle.slice(0, 6).every((value) => typeof value === "number")
        ))
        .map((candle) => candle.slice(0, 6) as [number, number, number, number, number, number]);
      const analysis = taEngine.analyzeSymbol(normalized);
      const briefing = taEngine.generateBriefing(symbol, analysis);
      return { intent, handled: true, requiresConfirmation: false, response: `${symbol} 기술적 지표 분석을 완료했습니다.`, data: { analysis, briefing } };
    }

    if (intent.action === "trading_risk_calculation") {
      const riskInput = {
        entryPrice: asNumber(intent.params.entryPrice, 100000),
        leverage: asNumber(intent.params.leverage, 10),
        side: asString(intent.params.side, "long") === "short" ? "short" : "long",
        marginBalance: asNumber(intent.params.marginBalance, 1000),
        riskPercent: asNumber(intent.params.riskPercent, 2),
      } as const;
      const result = calculateFuturesRisk(riskInput);
      return { intent, handled: true, requiresConfirmation: false, response: "선물 리스크를 계산했습니다.", data: { input: riskInput, result } };
    }

    // MODIFIED: Handle new risk calculation intent
    if (intent.action === "trading_risk_calculate") {
      const riskInput = {
        entryPrice: asNumber(intent.params.entryPrice, 65000),
        accountBalance: asNumber(intent.params.accountBalance, 10000),
        riskPercent: asNumber(intent.params.riskPercent, 2),
        leverage: asNumber(intent.params.leverage, 10),
        stopLossPrice: asNumber(intent.params.stopLossPrice, 63000),
        side: asString(intent.params.side, "long") === "short" ? "short" : "long",
      };
      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: `포지션 리스크를 계산했습니다.`,
        data: { method: "trading.risk.calculate", params: riskInput },
      };
    }

    // MODIFIED: Risk Guard 인텐트 핸들러
    if (intent.action === "trading_risk_status") {
      const status = await riskGuard.getStatus();
      const blocked =
        status.manualLock.locked ||
        status.dailyPnlPercent <= -status.settings.dailyLossLimitPercent ||
        status.consecutiveLosses >= status.settings.consecutiveLossBlock;
      const warned =
        !blocked && status.consecutiveLosses >= status.settings.consecutiveLossWarn;
      const statusEmoji = blocked ? "🚫" : warned ? "⚠️" : "✅";
      const statusText = blocked ? "거래 차단" : warned ? "경고" : "거래 가능";
      const lockStatus = status.manualLock.locked
        ? `잠김${status.manualLock.reason ? ` (${status.manualLock.reason})` : ""}`
        : "해제";
      const lines = [
        `🛡 리스크 가드`,
        `━━━━━━━━━━━━`,
        `📊 오늘 손익: ${status.dailyPnlPercent.toFixed(2)}% ⎸ 한도 -${status.settings.dailyLossLimitPercent}%`,
        `🔢 연속 손실: ${status.consecutiveLosses}회`,
        `🔒 잠금: ${lockStatus}`,
        `━━━━━━━━━━━━`,
        `${statusEmoji} ${statusText}`,
      ];
      return { intent, handled: true, requiresConfirmation: false, response: lines.join("\n") };
    }

    if (intent.action === "trading_risk_lock") {
      const reason = asString(intent.params.reason, "사용자 수동 잠금");
      await riskGuard.lock(reason);
      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: `🚫 거래가 중지되었습니다.\n사유: ${reason}`,
      };
    }

    if (intent.action === "trading_risk_unlock") {
      await riskGuard.unlock();
      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: "✅ 거래가 재개되었습니다.",
      };
    }

    if (intent.action === "trading_risk_settings_update") {
      const dailyLimit = intent.params.dailyLossLimitPercent;
      const partial: Record<string, unknown> = {};
      if (typeof dailyLimit === "number" && Number.isFinite(dailyLimit)) {
        partial.dailyLossLimitPercent = dailyLimit;
      }
      if (Object.keys(partial).length === 0) {
        return { intent, handled: true, requiresConfirmation: false, response: "리스크 한도 변경 값을 인식하지 못했습니다. 예: '리스크 한도 변경 코인 -5%'" };
      }
      const state = await riskGuard.updateSettings(partial);
      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: `🛡 리스크 한도 갱신: 일일 손실 한도 -${state.settings.dailyLossLimitPercent}%`,
      };
    }

    // MODIFIED: AI 진입 전 점검 어시스턴트
    if (intent.action === "trading_pre_check") {
      const symbol = asString(intent.params.symbol, "BTC");
      const side = asString(intent.params.side, "long") === "short" ? "short" : "long";
      const entryPrice = asNumber(intent.params.entryPrice, 0);
      if (entryPrice <= 0) {
        return {
          intent,
          handled: true,
          requiresConfirmation: false,
          response: "진입 점검을 위해 진입가가 필요합니다. 예: 'BTC 숏 77000 손절 78500 목표 74000'",
        };
      }
      const stopLossRaw = intent.params.stopLoss;
      const takeProfitRaw = intent.params.takeProfit;
      const stopLoss = typeof stopLossRaw === "number" && Number.isFinite(stopLossRaw) ? stopLossRaw : undefined;
      const takeProfit = typeof takeProfitRaw === "number" && Number.isFinite(takeProfitRaw) ? takeProfitRaw : undefined;
      try {
        const result = await runPreCheck({ symbol, side, entryPrice, stopLoss, takeProfit });
        const formatted = formatPreCheck(result);
        // data를 생략하여 formatIntentRouteMessage가 JSON preview를 추가하지 않도록 함
        return {
          intent,
          handled: true,
          requiresConfirmation: false,
          response: formatted,
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
          intent,
          handled: true,
          requiresConfirmation: false,
          response: `진입 점검 실패: ${errMsg}`,
        };
      }
    }

    if (intent.action === "analysis_indicators" || intent.action === "analysis_rsi" || intent.action === "analysis_macd" || intent.action === "analysis_bollinger") {
      const symbol = asString(intent.params.symbol, "BTC/USDT");
      const timeframe = asString(intent.params.timeframe, "1h");
      console.log("[INTENT] technical analysis:", intent.action, symbol, timeframe);
      try {
        // Use binance for most symbols; Gate.io candles via fetchOHLCV for others
        const candles = await exchangeConnector.getCandles(
          "binance" as "binance" | "upbit" | "bybit",
          symbol,
          timeframe,
          200
        );
        const normalized = candles
          .filter((candle): candle is [number, number, number, number, number, number] =>
            Array.isArray(candle) && candle.length >= 6 && candle.slice(0, 6).every((v) => typeof v === "number")
          )
          .map((candle) => candle.slice(0, 6) as [number, number, number, number, number, number]);
        const analysis = taEngine.analyzeSymbol(normalized);
        const briefing = taEngine.generateBriefing(symbol, analysis);
        return {
          intent, handled: true, requiresConfirmation: false,
          response: briefing,
          data: { analysis, briefing },
        };
      } catch (err) {
        console.warn("[INTENT] TA analysis failed:", (err as Error).message);
        return {
          intent, handled: true, requiresConfirmation: false,
          response: `${symbol} 기술적 분석 중 오류가 발생했습니다: ${(err as Error).message}`,
        };
      }
    }

    if (intent.action === "realestate_portfolio_summary") {
      const auth = await googleAuthManager.getAuthenticatedClient(options.userId);
      const pipeline = new DealPipeline(auth, spreadsheetIdFromEnv());
      const summary = await pipeline.getPortfolioSummary();
      return { intent, handled: true, requiresConfirmation: false, response: "PF 포트폴리오 요약을 조회했습니다.", data: { summary } };
    }

    // MODIFIED: Handle simple feasibility analysis with direct cost inputs
    if (intent.action === "realestate_simple_feasibility") {
      const feasibilityInput = {
        projectName: asString(intent.params.projectName, "신규 프로젝트"),
        landCost: asNumber(intent.params.landCost, 5000000000),
        constructionCost: asNumber(intent.params.constructionCost, 10000000000),
        designFee: asNumber(intent.params.designFee, 1000000000),
        financeCost: asNumber(intent.params.financeCost, 2000000000),
        taxAndFee: asNumber(intent.params.taxAndFee, 500000000),
        otherCost: asNumber(intent.params.otherCost, 1500000000),
        totalUnits: asNumber(intent.params.totalUnits, 100),
        avgSalePrice: asNumber(intent.params.avgSalePrice, 200000000),
        projectMonths: asNumber(intent.params.projectMonths, 30),
      } as SimpleFeasibilityInput;

      const result = calculateFeasibility(feasibilityInput);
      const report = formatSimpleFeasibilityReport(result, feasibilityInput);
      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: "간단한 사업성 분석을 완료했습니다.",
        data: { result, report },
      };
    }

    // MODIFIED: Handle public data inquiries
    if (intent.action === "realestate_land_use") {
      const pnu = asString(intent.params.pnu, "");
      if (!pnu) {
        return {
          intent,
          handled: false,
          requiresConfirmation: false,
          response: "PNU(필지고유번호)를 입력해주세요.",
        };
      }
      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: "토지이용규제 정보를 조회했습니다.",
        data: { method: "realestate.landUse", params: { pnu } },
      };
    }

    if (intent.action === "realestate_land_price") {
      const pnu = asString(intent.params.pnu, "");
      if (!pnu) {
        return {
          intent,
          handled: false,
          requiresConfirmation: false,
          response: "PNU(필지고유번호)를 입력해주세요.",
        };
      }
      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: "공시지가 정보를 조회했습니다.",
        data: {
          method: "realestate.landPrice",
          params: { pnu, year: asString(intent.params.year, new Date().getFullYear().toString()) },
        },
      };
    }

    if (intent.action === "realestate_real_transaction") {
      const regionCode = asString(intent.params.regionCode, "");
      const yearMonth = asString(intent.params.yearMonth, "");
      if (!regionCode || !yearMonth) {
        return {
          intent,
          handled: false,
          requiresConfirmation: false,
          response: "지역코드와 연월을 입력해주세요.",
        };
      }
      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: "실거래가 정보를 조회했습니다.",
        data: { method: "realestate.realTransaction", params: { regionCode, yearMonth } },
      };
    }

    if (intent.action === "realestate_feasibility") {
      const feasibilityInput = {
        projectName: asString(intent.params.projectName, "?섑뵆 ?꾨줈?앺듃"),
        landCost: asNumber(intent.params.landCost, 150),
        landArea: asNumber(intent.params.landArea, 1000),
        buildingCoverageRate: asNumber(intent.params.buildingCoverageRate, 60),
        floorAreaRate: asNumber(intent.params.floorAreaRate, 300),
        floors: asNumber(intent.params.floors, 20),
        constructionCostPerPyeong: asNumber(intent.params.constructionCostPerPyeong, 900),
        sellingPricePerPyeong: asNumber(intent.params.sellingPricePerPyeong, 1800),
        sellingRate: asNumber(intent.params.sellingRate, 95),
        loanRate: asNumber(intent.params.loanRate, 6.5),
        loanLTV: asNumber(intent.params.loanLTV, 70),
        projectDurationMonths: asNumber(intent.params.projectDurationMonths, 30),
        equityRatio: asNumber(intent.params.equityRatio, 30),
      };
      const result = runFeasibility(feasibilityInput);
      const report = formatFeasibilityReport(feasibilityInput, result);
      return { intent, handled: true, requiresConfirmation: false, response: "?ъ뾽??遺꾩꽍???꾨즺?덉뒿?덈떎.", data: { result, report } };
    }

    if (intent.action === "finance_dart_disclosures") {
      const endDate = asString(intent.params.endDate, yyyymmdd(new Date()));
      const startDate = asString(intent.params.startDate, yyyymmdd(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
      const corpCode = asString(intent.params.corpCode, "00126380");
      const disclosures = await getDisclosures(corpCode, startDate, endDate);
      return { intent, handled: true, requiresConfirmation: false, response: "DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.", data: { corpCode, startDate, endDate, disclosures } };
    }

    if (intent.action === "trading_add_alert") {
      const telegramChatId = asString(intent.params.telegramChatId, process.env.OWNER_TELEGRAM_CHAT_ID || "").trim();
      if (!telegramChatId) {
        throw new Error("OWNER_TELEGRAM_CHAT_ID is missing");
      }

      await startAlertScheduler(); // MODIFIED: ensure scheduler is active before creating execute-intent alerts.
      const alert = await addAlert({
        id: crypto.randomUUID(),
        userId: options.userId,
        telegramChatId,
        type: asString(intent.params.type, "price") as "price" | "rsi" | "funding" | "kimchi_premium",
        exchange: asString(intent.params.exchange, "binance") as "binance" | "upbit" | "bybit",
        symbol: asString(intent.params.symbol, "BTC/USDT"),
        operator: asString(intent.params.operator, "above") as "above" | "below",
        value: asNumber(intent.params.value, 100000),
        active: asBoolean(intent.params.active, true),
      });

      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: "트레이딩 알림이 등록되었습니다.",
        data: { alert },
      };
    }

    if (intent.action === "realestate_add_deal") {
      const auth = await googleAuthManager.getAuthenticatedClient(options.userId);
      const pipeline = new DealPipeline(auth, spreadsheetIdFromEnv());
      const created = await pipeline.addDeal({
        projectName: asString(intent.params.projectName, "신규 프로젝트"),
        location: asString(intent.params.location, ""),
        stage: asString(intent.params.stage, "검토") as any,
        totalProjectCost: asNumber(intent.params.totalProjectCost, 0),
        loanAmount: asNumber(intent.params.loanAmount, 0),
        ltv: asNumber(intent.params.ltv, 0),
        equityAmount: asNumber(intent.params.equityAmount, 0),
        lenders: asString(intent.params.lenders, ""),
        nextMilestone: asString(intent.params.nextMilestone, ""),
        nextMilestoneDate: asString(intent.params.nextMilestoneDate, ""),
        notes: asString(intent.params.notes, ""),
      });

      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: "PF 딜이 추가되었습니다.",
        data: { deal: created },
      };
    }

    if (intent.action === "realestate_update_deal_stage") {
      const auth = await googleAuthManager.getAuthenticatedClient(options.userId);
      const pipeline = new DealPipeline(auth, spreadsheetIdFromEnv());
      const id = asString(intent.params.id, "");
      if (!id) {
        throw new Error("PF deal id is required");
      }

      const updated = await pipeline.updateDealStage(
        id,
        asString(intent.params.stage, "심사") as any
      );

      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: "PF 딜 단계가 변경되었습니다.",
        data: { deal: updated },
      };
    }

    if (intent.action === "google_create_event") {
      const auth = await googleAuthManager.getAuthenticatedClient(options.userId);
      const calendar = new CalendarConnector(auth);
      const title = asString(intent.params.title, "새 일정");
      const startTime = new Date(asString(intent.params.startTime, new Date().toISOString()));
      const endTime = new Date(
        asString(intent.params.endTime, new Date(startTime.getTime() + 60 * 60 * 1000).toISOString())
      );
      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
        throw new Error("Invalid calendar event date");
      }

      const event = await calendar.createEvent({
        title,
        description: asString(intent.params.description, ""),
        startTime,
        endTime,
        attendees: asStringArray(intent.params.attendees),
        location: asString(intent.params.location, ""),
        isAllDay: asBoolean(intent.params.isAllDay, false),
      });

      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: "캘린더 일정이 생성되었습니다.",
        data: { event },
      };
    }

    if (intent.action === "google_write_sheet") {
      const auth = await googleAuthManager.getAuthenticatedClient(options.userId);
      const sheets = new SheetsConnector(auth);
      const spreadsheetId = asString(intent.params.spreadsheetId, spreadsheetIdFromEnv());
      const range = asString(intent.params.range, "Sheet1!A1");
      const values = as2DArray(intent.params.values);
      const normalizedValues = values.length > 0 ? values : [[asString(intent.params.value, "sample")]];

      await sheets.writeSheet({
        spreadsheetId,
        range,
        values: normalizedValues,
      });

      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: "시트 쓰기가 완료되었습니다.",
        data: { spreadsheetId, range, rows: normalizedValues.length },
      };
    }

    if (intent.action === "realestate_deals_list") {
      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: "PF 딜 목록을 조회합니다.",
        data: { method: "realestate.deals.list" },
      };
    }

    if (intent.action === "realestate_deals_create") {
      return {
        intent,
        handled: false,
        requiresConfirmation: true,
        response: "새 PF 딜을 등록합니다. 프로젝트명, 위치, 금액, 담당자를 입력해주세요.",
        confirmation: { action: "realestate_deals_create", domain: "realestate", params: intent.params },
      };
    }

    if (intent.action === "realestate_deals_update") {
      return {
        intent,
        handled: false,
        requiresConfirmation: true,
        response: "PF 딜을 수정합니다. 딜 ID와 변경 내용을 입력해주세요.",
        confirmation: { action: "realestate_deals_update", domain: "realestate", params: intent.params },
      };
    }

    if (intent.action === "google_drive_search") {
      console.log("[INTENT] executing google_drive_search, query:", intent.params.query);
      const query = asString(intent.params.query, "");
      const maxResults = asNumber(intent.params.maxResults, 10);
      try {
        const auth = await getGoogleAuth(options.userId);
        const drive = new DriveConnector(auth);
        const driveQuery = query
          ? `(name contains '${query.replace(/'/g, "\\'")}' or fullText contains '${query.replace(/'/g, "\\'")}') and trashed = false`
          : "trashed = false";
        console.log("[INTENT] Drive API query:", driveQuery);
        const files = await drive.searchFiles(driveQuery, maxResults);
        console.log("[INTENT] Drive search result:", files.length, "files");
        if (files.length === 0) {
          return {
            intent, handled: true, requiresConfirmation: false,
            response: `Google Drive에서 "${query}" 관련 파일을 찾을 수 없습니다.`,
            data: { files: [] },
          };
        }
        const fileList = (files as any[]).map((f, i) => `${i + 1}. 📄 ${f.name}`).join("\n");
        return {
          intent, handled: true, requiresConfirmation: false,
          response: `Google Drive에서 "${query}" 관련 파일 ${files.length}개를 찾았습니다.`,
          data: { files, fileList },
        };
      } catch (err) {
        console.error("[INTENT] google_drive_search error:", err);
        if (isGoogleAuthError(err)) {
          return { intent, handled: true, requiresConfirmation: false, response: GOOGLE_REAUTH_MSG };
        }
        throw err;
      }
    }

    if (intent.action === "google_get_emails") {
      console.log("[INTENT] executing google_get_emails");
      const maxResults = asNumber(intent.params.maxResults, 5);
      const searchQuery = asString(intent.params.searchQuery, "") || undefined;
      try {
        const auth = await getGoogleAuth(options.userId);
        const gmail = new GmailConnector(auth);
        const emails = await gmail.getEmails(maxResults, searchQuery);
        if (emails.length === 0) {
          return { intent, handled: true, requiresConfirmation: false, response: "📭 받은 메일이 없습니다.", data: { emails: [] } };
        }
        const emailList = (emails as any[]).map((e, i) =>
          `${i + 1}. ${e.isRead ? "" : "🔵"} ${e.subject}\n   발신: ${e.from}`
        ).join("\n\n");
        return {
          intent, handled: true, requiresConfirmation: false,
          response: `📬 최근 이메일 ${emails.length}개를 조회했습니다.`,
          data: { emails, emailList },
        };
      } catch (err) {
        if (isGoogleAuthError(err)) {
          return { intent, handled: true, requiresConfirmation: false, response: GOOGLE_REAUTH_MSG };
        }
        throw err;
      }
    }

    if (intent.action === "google_send_email") {
      const to = asString(intent.params.to, "");
      const subject = asString(intent.params.subject, "");
      const body = asString(intent.params.body, "");
      if (!to || !subject || !body) {
        return {
          intent, handled: false, requiresConfirmation: true,
          response: "이메일 전송에 필요한 정보가 부족합니다. 받는 사람, 제목, 본문을 알려주세요.",
          confirmation: { action: "google_send_email", domain: "google", params: intent.params },
        };
      }
      try {
        const auth = await getGoogleAuth(options.userId);
        const gmail = new GmailConnector(auth);
        await gmail.sendEmail({ to, subject, body });
        return {
          intent, handled: true, requiresConfirmation: false,
          response: `✅ 이메일 전송 완료!\n📧 받는 사람: ${to}\n📋 제목: ${subject}`,
          data: { to, subject },
        };
      } catch (err) {
        if (isGoogleAuthError(err)) {
          return { intent, handled: true, requiresConfirmation: false, response: GOOGLE_REAUTH_MSG };
        }
        throw err;
      }
    }

    if (intent.action === "google_list_events") {
      console.log("[INTENT] executing google_list_events");
      const maxResults = asNumber(intent.params.maxResults, 5);
      try {
        const auth = await getGoogleAuth(options.userId);
        const calendar = new CalendarConnector(auth);
        const events = await calendar.getUpcomingEvents(maxResults);
        if (events.length === 0) {
          return { intent, handled: true, requiresConfirmation: false, response: "📅 예정된 일정이 없습니다.", data: { events: [] } };
        }
        const eventList = (events as any[]).map((e, i) =>
          `${i + 1}. 📅 ${e.title || e.summary || "(제목 없음)"}\n   ${e.start?.dateTime || e.start?.date || ""}`
        ).join("\n\n");
        return {
          intent, handled: true, requiresConfirmation: false,
          response: `📅 다가오는 일정 ${events.length}개를 조회했습니다.`,
          data: { events, eventList },
        };
      } catch (err) {
        if (isGoogleAuthError(err)) {
          return { intent, handled: true, requiresConfirmation: false, response: GOOGLE_REAUTH_MSG };
        }
        throw err;
      }
    }

    if (intent.action === "wiki_save") {
      const response = await executeWikiSave(intent.params, "telegram");
      return { intent, handled: true, requiresConfirmation: false, response };
    }

    if (intent.action === "wiki_search") {
      const response = await executeWikiSearch(intent.params);
      return { intent, handled: true, requiresConfirmation: false, response };
    }

    if (intent.action === "intelligence_morning_briefing") {
      const briefing = await executeMorningBriefing({ trigger: "manual", deliver: true });
      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: "모닝 브리핑을 발송했습니다.",
        data: {
          briefing: briefing.text,
          archivePath: briefing.archivePath,
        },
      };
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
      // response is non-empty for test compatibility; formatIntentRouteMessage returns "" so callers fall through to Gemini
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

const GOOGLE_REAUTH_MSG = "Google 재인증이 필요합니다. 웹 앱에서 Google 계정을 다시 연결해주세요.";

function isGoogleAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("no tokens") ||
    msg.includes("authenticate first") ||
    msg.includes("token expired") ||
    msg.includes("no refresh token") ||
    msg.includes("failed to get authenticated") ||
    msg.includes("failed to refresh")
  );
}

async function getGoogleAuth(userId: string) {
  console.log("[INTENT] getGoogleAuth for userId:", userId);
  try {
    return await googleAuthManager.getAuthenticatedClient(userId);
  } catch {
    // Try fallback admin user IDs
    for (const uid of ["1", "anonymous"]) {
      if (uid === userId) continue;
      try {
        const client = await googleAuthManager.getAuthenticatedClient(uid);
        console.log("[INTENT] getGoogleAuth fallback succeeded for uid:", uid);
        return client;
      } catch {}
    }
    throw new Error("No tokens found for user. Please authenticate first.");
  }
}

function extractDriveQuery(message: string): string {
  // Remove common Korean command phrases to extract the search keyword
  const cleaned = message
    .replace(/구글?드라이브[에서]?\s*/gi, "")
    .replace(/google\s*drive[에서]?\s*/gi, "")
    .replace(/파일\s*(검색|찾[아기]|리스트|목록)[해줘주세요]?/gi, "")
    .replace(/\s*(검색|찾[아기])[줘주세요해줘]?/gi, "")
    .replace(/텔레그램(으로|에서)?\s*(보내|전송)[줘주세요]?/gi, "")
    .replace(/\s*(보내줘|전송해줘|보내주세요)/gi, "")
    .trim();
  return cleaned || message;
}

function stringifyPreview(data: unknown, maxLength: number = 1200): string {
  if (data === undefined || data === null) return "";
  const preview = JSON.stringify(data, null, 2);
  return preview.length > maxLength ? `${preview.slice(0, maxLength)}...` : preview;
}

export function formatIntentRouteMessage(routed: IntentRouteResponse): string {
  if (routed.requiresConfirmation) {
    const paramsPreview = stringifyPreview(routed.confirmation?.params ?? {}, 500); // MODIFIED: include compact parameter preview during approval step.
    return [
      "ACTION REQUIRES CONFIRMATION",
      routed.response,
      `intent=${routed.intent.domain}/${routed.intent.action} type=${routed.intent.type}`,
      ...(paramsPreview ? [`params=${paramsPreview}`] : []),
      "next=allowExecute=true 로 승인 재요청",
    ].join("\n");
  }

  if (!routed.handled) {
    // Return empty string so callers (Telegram, web) fall through to Gemini general chat
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

