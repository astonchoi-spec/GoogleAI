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
import { DealPipeline, type KoreanDealStage, type NewPFDeal } from "../realestate/dealPipeline.ts";
import { runFeasibility, formatFeasibilityReport, type FeasibilityInput } from "../realestate/feasibilityEngine.ts";
import { getLandRegulation } from "../realestate/publicDataAPI.ts";
import { LLMCaller } from "../llm/caller.ts";
import { calculateFuturesRisk, formatRiskReport, type FuturesRiskInput } from "../trading/riskCalculator.ts";
import { taEngine, type OhlcvArray } from "../trading/technicalAnalysis.ts";
import { TradeJournal, type TradeStatsPeriod } from "../trading/tradeJournal.ts";
import type { SupportedExchangeId } from "../exchanges/exchangeConnector.ts";
import { getTvWebhookHistory } from "../alerts/tvWebhookServer.ts"; // MODIFIED: TV webhook history for intent routing.
import { TradeJournalKorean } from "../trading/tradeJournal.ts"; // MODIFIED: 1-D 매매일지 인텐트 라우팅.
import { queryNotebookLm } from "../integrations/notebookLmMcp.ts"; // MODIFIED: NotebookLM MCP 인텐트 라우팅.
import DriveConnector from "../google/drive.ts";
import GmailConnector from "../google/gmail.ts";
import CalendarConnector from "../google/calendar.ts";

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
  | "alerts.tvWebhookHistory"
  | "journal.list"
  | "journal.addManual"
  | "journal.syncGateio"
  | "notebooklm.query"
  | "google.driveSearch"
  | "google.getEmails"
  | "google.sendEmail"
  | "google.listEvents"
  | "google.createEvent"
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
- alerts.tvWebhookHistory: { limit? }
- journal.list: { limit? }
- journal.addManual: { date, time, exchange, symbol, side, qty, price, fee, pnl?, memo? }
- journal.syncGateio: { symbol }
- notebooklm.query: { question }
- google.driveSearch: { query, maxResults? }
- google.getEmails: { maxResults?, searchQuery? }
- google.sendEmail: { to, subject, body }
- google.listEvents: { maxResults? }
- google.createEvent: { title, startTime?, endTime?, description?, isAllDay? }
- general.chat: { message }

규칙:
- 회사 검색, 공시 조회, 재무제표 조회 문장은 finance.searchCompanyByName, finance.getDisclosures, finance.getFinancialStatements, finance.getCompanyInfo 중 가장 적절한 것으로 분기한다.
- "TV 알림 내역", "트레이딩뷰 알림", "TradingView 알림", "웹훅 이력" 같은 요청은 alerts.tvWebhookHistory로 분기한다.
- "매매일지", "오늘 거래 내역", "매매 기록", "체결 내역" 같은 조회 요청은 journal.list로 분기한다.
- "수동 기록", "매매 입력", "거래 추가" 같은 요청은 journal.addManual로 분기한다.
- "게이트 동기화", "체결 동기화", "Gate.io 동기화" 같은 요청은 journal.syncGateio로 분기한다.
- "노트북에서 찾아봐", "NotebookLM", "문서에서 검색", "자료 찾아줘" 같은 요청은 notebooklm.query로 분기한다.
- "구글드라이브", "Drive", "드라이브에서", "파일 검색", "파일 찾아" 같은 요청은 google.driveSearch로 분기한다. query 파라미터에 검색 키워드를 추출한다.
- "메일 확인", "받은 메일", "이메일 목록", "Gmail", "받은 편지함" 같은 요청은 google.getEmails로 분기한다.
- "메일 보내", "이메일 전송", "send email", "이메일 발송" 같은 요청은 google.sendEmail로 분기한다.
- "일정 확인", "오늘 일정", "캘린더 목록", "다음 일정" 같은 조회 요청은 google.listEvents로 분기한다.
- "일정 추가", "일정 잡아", "캘린더에 추가", "미팅 생성" 같은 생성 요청은 google.createEvent로 분기한다.
- 파라미터가 부족하면 clarification에 필요한 질문을 담아 반환한다.
- 반드시 JSON만 응답한다: { intent: string, params: object, clarification: string|null }`;

const intentCaller = new LLMCaller();

export async function parseIntent(userMessage: string): Promise<ParsedIntent> {
  console.log("[INTENT ROUTER] parseIntent:", userMessage.slice(0, 80));

  // Keyword pre-check: deterministic routing before LLM call
  const preChecked = preCheckKeywords(userMessage);
  if (preChecked) {
    console.log("[INTENT ROUTER] keyword pre-check matched:", preChecked.intent, "params:", JSON.stringify(preChecked.params).slice(0, 80));
    return preChecked;
  }

  const response = await intentCaller.call(
    "gemini",
    "flash",
    [{ role: "user", content: userMessage }],
    INTENT_SYSTEM_PROMPT
  );

  const result = normalizeParsedIntent(response.content, userMessage);
  console.log("[INTENT ROUTER] LLM parsed intent:", result.intent, "params:", JSON.stringify(result.params).slice(0, 80));
  return result;
}

export async function executeIntent(parsed: ParsedIntent, ctx: TrpcContext): Promise<string> {
  console.log("[INTENT ROUTER] executeIntent:", parsed.intent, "params:", JSON.stringify(parsed.params).slice(0, 80));
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
    case "journal.list": {
      // MODIFIED: 1-D 매매일지 조회.
      assertAuthenticated(ctx);
      const limit = optionalNumber(parsed.params.limit) ?? 50;
      const journal = await createKoreanJournal(ctx.user.id);
      const records = await journal.getTradeHistory(Math.min(200, Math.max(1, limit)));
      if (records.length === 0) return "저장된 매매일지 기록이 없습니다.";
      return textResult("매매일지 최근 기록", records);
    }
    case "journal.addManual": {
      // MODIFIED: 1-D 수동 매매 입력.
      assertAuthenticated(ctx);
      const trade = {
        date: requiredString(parsed.params.date, "거래 날짜를 YYYY-MM-DD 형식으로 알려주세요."),
        time: requiredString(parsed.params.time, "거래 시간을 HH:MM:SS 형식으로 알려주세요."),
        exchange: requiredString(parsed.params.exchange, "거래소를 알려주세요."),
        symbol: requiredString(parsed.params.symbol, "종목을 알려주세요."),
        side: requiredTradeSide(parsed.params.side),
        qty: requiredNumber(parsed.params.qty, "수량을 알려주세요."),
        price: requiredNumber(parsed.params.price, "가격을 알려주세요."),
        fee: requiredNumber(parsed.params.fee, "수수료를 알려주세요."),
        pnl: optionalNumber(parsed.params.pnl),
        memo: optionalString(parsed.params.memo),
      } satisfies import("../trading/tradeJournal.ts").TradeRecord;
      const journal = await createKoreanJournal(ctx.user.id);
      const result = await journal.appendTrade(trade);
      return textResult("매매일지 입력 완료", result);
    }
    case "journal.syncGateio": {
      // MODIFIED: 1-D Gate.io 체결 동기화.
      assertAuthenticated(ctx);
      const symbol = requiredString(parsed.params.symbol, "동기화할 심볼을 알려주세요. 예: BTC/USDT");
      const journal = await createKoreanJournal(ctx.user.id);
      const result = await journal.syncGateioTrades(symbol);
      return textResult("Gate.io 체결 동기화 완료", result);
    }
    case "alerts.tvWebhookHistory": {
      // MODIFIED: return recent TradingView webhook alerts from Redis.
      const limit = optionalNumber(parsed.params.limit) ?? 20;
      const history = await getTvWebhookHistory(Math.min(100, Math.max(1, limit)));
      if (history.length === 0) return "저장된 TradingView 알림 내역이 없습니다.";
      return textResult("TradingView 알림 내역", history);
    }
    case "notebooklm.query": {
      // MODIFIED: NotebookLM MCP 문서 검색.
      const question = requiredString(parsed.params.question, "검색할 질문을 알려주세요.");
      const result = await queryNotebookLm(question);
      const sourcesText = result.sources.length > 0 ? `\n\n참조 문서:\n${result.sources.join("\n")}` : "";
      return `${result.answer}${sourcesText}`;
    }
    case "google.driveSearch": {
      const query = requiredString(parsed.params.query, "검색할 파일명이나 키워드를 알려주세요.");
      const maxResults = optionalNumber(parsed.params.maxResults) ?? 10;
      const googleUserId = await resolveGoogleUserId(ctx);
      try {
        const auth = await googleAuthManager.getAuthenticatedClient(googleUserId);
        const drive = new DriveConnector(auth);
        const driveQuery = `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`;
        const files = await drive.searchFiles(driveQuery, maxResults);
        if (files.length === 0) return `Google Drive에서 "${query}" 파일을 찾을 수 없습니다.`;
        const list = files.map((f: any, i: number) => `${i + 1}. 📄 ${f.name}`).join("\n");
        return `📁 Google Drive 검색 결과 "${query}" (${files.length}개):\n\n${list}`;
      } catch (err) {
        if (isGoogleAuthError(err)) return GOOGLE_REAUTH_MSG;
        throw err;
      }
    }
    case "google.getEmails": {
      const maxResults = optionalNumber(parsed.params.maxResults) ?? 5;
      const searchQuery = optionalString(parsed.params.searchQuery);
      const googleUserId = await resolveGoogleUserId(ctx);
      try {
        const auth = await googleAuthManager.getAuthenticatedClient(googleUserId);
        const gmail = new GmailConnector(auth);
        const emails = await gmail.getEmails(maxResults, searchQuery);
        if (emails.length === 0) return "📭 받은 메일이 없습니다.";
        const list = emails.map((e: any, i: number) =>
          `${i + 1}. ${e.isRead ? "" : "🔵"} ${e.subject}\n   발신: ${e.from}`
        ).join("\n\n");
        return `📬 최근 이메일 ${emails.length}개:\n\n${list}`;
      } catch (err) {
        if (isGoogleAuthError(err)) return GOOGLE_REAUTH_MSG;
        throw err;
      }
    }
    case "google.sendEmail": {
      const to = requiredString(parsed.params.to, "받는 사람 이메일 주소를 알려주세요.");
      const subject = requiredString(parsed.params.subject, "이메일 제목을 알려주세요.");
      const body = requiredString(parsed.params.body, "이메일 본문을 알려주세요.");
      const googleUserId = await resolveGoogleUserId(ctx);
      try {
        const auth = await googleAuthManager.getAuthenticatedClient(googleUserId);
        const gmail = new GmailConnector(auth);
        await gmail.sendEmail({ to, subject, body });
        return `✅ 이메일 전송 완료!\n📧 받는 사람: ${to}\n📋 제목: ${subject}`;
      } catch (err) {
        if (isGoogleAuthError(err)) return GOOGLE_REAUTH_MSG;
        throw err;
      }
    }
    case "google.listEvents": {
      const maxResults = optionalNumber(parsed.params.maxResults) ?? 5;
      const googleUserId = await resolveGoogleUserId(ctx);
      try {
        const auth = await googleAuthManager.getAuthenticatedClient(googleUserId);
        const calendar = new CalendarConnector(auth);
        const events = await calendar.getUpcomingEvents(maxResults);
        if (events.length === 0) return "📅 예정된 일정이 없습니다.";
        const list = events.map((ev: any, i: number) =>
          `${i + 1}. 📅 ${ev.title || ev.summary}\n   ${ev.start?.dateTime || ev.start?.date || ""}`
        ).join("\n\n");
        return `📅 다가오는 일정 ${events.length}개:\n\n${list}`;
      } catch (err) {
        if (isGoogleAuthError(err)) return GOOGLE_REAUTH_MSG;
        throw err;
      }
    }
    case "google.createEvent": {
      const title = requiredString(parsed.params.title, "일정 제목을 알려주세요.");
      const googleUserId = await resolveGoogleUserId(ctx);
      try {
        const auth = await googleAuthManager.getAuthenticatedClient(googleUserId);
        const calendar = new CalendarConnector(auth);
        const now = new Date();
        const startTime = parsed.params.startTime
          ? new Date(String(parsed.params.startTime))
          : new Date(now.getTime() + 60 * 60 * 1000);
        const endTime = parsed.params.endTime
          ? new Date(String(parsed.params.endTime))
          : new Date(startTime.getTime() + 60 * 60 * 1000);
        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
          return "일정 날짜를 정확히 해석하지 못했습니다. 예: 내일 오후 3시 팀 미팅";
        }
        const event = await calendar.createEvent({
          title,
          startTime,
          endTime,
          description: optionalString(parsed.params.description) ?? "",
          isAllDay: !!(parsed.params.isAllDay),
        });
        return [
          "✅ 캘린더 일정 생성 완료!",
          `📅 제목: ${title}`,
          `⏰ 시작: ${startTime.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
          event.htmlLink ? `🔗 확인: ${event.htmlLink}` : "",
        ].filter(Boolean).join("\n");
      } catch (err) {
        if (isGoogleAuthError(err)) return GOOGLE_REAUTH_MSG;
        throw err;
      }
    }
    case "general.chat":
      return requiredString(parsed.params.message, "무엇을 도와드릴까요?");
    default:
      // Never show raw unhandled message — fallback to Gemini general chat
      return "";
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
    "alerts.tvWebhookHistory",
    "journal.list",
    "journal.addManual",
    "journal.syncGateio",
    "notebooklm.query",
    "google.driveSearch",
    "google.getEmails",
    "google.sendEmail",
    "google.listEvents",
    "google.createEvent",
    "general.chat",
  ].includes(value);
}

function preCheckKeywords(message: string): ParsedIntent | null {
  const lower = message.toLowerCase();

  // Google Drive search
  if (
    lower.includes("드라이브") ||
    lower.includes("구글드라이브") ||
    lower.includes("google drive") ||
    (lower.includes("drive") && (lower.includes("파일") || lower.includes("검색") || lower.includes("찾")))
  ) {
    const query = extractDriveKeyword(message);
    return { intent: "google.driveSearch", params: { query, maxResults: 10 }, clarification: null };
  }

  // Gmail
  if (lower.includes("메일 확인") || lower.includes("받은 메일") || lower.includes("이메일 목록") || lower.includes("받은편지함")) {
    return { intent: "google.getEmails", params: { maxResults: 5 }, clarification: null };
  }
  if (lower.includes("메일 보내") || lower.includes("이메일 전송") || lower.includes("이메일 발송")) {
    return { intent: "google.sendEmail", params: {}, clarification: null };
  }

  // Calendar
  if (lower.includes("오늘 일정") || lower.includes("일정 확인") || lower.includes("캘린더 목록") || lower.includes("다음 일정")) {
    return { intent: "google.listEvents", params: { maxResults: 5 }, clarification: null };
  }

  return null;
}

function extractDriveKeyword(message: string): string {
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

async function resolveGoogleUserId(ctx: TrpcContext): Promise<string> {
  if (ctx.user) return String(ctx.user.id);
  // Single-user fallback: try known admin user IDs
  for (const uid of ["1", "anonymous"]) {
    try {
      const tokens = await (await import("../llm/session.ts")).sessionManager.getGoogleTokens(uid);
      if (tokens?.accessToken) return uid;
    } catch {}
  }
  return "1";
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

async function createKoreanJournal(userId: number): Promise<TradeJournalKorean> {
  const auth = await googleAuthManager.getAuthenticatedClient(String(userId));
  return new TradeJournalKorean(auth, getWorkspaceSpreadsheetId());
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
  const exchange = requiredString(value, "거래소를 알려주세요. 예: gate, binance, upbit, bybit");
  if (["gate", "binance", "upbit", "bybit"].includes(exchange)) return exchange as SupportedExchangeId;
  throw new Error("지원 거래소는 gate, binance, upbit, bybit입니다.");
}

function requiredSide(value: unknown): FuturesRiskInput["side"] {
  const side = requiredString(value, "포지션 방향을 알려주세요. 예: long, short").toLowerCase();
  if (side === "long" || side === "short") return side;
  throw new Error("포지션 방향은 long 또는 short만 가능합니다.");
}

function requiredTradeSide(value: unknown): "buy" | "sell" {
  const side = requiredString(value, "매수/매도 방향을 알려주세요. 예: buy, sell").toLowerCase();
  if (side === "buy" || side === "sell") return side;
  throw new Error("매수/매도 방향은 buy 또는 sell만 가능합니다.");
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
    stage: requiredString(params.stage, "PF 진행 단계를 알려주세요.") as KoreanDealStage,
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
