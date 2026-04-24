import { exchangeConnector } from "../exchanges/exchangeConnector.ts";
import { taEngine } from "../trading/technicalAnalysis.ts";
import { calculateFuturesRisk } from "../trading/riskCalculator.ts";
import { DealPipeline } from "../realestate/dealPipeline.ts";
import { formatFeasibilityReport, runFeasibility } from "../realestate/feasibilityEngine.ts";
import { getDisclosures } from "../finance/dartAPI.ts";
import { googleAuthManager } from "../routers/google-workspace.ts";
import { llmAdapter } from "../_core/llmAdapter.ts";
import { addAlert, startAlertScheduler } from "../alerts/alertEngine.ts"; // MODIFIED: execute-intent path can now register trading alerts.
import CalendarConnector from "../google/calendar.ts"; // MODIFIED: execute-intent path can create calendar events after confirmation.
import SheetsConnector from "../google/sheets.ts"; // MODIFIED: execute-intent path can write to Google Sheets after confirmation.

export type IntentDomain = "trading" | "realestate" | "finance" | "google" | "chat";
export type IntentType = "query" | "execute";
export type IntentAction =
  | "trading_balance"
  | "trading_positions"
  | "trading_technical_analysis"
  | "trading_risk_calculation"
  | "trading_add_alert" // MODIFIED: execute action for alert creation with confirmation gate.
  | "realestate_portfolio_summary"
  | "realestate_feasibility"
  | "realestate_add_deal" // MODIFIED: execute action for PF deal creation.
  | "realestate_update_deal_stage" // MODIFIED: execute action for PF stage transition.
  | "finance_dart_disclosures"
  | "google_create_event" // MODIFIED: execute action for calendar event creation.
  | "google_write_sheet" // MODIFIED: execute action for sheet write.
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

  if (lower.includes("잔고") || lower.includes("balance")) { // MODIFIED: repair broken string literals and keep deterministic balance fallback.
    return {
      domain: "trading",
      action: "trading_balance",
      type: "query",
      confidence: 0.55,
      params: { exchange: lower.includes("upbit") ? "upbit" : "binance" },
    };
  }

  if (lower.includes("포지션") || lower.includes("position") || lower.includes("positions")) { // MODIFIED: normalize position keywords.
    return {
      domain: "trading",
      action: "trading_positions",
      type: "query",
      confidence: 0.55,
      params: { exchange: lower.includes("bybit") ? "bybit" : "binance" },
    };
  }

  if (lower.includes("기술") || lower.includes("ta") || lower.includes("rsi") || lower.includes("macd")) { // MODIFIED: normalize TA keywords.
    return {
      domain: "trading",
      action: "trading_technical_analysis",
      type: "query",
      confidence: 0.5,
      params: { exchange: "binance", symbol: "BTC/USDT", timeframe: "1h", limit: 200 },
    };
  }

  if (lower.includes("리스크") || lower.includes("레버리지") || lower.includes("청산가") || lower.includes("risk")) { // MODIFIED: normalize risk-calculation keywords.
    return {
      domain: "trading",
      action: "trading_risk_calculation",
      type: "query",
      confidence: 0.5,
      params: { entryPrice: 100000, leverage: 10, side: "long", marginBalance: 1000, riskPercent: 2 },
    };
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

  if (lower.includes("사업성") || lower.includes("feasibility")) { // MODIFIED: normalize feasibility keywords.
    return {
      domain: "realestate",
      action: "realestate_feasibility",
      type: "query",
      confidence: 0.5,
      params: {
        projectName: "샘플 프로젝트", // MODIFIED: replace garbled fallback project name with readable UTF-8 Korean.
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

  if (lower.includes("dart") || lower.includes("공시")) { // MODIFIED: normalize DART disclosure keywords.
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

export async function classifyIntent(message: string): Promise<IntentResult> {
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const prompt = `?ъ슜??硫붿떆吏瑜?遺꾩꽍??JSON留?諛섑솚?섏꽭??

?꾩옱 ?쒓컖: ${now}
?꾨찓?? trading, realestate, finance, google, chat
??? query ?먮뒗 execute
?≪뀡:
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
- google_create_event
- google_write_sheet
- execute_placeholder
- chat

?꾩닔 JSON ?ㅽ궎留?
{"domain":"...","action":"...","type":"query|execute","confidence":0.0,"params":{}}

洹쒖튃:
- 議고쉶???붿껌? type=query
- 蹂寃쎌꽦 ?붿껌(異붽?/?섏젙/??젣/?앹꽦)? type=execute
- ?뚮씪誘명꽣瑜?理쒕???異붿텧
- JSON ???띿뒪??湲덉?`;

  try {
    const parsed = await llmAdapter.parseJson<Partial<IntentResult>>(message, prompt);
    if (!parsed.domain || !parsed.action || !parsed.type) return fallbackIntent(message);

    return {
      domain: parsed.domain,
      action: parsed.action,
      type: parsed.type,
      confidence: Number.isFinite(parsed.confidence) ? Number(parsed.confidence) : 0,
      params: parsed.params && typeof parsed.params === "object" ? parsed.params : {},
    } as IntentResult;
  } catch {
    return fallbackIntent(message);
  }
}

export async function routeIntentMessage(options: RouteIntentOptions): Promise<IntentRouteResponse> {
  const intent = await classifyIntent(options.message);
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
      const exchange = asString(intent.params.exchange, "binance") as "binance" | "upbit" | "bybit";
      const data = await exchangeConnector.getBalance(exchange);
      return { intent, handled: true, requiresConfirmation: false, response: `${exchange} ?붽퀬 議고쉶瑜??꾨즺?덉뒿?덈떎.`, data };
    }

    if (intent.action === "trading_positions") {
      const exchange = asString(intent.params.exchange, "binance") as "binance" | "upbit" | "bybit";
      const data = await exchangeConnector.getPositions(exchange);
      return { intent, handled: true, requiresConfirmation: false, response: `${exchange} ?ъ???議고쉶瑜??꾨즺?덉뒿?덈떎.`, data };
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
      return { intent, handled: true, requiresConfirmation: false, response: `${symbol} 湲곗닠??遺꾩꽍???꾨즺?덉뒿?덈떎.`, data: { analysis, briefing } };
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
      return { intent, handled: true, requiresConfirmation: false, response: "?좊Ъ 由ъ뒪??怨꾩궛???꾨즺?덉뒿?덈떎.", data: { input: riskInput, result } };
    }

    if (intent.action === "realestate_portfolio_summary") {
      const auth = await googleAuthManager.getAuthenticatedClient(options.userId);
      const pipeline = new DealPipeline(auth, spreadsheetIdFromEnv());
      const summary = await pipeline.getPortfolioSummary();
      return { intent, handled: true, requiresConfirmation: false, response: "PF ?ы듃?대━???붿빟??議고쉶?덉뒿?덈떎.", data: { summary } };
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

    if (intent.action === "execute_placeholder") {
      return {
        intent,
        handled: false,
        requiresConfirmation: false,
        response: "실행 액션 라우팅은 현재 단계적으로 연결 중입니다. 다음 배치에서 실제 실행 경로를 연결합니다.",
      };
    }

    return {
      intent,
      handled: false,
      requiresConfirmation: false,
      response: "議고쉶 ?쇱슦????곸씠 ?꾨땲?댁꽌 ?쇰컲 ???寃쎈줈濡?泥섎━?댁빞 ?⑸땲??",
    };
  } catch (error) {
    return {
      intent,
      handled: false,
      requiresConfirmation: false,
      response: `?섎룄 ?쇱슦???ㅽ뻾 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function stringifyPreview(data: unknown, maxLength: number = 1200): string {
  if (data === undefined || data === null) return ""; // MODIFIED: keep formatter output stable when routed payload is empty.
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
    return [
      "REQUEST NOT HANDLED",
      routed.response,
      `intent=${routed.intent.domain}/${routed.intent.action} confidence=${routed.intent.confidence.toFixed(2)}`,
    ].join("\n");
  }

  const data = routed.data as any;
  const primaryBody =
    typeof data?.briefing === "string" ? data.briefing
      : typeof data?.report === "string" ? data.report
        : typeof data?.summary === "string" ? data.summary
          : "";
  const fallbackBody = primaryBody || stringifyPreview(data);

  return [
    `OK ${routed.response}`,
    `intent=${routed.intent.domain}/${routed.intent.action} confidence=${routed.intent.confidence.toFixed(2)}`,
    ...(fallbackBody ? [fallbackBody] : []),
  ].join("\n\n"); // MODIFIED: unify web/telegram intent response format in one shared formatter.
}

