import { exchangeConnector } from "../../exchanges/exchangeConnector.ts";
import { gateioConnector } from "../../exchanges/gateioConnector.ts";
import { kiwoomConnector } from "../../exchanges/kiwoomConnector.ts";
import { taEngine } from "../../trading/technicalAnalysis.ts";
import { calculateFuturesRisk } from "../../trading/riskCalculator.ts";
import { riskGuard } from "../../trading/riskGuard.ts";
import { runPreCheck, formatPreCheck } from "../../trading/preCheckEngine.ts";
import { runReviewReport, formatReviewReport } from "../../trading/reviewReport.ts";
import { addAlert, startAlertScheduler } from "../../alerts/alertEngine.ts";
import {
  asString,
  asNumber,
  asBoolean,
  type HandlerMap,
  type IntentHandler,
} from "../types.ts";

function formatBalanceText(exchange: string, total: Record<string, number>): string {
  const lines: string[] = [`💰 ${exchange.toUpperCase()} 잔고`];
  const entries = Object.entries(total)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => (a === "KRW" ? -1 : b === "KRW" ? 1 : 0));
  if (entries.length === 0) {
    lines.push("보유 자산 없음");
  } else {
    for (const [currency, amount] of entries) {
      if (currency === "KRW") {
        lines.push(`  ₩${Math.floor(amount).toLocaleString("ko-KR")} KRW`);
      } else {
        lines.push(`  ${amount.toFixed(8).replace(/\.?0+$/, "")} ${currency}`);
      }
    }
  }
  return lines.join("\n");
}

const tradingBalance: IntentHandler = async (intent) => {
  const exchange = asString(intent.params.exchange, "binance");
  let data;
  if (exchange === "gateio") {
    if (!gateioConnector.hasApiKey()) {
      return { intent, handled: true, requiresConfirmation: false, response: "⚠️ Gate.io API 키가 설정되지 않았습니다. .env에 GATEIO_API_KEY와 GATEIO_API_SECRET을 추가하세요." };
    }
    data = await gateioConnector.getSpotBalance();
  } else if (exchange === "kiwoom") {
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
  const responseText = data && typeof data === "object" && "total" in data
    ? formatBalanceText(exchange, (data as { total: Record<string, number> }).total)
    : `${exchange} 잔고 조회를 완료했습니다.`;
  return { intent, handled: true, requiresConfirmation: false, response: responseText, data };
};

const tradingPositions: IntentHandler = async (intent) => {
  const exchange = asString(intent.params.exchange, "binance");
  let data;
  if (exchange === "gateio") {
    data = await gateioConnector.getPositions();
  } else {
    data = await exchangeConnector.getPositions(exchange as "binance" | "upbit" | "bybit");
  }
  return { intent, handled: true, requiresConfirmation: false, response: `${exchange} 포지션 조회를 완료했습니다.`, data };
};

const tradingTechnicalAnalysis: IntentHandler = async (intent) => {
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
};

const tradingRiskCalculation: IntentHandler = async (intent) => {
  const riskInput = {
    entryPrice: asNumber(intent.params.entryPrice, 100000),
    leverage: asNumber(intent.params.leverage, 10),
    side: asString(intent.params.side, "long") === "short" ? "short" : "long",
    marginBalance: asNumber(intent.params.marginBalance, 1000),
    riskPercent: asNumber(intent.params.riskPercent, 2),
  } as const;
  const result = calculateFuturesRisk(riskInput);
  return { intent, handled: true, requiresConfirmation: false, response: "선물 리스크를 계산했습니다.", data: { input: riskInput, result } };
};

const tradingRiskCalculate: IntentHandler = async (intent) => {
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
};

const tradingRiskStatus: IntentHandler = async (intent) => {
  const status = await riskGuard.getStatus();
  const blocked =
    status.manualLock.locked ||
    status.dailyPnlPercent <= -status.settings.dailyLossLimitPercent ||
    status.consecutiveLosses >= status.settings.consecutiveLossBlock;
  const warned = !blocked && status.consecutiveLosses >= status.settings.consecutiveLossWarn;
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
};

const tradingRiskLock: IntentHandler = async (intent) => {
  const reason = asString(intent.params.reason, "사용자 수동 잠금");
  await riskGuard.lock(reason);
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: `🚫 거래가 중지되었습니다.\n사유: ${reason}`,
  };
};

const tradingRiskUnlock: IntentHandler = async (intent) => {
  await riskGuard.unlock();
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "✅ 거래가 재개되었습니다.",
  };
};

const tradingRiskSettingsUpdate: IntentHandler = async (intent) => {
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
};

const tradingPreCheck: IntentHandler = async (intent) => {
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
};

const tradingReviewReport: IntentHandler = async (intent) => {
  const symbol = asString(intent.params.symbol, "BTC");
  const sideRaw = asString(intent.params.side, "neutral");
  const side = sideRaw === "long" || sideRaw === "short" ? sideRaw : "neutral";
  const leverageRaw = intent.params.leverage;
  const leverage = typeof leverageRaw === "number" && Number.isFinite(leverageRaw) ? leverageRaw : undefined;
  const amountKrwRaw = intent.params.amountKrw;
  const amountUsdRaw = intent.params.amountUsd;
  const quantityRaw = intent.params.quantity;
  const notesRaw = Array.isArray(intent.params.notes)
    ? intent.params.notes.filter((note): note is string => typeof note === "string")
    : [];

  try {
    const result = await runReviewReport({
      symbol,
      side,
      leverage,
      money: typeof amountKrwRaw === "number" && Number.isFinite(amountKrwRaw)
        ? { value: amountKrwRaw, currency: "KRW", ambiguous: intent.params.amountAmbiguous === true }
        : typeof amountUsdRaw === "number" && Number.isFinite(amountUsdRaw)
          ? { value: amountUsdRaw, currency: "USD" }
          : undefined,
      quantity: typeof quantityRaw === "number" && Number.isFinite(quantityRaw)
        ? { value: quantityRaw, symbol }
        : undefined,
      notes: notesRaw,
    });
    return { intent, handled: true, requiresConfirmation: false, response: formatReviewReport(result) };
  } catch (err) {
    console.error("[trading] review report failed:", err);
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `검토 리포트 생성 실패: ${(err as Error).message}`,
    };
  }
};

const analysisHandler: IntentHandler = async (intent) => {
  const symbol = asString(intent.params.symbol, "BTC/USDT");
  const timeframe = asString(intent.params.timeframe, "1h");
  console.log("[INTENT] technical analysis:", intent.action, symbol, timeframe);
  try {
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
};

const tradingAddAlert: IntentHandler = async (intent, options) => {
  const telegramChatId = asString(intent.params.telegramChatId, process.env.OWNER_TELEGRAM_CHAT_ID || "").trim();
  if (!telegramChatId) {
    throw new Error("OWNER_TELEGRAM_CHAT_ID is missing");
  }

  await startAlertScheduler();
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
};

export const tradingHandlers: HandlerMap = {
  trading_balance: tradingBalance,
  trading_positions: tradingPositions,
  trading_technical_analysis: tradingTechnicalAnalysis,
  trading_risk_calculation: tradingRiskCalculation,
  trading_risk_calculate: tradingRiskCalculate,
  trading_risk_status: tradingRiskStatus,
  trading_risk_lock: tradingRiskLock,
  trading_risk_unlock: tradingRiskUnlock,
  trading_risk_settings_update: tradingRiskSettingsUpdate,
  trading_pre_check: tradingPreCheck,
  trading_review_report: tradingReviewReport,
  trading_add_alert: tradingAddAlert,
  analysis_indicators: analysisHandler,
  analysis_rsi: analysisHandler,
  analysis_macd: analysisHandler,
  analysis_bollinger: analysisHandler,
};
