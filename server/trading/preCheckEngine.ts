import { taEngine, type OhlcvCandle } from "./technicalAnalysis.ts";
import { riskGuard } from "./riskGuard.ts";

const KIMCHI_FX_RATE = 1380; // server/routers/trading.ts와 동일 baseline

export type PreCheckSide = "long" | "short";

export type PreCheckInput = {
  symbol: string; // "BTC", "ETH", "BTC/USDT" 등 자유 표기
  side: PreCheckSide;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  accountBalance?: number; // USDT 기준, 미지정시 RiskGuard 또는 기본 10000 사용
};

export type PreCheckVerdict = "allow" | "warn" | "block";

export type PreCheckResult = {
  verdict: PreCheckVerdict;
  symbol: string;
  baseAsset: string;
  side: PreCheckSide;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  autoSuggested: boolean; // SL/TP를 자동 제안한 경우 true
  riskReward: number | null;
  positionQty: number | null;
  positionNotional: number | null;
  riskPercent: number;
  accountBalance: number;
  currentPrice: number | null;
  entryGapPercent: number | null; // (current - entry) / entry * 100, 부호 유지
  rsi1h: number | null;
  rsi4h: number | null;
  bbPosition: "상단돌파" | "상단근접" | "중단" | "하단근접" | "하단돌파" | null;
  bbUpper: number | null;
  bbLower: number | null;
  fundingRatePercent: number | null; // % 단위 (예: 0.012)
  volumeChangePercent: number | null; // 24h 거래량 vs 직전 24h
  kimchiPremiumPercent: number | null;
  riskGuard: {
    dailyPnlPercent: number;
    dailyLossLimitPercent: number;
    consecutiveLosses: number;
    consecutiveLossBlock: number;
    locked: boolean;
    lockReason?: string;
  };
  reasons: string[];
  warnings: string[];
  notes: string[];
};

function normalizeBaseAsset(symbol: string): string {
  const cleaned = symbol.toUpperCase().replace("KRW-", "").replace("/USDT", "").trim();
  return cleaned;
}

function safeNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchBinanceCandles(
  baseAsset: string,
  interval: string,
  limit: number,
): Promise<OhlcvCandle[]> {
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${baseAsset}USDT&interval=${interval}&limit=${limit}`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as unknown[][];
    return data.map(
      (c) =>
        [Number(c[0]), Number(c[1]), Number(c[2]), Number(c[3]), Number(c[4]), Number(c[5])] as OhlcvCandle,
    );
  } catch {
    return [];
  }
}

function classifyBbPosition(
  close: number,
  upper: number | null,
  lower: number | null,
  middle: number | null,
): PreCheckResult["bbPosition"] {
  if (upper === null || lower === null || middle === null) return null;
  if (close >= upper) return "상단돌파";
  if (close <= lower) return "하단돌파";
  const upperGap = (upper - close) / (upper - middle);
  const lowerGap = (close - lower) / (middle - lower);
  if (upperGap < 0.2) return "상단근접";
  if (lowerGap < 0.2) return "하단근접";
  return "중단";
}

export async function runPreCheck(input: PreCheckInput): Promise<PreCheckResult> {
  const baseAsset = normalizeBaseAsset(input.symbol);
  const binanceSymbol = `${baseAsset}/USDT`;
  const upbitSymbol = `KRW-${baseAsset}`;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  // 1. Binance 현재가/24h 거래량 (공개 API, API 키 불필요)
  let currentPrice: number | null = null;
  let fundingRatePercent: number | null = null;
  let quoteVolume24h: number | null = null;
  let marketDataError = false;
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${baseAsset}USDT`);
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      currentPrice = safeNumber(data.lastPrice);
      quoteVolume24h = safeNumber(data.quoteVolume);
    } else {
      marketDataError = true;
    }
  } catch {
    marketDataError = true;
  }
  try {
    const res = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${baseAsset}USDT&limit=1`);
    if (res.ok) {
      const data = (await res.json()) as unknown[];
      if (Array.isArray(data) && data.length > 0) {
        const rate = safeNumber((data[0] as Record<string, unknown>).fundingRate);
        if (rate !== null) fundingRatePercent = rate * 100;
      }
    }
  } catch {
    // 일부 심볼은 funding 미지원 — 무시
  }

  // 2. 1d 캔들로 거래량 변화율
  let volumeChangePercent: number | null = null;
  const dailyCandles = await fetchBinanceCandles(baseAsset, "1d", 3);
  if (dailyCandles.length >= 2) {
    const prev = dailyCandles[dailyCandles.length - 2];
    const today = dailyCandles[dailyCandles.length - 1];
    const prevVol = Array.isArray(prev) ? prev[5] : prev.volume ?? 0;
    const todayVol = Array.isArray(today) ? today[5] : today.volume ?? 0;
    if (prevVol && todayVol) {
      volumeChangePercent = ((todayVol - prevVol) / prevVol) * 100;
    }
  }

  // 3. RSI 1h / 4h, 볼린저 (1h 기준)
  const candles1h = await fetchBinanceCandles(baseAsset, "1h", 200);
  const candles4h = await fetchBinanceCandles(baseAsset, "4h", 200);
  let rsi1h: number | null = null;
  let rsi4h: number | null = null;
  let bbUpper: number | null = null;
  let bbLower: number | null = null;
  let bbMiddle: number | null = null;
  if (candles1h.length > 30) {
    const ta = taEngine.analyzeSymbol(candles1h);
    rsi1h = ta.rsi.value;
    bbUpper = ta.bollingerBands.upper;
    bbLower = ta.bollingerBands.lower;
    bbMiddle = ta.bollingerBands.middle;
  }
  if (candles4h.length > 30) {
    const ta = taEngine.analyzeSymbol(candles4h);
    rsi4h = ta.rsi.value;
  }
  const bbPosition = currentPrice !== null
    ? classifyBbPosition(currentPrice, bbUpper, bbLower, bbMiddle)
    : null;

  // 4. 김치프리미엄 (Upbit 공개 API)
  let kimchiPremiumPercent: number | null = null;
  try {
    const res = await fetch(`https://api.upbit.com/v1/ticker?markets=${upbitSymbol}`);
    if (res.ok) {
      const data = (await res.json()) as unknown[];
      if (Array.isArray(data) && data.length > 0) {
        const upbitPrice = safeNumber((data[0] as Record<string, unknown>).trade_price);
        if (upbitPrice !== null && currentPrice !== null && currentPrice > 0) {
          const binanceKrw = currentPrice * KIMCHI_FX_RATE;
          kimchiPremiumPercent = ((upbitPrice - binanceKrw) / binanceKrw) * 100;
        }
      }
    }
  } catch {
    // 무시 — 김프 조회 실패는 차단 사유 아님
  }

  if (marketDataError) notes.push("일부 데이터를 가져오지 못했습니다");

  // 5. Risk Guard 상태
  const guard = await riskGuard.getStatus();
  const guardSettings = guard.settings;
  const guardLocked = guard.manualLock.locked;
  const guardDailyOver = guard.dailyPnlPercent <= -guardSettings.dailyLossLimitPercent;
  const guardLossOver = guard.consecutiveLosses >= guardSettings.consecutiveLossBlock;

  if (guardLocked) reasons.push(`Risk Guard 수동 잠금${guard.manualLock.reason ? ` (${guard.manualLock.reason})` : ""}`);
  if (guardDailyOver) reasons.push(`일일 손실 한도 초과 (${guard.dailyPnlPercent.toFixed(2)}% / 한도 -${guardSettings.dailyLossLimitPercent}%)`);
  if (guardLossOver) reasons.push(`연속 손실 차단 (${guard.consecutiveLosses}회 / 한도 ${guardSettings.consecutiveLossBlock}회)`);

  // 6. SL/TP 자동 제안 (없을 때 ATR 기반 ±2% 단순 제안)
  let stopLoss = input.stopLoss ?? null;
  let takeProfit = input.takeProfit ?? null;
  let autoSuggested = false;
  if (stopLoss === null) {
    const slPercent = 0.02;
    stopLoss = input.side === "long"
      ? input.entryPrice * (1 - slPercent)
      : input.entryPrice * (1 + slPercent);
    autoSuggested = true;
    notes.push(`손절가 미지정 → 진입가 ${input.side === "long" ? "-" : "+"}2% 자동 제안`);
  }
  if (takeProfit === null) {
    const tpPercent = 0.04;
    takeProfit = input.side === "long"
      ? input.entryPrice * (1 + tpPercent)
      : input.entryPrice * (1 - tpPercent);
    autoSuggested = true;
    notes.push(`목표가 미지정 → 진입가 ${input.side === "long" ? "+" : "-"}4% 자동 제안`);
  }

  // 7. 손익비
  const riskDist = Math.abs(input.entryPrice - stopLoss);
  const rewardDist = Math.abs(takeProfit - input.entryPrice);
  const riskReward = riskDist > 0 ? rewardDist / riskDist : null;

  // 진입 방향 검증
  if (input.side === "long" && stopLoss >= input.entryPrice) {
    reasons.push("롱 포지션의 손절가가 진입가 이상입니다.");
  }
  if (input.side === "short" && stopLoss <= input.entryPrice) {
    reasons.push("숏 포지션의 손절가가 진입가 이하입니다.");
  }
  if (input.side === "long" && takeProfit <= input.entryPrice) {
    warnings.push("롱 포지션의 목표가가 진입가 이하 — 익절 방향 확인");
  }
  if (input.side === "short" && takeProfit >= input.entryPrice) {
    warnings.push("숏 포지션의 목표가가 진입가 이상 — 익절 방향 확인");
  }

  // 8. 포지션 사이즈 (계좌의 2% 리스크)
  const riskPercent = guardSettings.defaultRiskPercent;
  const accountBalance = input.accountBalance
    ?? (guard.daily.startingBalance > 0 ? guard.daily.startingBalance : 10000);
  let positionQty: number | null = null;
  let positionNotional: number | null = null;
  if (riskDist > 0) {
    const riskAmount = accountBalance * (riskPercent / 100);
    positionQty = riskAmount / riskDist;
    positionNotional = positionQty * input.entryPrice;
  }

  // 9. 진입가 vs 현재가 괴리율
  let entryGapPercent: number | null = null;
  if (currentPrice !== null) {
    entryGapPercent = ((currentPrice - input.entryPrice) / input.entryPrice) * 100;
    if (Math.abs(entryGapPercent) > 3) {
      warnings.push(`현재가가 진입가 대비 ${entryGapPercent.toFixed(2)}% 벗어남`);
    }
  }

  // 10. 손익비 경고
  if (riskReward !== null && riskReward < 1.5) {
    warnings.push(`손익비 ${riskReward.toFixed(2)} (1.5 미만, 진입 신중 권장)`);
  }

  // 11. 지표 기반 경고
  if (rsi1h !== null) {
    if (input.side === "long" && rsi1h >= 70) warnings.push(`RSI(1h) ${rsi1h.toFixed(1)} 과매수 — 롱 진입 주의`);
    if (input.side === "short" && rsi1h <= 30) warnings.push(`RSI(1h) ${rsi1h.toFixed(1)} 과매도 — 숏 진입 주의`);
  }
  if (bbPosition === "상단돌파" && input.side === "long") warnings.push("볼린저 상단돌파 — 추격 롱 위험");
  if (bbPosition === "하단돌파" && input.side === "short") warnings.push("볼린저 하단돌파 — 추격 숏 위험");

  if (fundingRatePercent !== null) {
    if (input.side === "long" && fundingRatePercent > 0.05) {
      warnings.push(`펀딩비 +${fundingRatePercent.toFixed(3)}% 롱 과열`);
    }
    if (input.side === "short" && fundingRatePercent < -0.05) {
      warnings.push(`펀딩비 ${fundingRatePercent.toFixed(3)}% 숏 과열`);
    }
  }

  // 12. 최종 판정
  let verdict: PreCheckVerdict = "allow";
  if (reasons.length > 0) verdict = "block";
  else if (warnings.length > 0) verdict = "warn";

  return {
    verdict,
    symbol: binanceSymbol,
    baseAsset,
    side: input.side,
    entryPrice: input.entryPrice,
    stopLoss,
    takeProfit,
    autoSuggested,
    riskReward,
    positionQty,
    positionNotional,
    riskPercent,
    accountBalance,
    currentPrice,
    entryGapPercent,
    rsi1h,
    rsi4h,
    bbPosition,
    bbUpper,
    bbLower,
    fundingRatePercent,
    volumeChangePercent,
    kimchiPremiumPercent,
    riskGuard: {
      dailyPnlPercent: guard.dailyPnlPercent,
      dailyLossLimitPercent: guardSettings.dailyLossLimitPercent,
      consecutiveLosses: guard.consecutiveLosses,
      consecutiveLossBlock: guardSettings.consecutiveLossBlock,
      locked: guardLocked,
      lockReason: guard.manualLock.reason,
    },
    reasons,
    warnings,
    notes,
  };
}

function fmtMoney(value: number | null, decimals = 0): string {
  if (value === null) return "N/A";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: 0 })}`;
}

function fmtNum(value: number | null, decimals = 2): string {
  if (value === null) return "N/A";
  return value.toFixed(decimals);
}

function fmtPercent(value: number | null, decimals = 2, sign = false): string {
  if (value === null) return "N/A";
  const prefix = sign && value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(decimals)}%`;
}

function rsiTag(value: number | null): string {
  if (value === null) return "N/A";
  if (value >= 70) return `${value.toFixed(1)} (과매수 ⚠️)`;
  if (value <= 30) return `${value.toFixed(1)} (과매도 ⚠️)`;
  return `${value.toFixed(1)} (중립)`;
}

export function formatPreCheck(result: PreCheckResult): string {
  const sideLabel = result.side === "long" ? "롱" : "숏";
  const lines: string[] = [];
  lines.push(`📋 진입 점검: ${result.baseAsset} ${sideLabel}`);
  lines.push("━━━━━━━━━━━━");
  lines.push(
    `💰 진입: ${fmtMoney(result.entryPrice)} | 손절: ${fmtMoney(result.stopLoss)} | 목표: ${fmtMoney(result.takeProfit)}${result.autoSuggested ? " (자동 제안)" : ""}`,
  );
  lines.push(`📐 손익비: 1:${fmtNum(result.riskReward)}`);
  if (result.positionQty !== null && result.positionNotional !== null) {
    const qtyDecimals = result.positionQty < 1 ? 4 : 2;
    lines.push(
      `📊 포지션: ${result.positionQty.toFixed(qtyDecimals)} ${result.baseAsset} (${fmtMoney(result.positionNotional)}) — 계좌 ${result.riskPercent}% 리스크`,
    );
  } else {
    lines.push(`📊 포지션: 계산 불가 (손절가 확인 필요)`);
  }
  lines.push("");

  lines.push("📈 기술 지표 (1h)");
  lines.push(`• RSI(1h): ${rsiTag(result.rsi1h)}`);
  lines.push(`• RSI(4h): ${rsiTag(result.rsi4h)}`);
  lines.push(`• BB: ${result.bbPosition ?? "N/A"}`);
  if (result.currentPrice !== null) {
    const gap = result.entryGapPercent;
    const gapText = gap === null ? "" : ` (진입까지 ${fmtPercent(-gap, 2, true)})`;
    lines.push(`• 현재가: ${fmtMoney(result.currentPrice)}${gapText}`);
  } else {
    lines.push(`• 현재가: N/A`);
  }
  lines.push("");

  lines.push("💹 시장 데이터");
  lines.push(`• 펀딩비: ${fmtPercent(result.fundingRatePercent, 3, true)}`);
  lines.push(`• 24h 거래량: ${fmtPercent(result.volumeChangePercent, 1, true)}`);
  lines.push(`• 김프: ${fmtPercent(result.kimchiPremiumPercent, 2, true)}`);
  lines.push("");

  lines.push("🛡 Risk Guard");
  lines.push(
    `• 오늘 손익: ${fmtPercent(result.riskGuard.dailyPnlPercent, 2, true)} (한도 -${result.riskGuard.dailyLossLimitPercent}%)`,
  );
  lines.push(
    `• 연속 손실: ${result.riskGuard.consecutiveLosses}회 / 차단 ${result.riskGuard.consecutiveLossBlock}회`,
  );
  if (result.riskGuard.locked) {
    lines.push(`• 잠금: 🚫 ${result.riskGuard.lockReason ?? "수동 잠금"}`);
  }
  lines.push("━━━━━━━━━━━━");

  if (result.verdict === "block") {
    lines.push(`🚫 판정: 진입 차단`);
    result.reasons.forEach((r) => lines.push(`   - ${r}`));
  } else if (result.verdict === "warn") {
    lines.push(`⚠️ 판정: 주의`);
    result.warnings.forEach((w) => lines.push(`   - ${w}`));
  } else {
    lines.push(`✅ 판정: 진입 가능`);
  }

  if (result.notes.length > 0) {
    lines.push("");
    lines.push(`💡 참고:`);
    result.notes.forEach((n) => lines.push(`   - ${n}`));
  }

  return lines.join("\n");
}

const TICKER_RE = /\b([A-Z]{2,10})\b/;
const SIDE_LONG_RE = /(롱|매수|long|buy)/i;
const SIDE_SHORT_RE = /(숏|매도|short|sell)/i;

// 한글 코인명 → 영문 티커
const KOREAN_TICKER_MAP: Record<string, string> = {
  "비트코인": "BTC",
  "비트": "BTC",
  "이더리움": "ETH",
  "이더": "ETH",
  "솔라나": "SOL",
  "리플": "XRP",
  "도지코인": "DOGE",
  "도지": "DOGE",
  "에이다": "ADA",
  "바이낸스코인": "BNB",
  "비엔비": "BNB",
};

export type ParsedPreCheck = {
  symbol: string;
  side: PreCheckSide;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
} | null;

export function parsePreCheckMessage(message: string): ParsedPreCheck {
  const upper = message.toUpperCase();
  let ticker: string | null = null;
  const tickerMatch = upper.match(TICKER_RE);
  if (tickerMatch && !["RSI", "MACD", "BB", "ATR", "PF", "TA", "LG", "SK"].includes(tickerMatch[1])) {
    ticker = tickerMatch[1];
  }
  if (!ticker) {
    for (const [kor, eng] of Object.entries(KOREAN_TICKER_MAP)) {
      if (message.includes(kor)) {
        ticker = eng;
        break;
      }
    }
  }
  if (!ticker) return null;

  let side: PreCheckSide | null = null;
  if (SIDE_SHORT_RE.test(message)) side = "short";
  else if (SIDE_LONG_RE.test(message)) side = "long";
  if (!side) return null;

  const slMatch = message.match(/손절\s*([0-9][0-9,\.]*)/);
  const tpMatch = message.match(/(목표|익절)\s*([0-9][0-9,\.]*)/);

  // 진입가: 손절/목표 키워드 앞쪽에 있는 숫자, 또는 첫 번째 숫자
  let entryPrice: number | null = null;
  // 진입 키워드가 명시적으로 있으면 우선 사용
  const entryExplicit = message.match(/(진입|entry)\s*([0-9][0-9,\.]*)/i);
  if (entryExplicit) {
    entryPrice = Number(entryExplicit[2].replace(/,/g, ""));
  } else {
    // side 단어 뒤 숫자
    const sideRe = new RegExp(`(?:${SIDE_SHORT_RE.source}|${SIDE_LONG_RE.source})\\s*([0-9][0-9,\\.]*)`, "i");
    const m = message.match(sideRe);
    if (m) {
      // 마지막 캡처 그룹이 숫자
      const numStr = m[m.length - 1];
      if (numStr) entryPrice = Number(numStr.replace(/,/g, ""));
    }
    if (entryPrice === null) {
      // 첫 번째 등장 숫자를 진입가로 추정 (단, 손절/목표 키워드 직후 숫자는 제외)
      const firstNumMatch = message.match(/([0-9][0-9,\.]*)/);
      if (firstNumMatch) {
        entryPrice = Number(firstNumMatch[1].replace(/,/g, ""));
      }
    }
  }

  if (entryPrice === null || !Number.isFinite(entryPrice) || entryPrice <= 0) return null;

  const stopLoss = slMatch ? Number(slMatch[1].replace(/,/g, "")) : undefined;
  const takeProfit = tpMatch ? Number(tpMatch[2].replace(/,/g, "")) : undefined;

  return {
    symbol: ticker,
    side,
    entryPrice,
    stopLoss: stopLoss && Number.isFinite(stopLoss) ? stopLoss : undefined,
    takeProfit: takeProfit && Number.isFinite(takeProfit) ? takeProfit : undefined,
  };
}
