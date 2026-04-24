import { randomUUID } from "crypto";

import type { TrpcContext } from "./context.ts";
import { addAlert } from "../alerts/alertEngine.ts";
import { exchangeConnector } from "../exchanges/exchangeConnector.ts";
import {
  getCompanyInfo,
  getDisclosures,
  getFinancialStatements,
  searchCompanyByName,
} from "../finance/dartAPI.ts";
import { googleAuthManager } from "../routers/google-workspace.ts";
import { getOrCreateConversation } from "../db-chat.ts";
import { DealPipeline, type DealStage, type NewPFDeal } from "../realestate/dealPipeline.ts";
import { runFeasibility, formatFeasibilityReport, type FeasibilityInput } from "../realestate/feasibilityEngine.ts";
import { getLandRegulation } from "../realestate/publicDataAPI.ts";
import { LLMCaller } from "../llm/caller.ts";
import { calculateFuturesRisk, formatRiskReport, type FuturesRiskInput } from "../trading/riskCalculator.ts";
import { taEngine, type OhlcvArray } from "../trading/technicalAnalysis.ts";
import { TradeJournal, type TradeStatsPeriod } from "../trading/tradeJournal.ts";
import type { SupportedExchangeId } from "../exchanges/exchangeConnector.ts";

export type IntentName =
  | "trading.getBalance"
  | "trading.getPositions"
  | "trading.analyze"
  | "trading.calculateRisk"
  | "trading.setAlert"
  | "trading.syncJournal"
  | "trading.getStats"
  | "realestate.feasibility"
  | "realestate.landCheck"
  | "realestate.dealList"
  | "realestate.addDeal"
  | "realestate.portfolioSummary"
  | "finance.searchCompanyByName"
  | "finance.getCompanyInfo"
  | "finance.getDisclosures"
  | "finance.getFinancialStatements"
  | "finance.dart"
  | "general.chat";

export type ParsedIntent = {
  intent: IntentName;
  params: Record<string, unknown>;
  clarification: string | null;
};

const INTENT_SYSTEM_PROMPT = `너는 사용자의 자연어 명령을 분석해서 실행할 기능을 JSON으로 반환한다.

가능한 기능:
- trading.getBalance: { exchange }
- trading.getPositions: { exchange }
- trading.analyze: { exchange, symbol, timeframe }
- trading.calculateRisk: { entryPrice, leverage, side, marginBalance, riskPercent }
- trading.setAlert: { type, exchange, symbol, operator, value }
- trading.syncJournal: { exchange }
- trading.getStats: { period }
- realestate.feasibility: { projectName, landCost, landArea, buildingCoverageRate, floorAreaRate, floors, constructionCostPerPyeong, sellingPricePerPyeong, sellingRate, loanRate, loanLTV, projectDurationMonths, equityRatio }
- realestate.landCheck: { pnu }
- realestate.dealList: {}
- realestate.addDeal: { projectName, location, stage, totalProjectCost, loanAmount, ltv, equityAmount, lenders, nextMilestone, nextMilestoneDate }
- realestate.portfolioSummary: {}
- finance.searchCompanyByName: { name }
- finance.getCompanyInfo: { corpCode }
- finance.getDisclosures: { corpCode, startDate, endDate }
- finance.getFinancialStatements: { corpCode, year, reportCode }
- finance.dart: { corpCode, startDate, endDate }
- general.chat: { message }

규칙:
- 회사 검색, 공시 조회, 재무제표 조회 문장은 finance.searchCompanyByName, finance.getDisclosures, finance.getFinancialStatements, finance.getCompanyInfo 중 가장 적절한 것으로 분기한다.
- 파라미터가 부족하면 clarification에 필요한 질문을 담아 반환한다.
- 반드시 JSON만 응답한다: { intent: string, params: object, clarification: string|null }`;

const intentCaller = new LLMCaller();

export async function parseIntent(userMessage: string): Promise<ParsedIntent> {
  const response = await intentCaller.call(
    "gemini",
    "flash",
    [{ role: "user", content: userMessage }],
    INTENT_SYSTEM_PROMPT,
    {
      responseMimeType: "application/json",
      temperature: 0,
      maxOutputTokens: 1024,
    }
  );

  return normalizeParsedIntent(response.content, userMessage);
}

export async function executeIntent(parsed: ParsedIntent, ctx: TrpcContext): Promise<string> {
  if (parsed.clarification) {
    return parsed.clarification;
  }

  switch (parsed.intent) {
    case "trading.getBalance": {
      assertAuthenticated(ctx);
      const balance = await exchangeConnector.getBalance(requiredExchange(parsed.params.exchange));
      return textResult("거래소 잔고", balance);
    }
    case "trading.getPositions": {
      assertAuthenticated(ctx);
      const positions = await exchangeConnector.getPositions(requiredExchange(parsed.params.exchange));
      return textResult("포지션 목록", positions);
    }
    case "trading.analyze": {
      assertAuthenticated(ctx);
      const exchange = requiredExchange(parsed.params.exchange);
      const symbol = requiredString(parsed.params.symbol, "분석할 심볼을 알려주세요. 예: BTC/USDT");
      const timeframe = optionalString(parsed.params.timeframe) ?? "1m";
      const candles = await exchangeConnector.getCandles(exchange, symbol, timeframe, 250);
      const normalizedCandles = candles
        .filter((candle) => candle.every((value) => typeof value === "number"))
        .map((candle) => candle as OhlcvArray);
      const analysis = taEngine.analyzeSymbol(normalizedCandles);
      return taEngine.generateBriefing(symbol, analysis);
    }
    case "trading.calculateRisk": {
      assertAuthenticated(ctx);
      const input: FuturesRiskInput = {
        entryPrice: requiredNumber(parsed.params.entryPrice, "진입가를 알려주세요."),
        leverage: requiredNumber(parsed.params.leverage, "레버리지를 알려주세요."),
        side: requiredSide(parsed.params.side),
        marginBalance: requiredNumber(parsed.params.marginBalance, "증거금 잔고를 알려주세요."),
        riskPercent: optionalNumber(parsed.params.riskPercent),
      };
      const result = calculateFuturesRisk(input);
      return formatRiskReport(input, result);
    }
    case "trading.setAlert": {
      assertAuthenticated(ctx);
      const conversation = await getOrCreateConversation(ctx.user.id);
      const alert = await addAlert({
        id: randomUUID(),
        userId: String(ctx.user.id),
        telegramChatId: conversation.telegramChatId ?? "",
        type: requiredAlertType(parsed.params.type),
        exchange: requiredExchange(parsed.params.exchange),
        symbol: requiredString(parsed.params.symbol, "알림 심볼을 알려주세요."),
        operator: requiredAlertOperator(parsed.params.operator),
        value: requiredNumber(parsed.params.value, "알림 기준값을 알려주세요."),
        active: true,
      });
      return textResult("알림이 저장되었습니다.", alert);
    }
    case "trading.syncJournal": {
      assertAuthenticated(ctx);
      const exchange = requiredExchange(parsed.params.exchange);
      const symbols = optionalStringArray(parsed.params.symbols);
      if (symbols.length === 0) {
        return "매매일지를 동기화할 심볼을 알려주세요. 예: BTC/USDT, ETH/USDT";
      }
      const journal = await createTradeJournal(ctx.user.id);
      const result = await journal.syncTrades(exchange, symbols);
      return textResult("매매일지 동기화 결과", result);
    }
    case "trading.getStats": {
      assertAuthenticated(ctx);
      const journal = await createTradeJournal(ctx.user.id);
      const period = requiredTradeStatsPeriod(parsed.params.period);
      const stats = await journal.getTradeStats(period);
      return textResult("매매 통계", stats);
    }
    case "realestate.feasibility": {
      assertAuthenticated(ctx);
      const input = requiredFeasibilityInput(parsed.params);
      const result = runFeasibility(input);
      return formatFeasibilityReport(input, result);
    }
    case "realestate.landCheck": {
      assertAuthenticated(ctx);
      const pnu = requiredString(parsed.params.pnu, "토지 PNU 번호를 알려주세요.");
      const result = await getLandRegulation(pnu);
      return textResult("토지 규제 확인 결과", result);
    }
    case "realestate.dealList": {
      assertAuthenticated(ctx);
      const pipeline = await createDealPipeline(ctx.user.id);
      return textResult("PF 딜 목록", await pipeline.getAllDeals());
    }
    case "realestate.addDeal": {
      assertAuthenticated(ctx);
      const pipeline = await createDealPipeline(ctx.user.id);
      const deal = await pipeline.addDeal(requiredNewDeal(parsed.params));
      return textResult("PF 딜을 추가했습니다.", deal);
    }
    case "realestate.portfolioSummary": {
      assertAuthenticated(ctx);
      const pipeline = await createDealPipeline(ctx.user.id);
      return pipeline.getPortfolioSummary();
    }
    case "finance.searchCompanyByName": {
      assertAuthenticated(ctx);
      const name = requiredString(parsed.params.name, "회사명을 알려주세요.");
      return textResult("DART 회사 검색 결과", await searchCompanyByName(name));
    }
    case "finance.getCompanyInfo": {
      assertAuthenticated(ctx);
      const corpCode = requiredString(parsed.params.corpCode, "회사 고유번호 corpCode를 알려주세요.");
      return textResult("DART 회사 정보", await getCompanyInfo(corpCode));
    }
    case "finance.getDisclosures": {
      assertAuthenticated(ctx);
      const corpCode = requiredString(parsed.params.corpCode, "회사 고유번호 corpCode를 알려주세요.");
      const startDate = requiredString(parsed.params.startDate, "공시 시작일을 YYYYMMDD 형식으로 알려주세요.");
      const endDate = requiredString(parsed.params.endDate, "공시 종료일을 YYYYMMDD 형식으로 알려주세요.");
      return textResult("DART 공시 조회 결과", await getDisclosures(corpCode, startDate, endDate));
    }
    case "finance.getFinancialStatements": {
      assertAuthenticated(ctx);
      const corpCode = requiredString(parsed.params.corpCode, "회사 고유번호 corpCode를 알려주세요.");
      const year = requiredString(parsed.params.year, "조회 연도를 알려주세요.");
      const reportCode = optionalString(parsed.params.reportCode) ?? "11011";
      return textResult("DART 재무제표", await getFinancialStatements(corpCode, year, reportCode));
    }
    case "finance.dart": {
      assertAuthenticated(ctx);
      const disclosures = await getDisclosures(
        requiredString(parsed.params.corpCode, "DART 회사 고유번호 corpCode를 알려주세요."),
        requiredString(parsed.params.startDate, "공시 조회 시작일을 YYYYMMDD 형식으로 알려주세요."),
        requiredString(parsed.params.endDate, "공시 조회 종료일을 YYYYMMDD 형식으로 알려주세요.")
      );
      return textResult("DART 공시 조회 결과", disclosures);
    }
    case "general.chat":
      return requiredString(parsed.params.message, "무엇을 도와드릴까요?");
    default:
      return "처리할 수 없는 기능입니다. 일반 문장으로 다시 입력해주세요.";
  }
}

/*
 * llm.chat 연결 예시:
 *
 * import { parseIntent, executeIntent } from "../_core/intentRouter.ts";
 *
 * const parsed = await parseIntent(input.message);
 * if (parsed.intent !== "general.chat" || parsed.clarification) {
 *   const response = await executeIntent(parsed, ctx);
 *   await sessionManager.addMessage(userId, "assistant", response);
 *   return { response, model: "intent-router", engine: "gemini" };
 * }
 */

function normalizeParsedIntent(content: string, originalMessage: string): ParsedIntent {
  try {
    const parsed = JSON.parse(stripJsonFence(content)) as Partial<ParsedIntent>;
    const intent = typeof parsed.intent === "string" ? parsed.intent : "general.chat";
    return {
      intent: isIntentName(intent) ? intent : "general.chat",
      params:
        parsed.params && typeof parsed.params === "object" && !Array.isArray(parsed.params)
          ? (parsed.params as Record<string, unknown>)
          : { message: originalMessage },
      clarification:
        typeof parsed.clarification === "string" && parsed.clarification.trim()
          ? parsed.clarification.trim()
          : null,
    };
  } catch {
    return {
      intent: "general.chat",
      params: { message: originalMessage },
      clarification: null,
    };
  }
}

function stripJsonFence(value: string): string {
  return value.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
}

function isIntentName(value: string): value is IntentName {
  return [
    "trading.getBalance",
    "trading.getPositions",
    "trading.analyze",
    "trading.calculateRisk",
    "trading.setAlert",
    "trading.syncJournal",
    "trading.getStats",
    "realestate.feasibility",
    "realestate.landCheck",
    "realestate.dealList",
    "realestate.addDeal",
    "realestate.portfolioSummary",
    "finance.searchCompanyByName",
    "finance.getCompanyInfo",
    "finance.getDisclosures",
    "finance.getFinancialStatements",
    "finance.dart",
    "general.chat",
  ].includes(value);
}

function assertAuthenticated(ctx: TrpcContext): asserts ctx is TrpcContext & { user: NonNullable<TrpcContext["user"]> } {
  if (!ctx.user) {
    throw new Error("로그인이 필요합니다.");
  }
}

async function createTradeJournal(userId: number): Promise<TradeJournal> {
  const auth = await googleAuthManager.getAuthenticatedClient(String(userId));
  return new TradeJournal(auth, getWorkspaceSpreadsheetId());
}

async function createDealPipeline(userId: number): Promise<DealPipeline> {
  const auth = await googleAuthManager.getAuthenticatedClient(String(userId));
  return new DealPipeline(auth, getWorkspaceSpreadsheetId());
}

function getWorkspaceSpreadsheetId(): string {
  const spreadsheetId = process.env.WORKSPACE_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error("WORKSPACE_SPREADSHEET_ID or GOOGLE_SHEETS_SPREADSHEET_ID is required");
  }
  return spreadsheetId;
}

function textResult(title: string, value: unknown): string {
  return `${title}\n\n${JSON.stringify(value, null, 2)}`;
}

function requiredString(value: unknown, clarification: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(clarification);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredNumber(value: unknown, clarification: string): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  throw new Error(clarification);
}

function optionalNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function requiredExchange(value: unknown): SupportedExchangeId {
  const exchange = requiredString(value, "거래소를 알려주세요. 예: binance, upbit, bybit");
  if (["binance", "upbit", "bybit"].includes(exchange)) return exchange as SupportedExchangeId;
  throw new Error("지원 거래소는 binance, upbit, bybit입니다.");
}

function requiredSide(value: unknown): FuturesRiskInput["side"] {
  const side = requiredString(value, "포지션 방향을 알려주세요. 예: long, short").toLowerCase();
  if (side === "long" || side === "short") return side;
  throw new Error("포지션 방향은 long 또는 short만 가능합니다.");
}

function requiredAlertType(value: unknown): "price" | "rsi" | "funding" | "kimchi_premium" {
  const type = requiredString(value, "알림 종류를 알려주세요. 예: price, rsi, funding, kimchi_premium");
  if (["price", "rsi", "funding", "kimchi_premium"].includes(type)) {
    return type as "price" | "rsi" | "funding" | "kimchi_premium";
  }
  throw new Error("지원 알림 종류는 price, rsi, funding, kimchi_premium입니다.");
}

function requiredAlertOperator(value: unknown): "above" | "below" {
  const operator = requiredString(value, "알림 조건을 알려주세요. 예: above, below");
  if (operator === "above" || operator === "below") return operator;
  throw new Error("알림 조건은 above 또는 below만 가능합니다.");
}

function optionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function requiredTradeStatsPeriod(value: unknown): TradeStatsPeriod {
  const period = requiredString(value, "통계 기간을 알려주세요. 예: week, month");
  if (period === "week" || period === "month") return period;
  throw new Error("통계 기간은 week 또는 month만 가능합니다.");
}

function requiredFeasibilityInput(params: Record<string, unknown>): FeasibilityInput {
  return {
    projectName: requiredString(params.projectName, "프로젝트명을 알려주세요."),
    landCost: requiredNumber(params.landCost, "토지비를 알려주세요."),
    landArea: requiredNumber(params.landArea, "토지면적을 알려주세요."),
    buildingCoverageRate: requiredNumber(params.buildingCoverageRate, "건폐율을 알려주세요."),
    floorAreaRate: requiredNumber(params.floorAreaRate, "용적률을 알려주세요."),
    floors: requiredNumber(params.floors, "층수를 알려주세요."),
    constructionCostPerPyeong: requiredNumber(params.constructionCostPerPyeong, "평당 공사비를 알려주세요."),
    sellingPricePerPyeong: requiredNumber(params.sellingPricePerPyeong, "평당 분양가를 알려주세요."),
    sellingRate: optionalNumber(params.sellingRate),
    loanRate: optionalNumber(params.loanRate),
    loanLTV: optionalNumber(params.loanLTV),
    projectDurationMonths: optionalNumber(params.projectDurationMonths),
    equityRatio: optionalNumber(params.equityRatio),
  };
}

function requiredNewDeal(params: Record<string, unknown>): NewPFDeal {
  return {
    projectName: requiredString(params.projectName, "프로젝트명을 알려주세요."),
    location: optionalString(params.location) ?? "",
    stage: requiredString(params.stage, "PF 진행 단계를 알려주세요.") as DealStage,
    totalProjectCost: requiredNumber(params.totalProjectCost, "총사업비를 알려주세요."),
    loanAmount: requiredNumber(params.loanAmount, "대출금액을 알려주세요."),
    ltv: requiredNumber(params.ltv, "LTV를 알려주세요."),
    equityAmount: requiredNumber(params.equityAmount, "자기자본 금액을 알려주세요."),
    lenders: optionalString(params.lenders) ?? "",
    nextMilestone: optionalString(params.nextMilestone) ?? "",
    nextMilestoneDate: optionalString(params.nextMilestoneDate) ?? "",
    notes: optionalString(params.notes) ?? "",
  };
}
