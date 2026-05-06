import { matchWikiSave, matchWikiSearch } from "./wiki.ts";
import { parsePreCheckMessage } from "../trading/preCheckEngine.ts";
import { parseReviewMessage } from "../trading/reviewReport.ts";
import { isBriefingTestMessage } from "../intelligence/briefing.ts";
import { yyyymmdd, type IntentResult } from "./types.ts";

function extractDriveQuery(message: string): string {
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

/**
 * 키워드 기반 인텐트 매칭. 우선순위는 코드 순서대로 정해진다.
 * - 딜 명령은 모든 도메인보다 최우선
 * - 명시적 prefix(위키 저장/검색) 최상단
 * - trading_pre_check는 trading_risk_calculate("손절") 보다 먼저 실행되어야 함
 * - 브리핑 테스트는 Google Calendar 매처보다 먼저 실행
 */
export function isDealIntentMessage(message: string): boolean {
  return /^딜/.test(message.trim());
}

export function isAgentIntentMessage(message: string): boolean {
  return /^에이전트/.test(message.trim());
}

const NOTEBOOKLM_PREFIX_RE = /^(?:노트북(?:lm)?|notebooklm)\s+([\s\S]+)/i;

export function matchNotebookLmQuery(message: string): IntentResult | null {
  const m = message.trim().match(NOTEBOOKLM_PREFIX_RE);
  if (!m) return null;
  const question = m[1].trim();
  if (!question) return null;
  return {
    domain: "intelligence",
    action: "notebooklm_query",
    type: "query",
    confidence: 0.95,
    params: { question },
  };
}

export function fallbackIntent(message: string): IntentResult {
  const lower = message.toLowerCase();
  const compact = lower.replace(/\s+/g, "");

  if (isAgentIntentMessage(message)) {
    return {
      domain: "agents",
      action: "agent_command",
      type: "query",
      confidence: 0.99,
      params: {},
    };
  }

  if (isDealIntentMessage(message)) {
    return {
      domain: "deals",
      action: "deals_command",
      type: "query",
      confidence: 0.98,
      params: {},
    };
  }

  // 위키 자동 분류 저장 — "저장해 ...", "분류저장 ...", "자동저장 ..."
  const autoClassifyMatch = message.trim().match(/^(?:저장해|분류저장|자동저장)\s+([\s\S]+)/);
  if (autoClassifyMatch) {
    return {
      domain: "wiki",
      action: "wiki_auto_classify",
      type: "execute",
      confidence: 0.97,
      params: { content: autoClassifyMatch[1].trim() },
    };
  }

  // 위키 저장/검색 — 명시적 prefix
  const wikiSave = matchWikiSave(message);
  if (wikiSave) return wikiSave;
  const wikiSearch = matchWikiSearch(message);
  if (wikiSearch) return wikiSearch;

  // NotebookLM 질의 — 명시적 prefix ("노트북 ...", "노트북LM ...", "NotebookLM ...")
  const notebookLm = matchNotebookLmQuery(message);
  if (notebookLm) return notebookLm;

  // Telegram 최근 메시지 — Home 빠른 명령
  if (
    /telegram\s*(최근|recent)/i.test(message) ||
    /(최근|recent)\s*telegram/i.test(message) ||
    /텔레그램\s*(최근|메시지)/i.test(message) ||
    /최근\s*텔레그램/i.test(message)
  ) {
    return {
      domain: "chat",
      action: "chat_telegram_recent",
      type: "query",
      confidence: 0.9,
      params: { limit: 10 },
    };
  }

  const simReview = parseReviewMessage(message);
  if (/^매수\s*시뮬/i.test(message) && simReview) {
    return {
      domain: "trading",
      action: "trading_buy_signal",
      type: "execute",
      confidence: 0.96,
      params: {
        market: `KRW-${simReview.symbol}`,
        amountKrw: simReview.money?.currency === "KRW" ? simReview.money.value : 50_000,
        leverage: simReview.leverage,
        reason: "수동 트리거 — 매수 시뮬",
      },
    };
  }
  if (/^매도\s*시뮬/i.test(message) && simReview) {
    return {
      domain: "trading",
      action: "trading_sell_signal",
      type: "execute",
      confidence: 0.96,
      params: {
        market: `KRW-${simReview.symbol}`,
        volume: simReview.quantity?.value ?? 0.0001,
        leverage: simReview.leverage,
        reason: "수동 트리거 — 매도 시뮬",
      },
    };
  }

  if (simReview) {
    return {
      domain: "trading",
      action: "trading_review_report",
      type: "query",
      confidence: 0.97,
      params: {
        symbol: simReview.symbol,
        side: simReview.side,
        leverage: simReview.leverage,
        amountKrw: simReview.money?.currency === "KRW" ? simReview.money.value : undefined,
        amountUsd: simReview.money?.currency === "USD" ? simReview.money.value : undefined,
        amountAmbiguous: simReview.money?.ambiguous === true,
        quantity: simReview.quantity?.value,
        notes: simReview.notes,
      },
    };
  }

  // 진입 전 점검 — "BTC 숏 77000 손절 78500 목표 74000"
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

  if (compact.includes("승인큐") || compact.includes("승인목록") || lower.includes("approval list")) {
    return { domain: "trading", action: "trading_approval_list", type: "query", confidence: 0.9, params: {} };
  }

  // 모니터링 / 시스템 상태
  if (
    /모니터링/.test(message) ||
    /시스템\s*(상태|현황)/.test(message) ||
    /운영\s*상태/.test(message) ||
    /^monitoring$/i.test(message.trim()) ||
    /system\s*status/i.test(message)
  ) {
    return {
      domain: "intelligence",
      action: "monitoring_status",
      type: "query",
      confidence: 0.9,
      params: {},
    };
  }

  // 모닝 브리핑 수동 트리거
  if (isBriefingTestMessage(message)) {
    return {
      domain: "intelligence",
      action: "intelligence_morning_briefing",
      type: "execute",
      confidence: 0.95,
      params: {},
    };
  }

  // 잔고
  if (lower.includes("잔고") || lower.includes("balance")) {
    return {
      domain: "trading",
      action: "trading_balance",
      type: "query",
      confidence: 0.55,
      params: {
        exchange: lower.includes("키움")
          ? "kiwoom"
          : (lower.includes("upbit") || lower.includes("업비트"))
            ? "upbit"
            : (lower.includes("게이트") || lower.includes("gate"))
              ? "gateio"
              : "binance",
      },
    };
  }

  // 포지션
  if (lower.includes("포지션") || lower.includes("position") || lower.includes("positions")) {
    return {
      domain: "trading",
      action: "trading_positions",
      type: "query",
      confidence: 0.55,
      params: { exchange: lower.includes("bybit") ? "bybit" : (lower.includes("게이트") || lower.includes("gate")) ? "gateio" : "binance" },
    };
  }

  // 키움 종목 시세
  if (
    lower.includes("현재가") || lower.includes("주가") || lower.includes("코스피") || lower.includes("quote") ||
    lower.includes("삼성") || lower.includes("lg") || lower.includes("sk") || /\d{6}/.test(message)
  ) {
    return {
      domain: "trading",
      action: "trading_balance",
      type: "query",
      confidence: 0.6,
      params: {
        exchange: "kiwoom",
        stockCode: /\d{6}/.test(message) ? message.match(/\d{6}/)?.[0] : "005930",
      },
    };
  }

  // 기술적 분석 (개별 지표 우선)
  if (lower.includes("rsi")) {
    return { domain: "trading", action: "analysis_rsi", type: "query", confidence: 0.7, params: { exchange: "gateio", symbol: "BTC/USDT", timeframe: "1h", period: 14 } };
  }
  if (lower.includes("macd")) {
    return { domain: "trading", action: "analysis_macd", type: "query", confidence: 0.7, params: { exchange: "gateio", symbol: "BTC/USDT", timeframe: "1h" } };
  }
  if (lower.includes("볼린저") || lower.includes("bollinger")) {
    return { domain: "trading", action: "analysis_bollinger", type: "query", confidence: 0.7, params: { exchange: "gateio", symbol: "BTC/USDT", timeframe: "1h", period: 20, stdDev: 2 } };
  }
  if (lower.includes("기술") || lower.includes("ta") || lower.includes("분석")) {
    return { domain: "trading", action: "analysis_indicators", type: "query", confidence: 0.6, params: { exchange: "gateio", symbol: "BTC/USDT", timeframe: "1h" } };
  }

  // Risk Guard 명령
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

  // 리스크 계산 — 명시적 키워드("포지션사이징"/"청산가"/"리스크계산")만 매칭.
  // "손절"은 trading_pre_check 키워드이므로 risk_calculate 트리거에서 제거.
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

  if (lower.includes("pf") || lower.includes("파이프라인") || lower.includes("포트폴리오")) {
    return { domain: "realestate", action: "realestate_portfolio_summary", type: "query", confidence: 0.55, params: {} };
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

  if (lower.includes("토지이용규제") || lower.includes("용도지역")) {
    return { domain: "realestate", action: "realestate_land_use", type: "query", confidence: 0.6, params: { pnu: "" } };
  }
  if (lower.includes("공시지가")) {
    return { domain: "realestate", action: "realestate_land_price", type: "query", confidence: 0.6, params: { pnu: "", year: new Date().getFullYear().toString() } };
  }
  if (lower.includes("실거래가")) {
    return { domain: "realestate", action: "realestate_real_transaction", type: "query", confidence: 0.6, params: { regionCode: "", yearMonth: yyyymmdd(new Date()).slice(0, 6) } };
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

  // DART 공시
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

  // Google Workspace — 풍부한 키워드 fallback
  if (
    lower.includes("드라이브") ||
    lower.includes("구글드라이브") ||
    lower.includes("google drive") ||
    (lower.includes("drive") && (lower.includes("파일") || lower.includes("검색") || lower.includes("찾"))) ||
    lower.includes("파일 검색") ||
    lower.includes("파일 찾")
  ) {
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

  // 오늘 메일 요약 — 명시적 prefill 명령. newer_than:1d로 24시간 내 메일만 조회
  if (
    /오늘\s*(메일|이메일)/.test(message) ||
    /(메일|이메일)\s*요약/.test(message)
  ) {
    console.log("[INTENT FALLBACK] google_get_emails (today digest) detected");
    return {
      domain: "google",
      action: "google_get_emails",
      type: "query",
      confidence: 0.85,
      params: { maxResults: 10, searchQuery: "newer_than:1d" },
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
    return { domain: "google", action: "google_get_emails", type: "query", confidence: 0.7, params: { maxResults: 5 } };
  }

  if (
    lower.includes("메일 보내") ||
    lower.includes("이메일 전송") ||
    lower.includes("이메일 발송") ||
    lower.includes("send email") ||
    lower.includes("메일 발송")
  ) {
    console.log("[INTENT FALLBACK] google_send_email detected");
    return { domain: "google", action: "google_send_email", type: "execute", confidence: 0.7, params: {} };
  }

  // 오늘만 한정 — "오늘 일정", "오늘 일정 브리핑", "오늘 스케줄" 등은 today_events로 분기
  if (
    /오늘\s*(일정|스케줄|미팅|회의)/.test(message) ||
    /(일정|스케줄)\s*브리핑/.test(message) ||
    lower.includes("today schedule") ||
    lower.includes("today events")
  ) {
    console.log("[INTENT FALLBACK] google_today_events detected");
    return { domain: "google", action: "google_today_events", type: "query", confidence: 0.85, params: {} };
  }

  if (
    lower.includes("일정 확인") ||
    lower.includes("캘린더 목록") ||
    lower.includes("다음 일정") ||
    lower.includes("이번 주 일정") ||
    lower.includes("스케줄 확인")
  ) {
    console.log("[INTENT FALLBACK] google_list_events detected");
    return { domain: "google", action: "google_list_events", type: "query", confidence: 0.7, params: { maxResults: 5 } };
  }

  // 알림/딜/캘린더 추가 등 execute 의도
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
      },
    };
  }

  if ((lower.includes("pf") || lower.includes("딜")) && lower.includes("추가")) {
    return {
      domain: "realestate",
      action: "realestate_add_deal",
      type: "execute",
      confidence: 0.55,
      params: { projectName: "신규 프로젝트", location: "", stage: "검토" },
    };
  }

  if ((lower.includes("pf") || lower.includes("딜")) && lower.includes("단계") && (lower.includes("변경") || lower.includes("수정"))) {
    return {
      domain: "realestate",
      action: "realestate_update_deal_stage",
      type: "execute",
      confidence: 0.55,
      params: { id: "", stage: "심사" },
    };
  }

  if ((lower.includes("캘린더") || lower.includes("일정") || lower.includes("미팅")) && (lower.includes("생성") || lower.includes("추가"))) {
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
      },
    };
  }

  if (
    (lower.includes("시트") || lower.includes("sheets") || lower.includes("스프레드시트")) &&
    (lower.includes("읽") || lower.includes("조회") || lower.includes("보여") || lower.includes("확인") || lower.includes("read"))
  ) {
    const rangeMatch = message.match(/[A-Za-z가-힣0-9_]+!?[A-Z]+\d+(?::[A-Z]+\d+)?/);
    return {
      domain: "google",
      action: "google_read_sheet",
      type: "query",
      confidence: 0.7,
      params: {
        spreadsheetId: process.env.WORKSPACE_SPREADSHEET_ID || "",
        range: rangeMatch ? rangeMatch[0] : "Sheet1!A1:Z50",
        maxRows: 5,
      },
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
      },
    };
  }

  // "리스크"가 포함된 메시지는 AI 일반 응답으로 넘기지 않고 Risk Guard 상태로 라우팅
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
