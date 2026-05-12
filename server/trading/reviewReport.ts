import { taEngine, type OhlcvCandle } from "./technicalAnalysis.ts";
import { riskGuard } from "./riskGuard.ts";

const KIMCHI_FX_RATE = 1380;
const DEFAULT_SYMBOL = "BTC";

export type ReviewSide = "long" | "short" | "neutral";
export type ReviewMoney = { value: number; currency: "KRW" | "USD"; ambiguous?: boolean };
export type ReviewQuantity = { symbol: string; value: number };

export type ReviewIntentInput = {
  symbol: string;
  side: ReviewSide;
  leverage?: number;
  money?: ReviewMoney;
  quantity?: ReviewQuantity;
  notes: string[];
};

export type TimeframeReport = {
  timeframe: "1h" | "4h" | "1d";
  rsi: number | null;
  bbPositionPercent: number | null;
  bbLabel: string;
  macdHistogram: number | null;
  close: number | null;
};

export type ReviewChecklistItem = {
  label: string;
  status: "ok" | "warn" | "block";
  detail: string;
};

export type ReviewReport = {
  input: ReviewIntentInput;
  currentPrice: number | null;
  priceChange24hPercent: number | null;
  quoteVolume24h: number | null;
  timeframes: TimeframeReport[];
  volumeSpikeRatio: number | null;
  funding: {
    latestPercent: number | null;
    avg4Percent: number | null;
    avg24Percent: number | null;
  };
  kimchiPremiumPercent: number | null;
  kimchiPremiumChange24h: number | null;
  riskGuard: {
    dailyPnlPercent: number;
    dailyLossLimitPercent: number;
    consecutiveLosses: number;
    consecutiveLossBlock: number;
    locked: boolean;
    lockReason?: string;
  };
  liquidationPrice: number | null;
  checklist: ReviewChecklistItem[];
  verdict: "good" | "caution" | "avoid";
  notes: string[];
};

const KOREAN_TICKER_MAP: Record<string, string> = {
  비트코인: "BTC",
  비트: "BTC",
  이더리움: "ETH",
  이더: "ETH",
  솔라나: "SOL",
  리플: "XRP",
  도지코인: "DOGE",
  도지: "DOGE",
  에이다: "ADA",
  비엔비: "BNB",
  바이낸스코인: "BNB",
};

function safeNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSymbol(raw: string | undefined): string {
  const upper = (raw || DEFAULT_SYMBOL).toUpperCase().replace("KRW-", "").replace("/USDT", "").trim();
  return upper || DEFAULT_SYMBOL;
}

// 거래 분석 대상으로 인식할 명시적 crypto ticker 화이트리스트.
// 메이저 + 회장님이 자주 쓰는 알트만 등록. 부동산/회사 약어(PFV/SPC/REIT/SI)와 충돌하지 않음.
const KNOWN_CRYPTO_TICKERS = new Set([
  "BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "BNB", "USDT", "USDC",
  "TRX", "MATIC", "POL", "LINK", "AVAX", "DOT", "TON", "SHIB", "LTC",
  "BCH", "NEAR", "ATOM", "ARB", "OP", "APT", "SUI", "INJ", "TIA",
]);

// P0 (2026-05-12): 명시적 crypto ticker (영문 화이트리스트 또는 한글 매핑) 가 없으면 null 반환.
// "파일 검토", "PF 검토" 등 도메인 무관 "검토" 문장이 BTC fallback 으로 폭주하던 버그 차단.
function findExplicitCryptoSymbol(message: string): string | null {
  const upper = message.toUpperCase();
  const re = /\b([A-Z]{2,10})\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(upper)) !== null) {
    if (KNOWN_CRYPTO_TICKERS.has(match[1])) return match[1];
  }
  for (const [kor, eng] of Object.entries(KOREAN_TICKER_MAP)) {
    if (message.includes(kor)) return eng;
  }
  return null;
}

function parseLeverage(message: string): number | undefined {
  const match = message.match(/([0-9]{1,3}(?:\.\d+)?)\s*배/);
  if (!match) return undefined;
  const leverage = Number(match[1]);
  if (!Number.isFinite(leverage)) return undefined;
  return Math.min(125, Math.max(1, leverage));
}

function parseMoneyAndQuantity(message: string, symbol: string): Pick<ReviewIntentInput, "money" | "quantity" | "notes"> {
  const notes: string[] = [];
  const normalized = message.replace(/,/g, "");
  const quantityRe = new RegExp(`([0-9]+(?:\\.\\d+)?)\\s*(${symbol}|BTC|ETH|SOL|XRP|DOGE|ADA|BNB)\\b`, "i");
  const quantityMatch = normalized.match(quantityRe);
  if (quantityMatch) {
    return {
      quantity: { value: Number(quantityMatch[1]), symbol: quantityMatch[2].toUpperCase() },
      notes,
    };
  }

  const explicitMoney = normalized.match(/(?:₩|￦)?\s*([0-9]+(?:\.\d+)?)\s*(억원|억|만원|원|KRW|달러|USD|\$)/i);
  if (explicitMoney) {
    const raw = Number(explicitMoney[1]);
    const unit = explicitMoney[2].toLowerCase();
    if (unit === "억원" || unit === "억") return { money: { value: raw * 100_000_000, currency: "KRW" }, notes };
    if (unit === "만원") return { money: { value: raw * 10_000, currency: "KRW" }, notes };
    if (unit === "원" || unit === "krw") return { money: { value: raw, currency: "KRW" }, notes };
    return {
      money: { value: raw, currency: "USD" },
      notes: ["USD 금액은 환산하지 않고 표시만 합니다. 실제 주문 금액은 원화 기준으로 별도 확인이 필요합니다."],
    };
  }

  const withoutLeverage = normalized.replace(/[0-9]+(?:\.\d+)?\s*배/g, "");
  const ambiguous = withoutLeverage.match(/([0-9]{4,}(?:\.\d+)?)/);
  if (ambiguous) {
    notes.push("단위가 없는 숫자는 KRW로 가정했습니다. 예: 5만원, 0.01BTC, 500달러처럼 단위를 붙이면 정확도가 올라갑니다.");
    return { money: { value: Number(ambiguous[1]), currency: "KRW", ambiguous: true }, notes };
  }

  return { notes };
}

export function parseReviewMessage(message: string): ReviewIntentInput | null {
  const lower = message.toLowerCase();
  const compact = lower.replace(/\s+/g, "");
  const isReview =
    compact.includes("검토") ||
    compact.includes("매수적합") ||
    compact.includes("매도적합") ||
    compact.includes("들어가도되") ||
    compact.includes("진입해도되") ||
    compact.includes("괜찮") ||
    /^매[수도]\s*시뮬/i.test(message);
  if (!isReview) return null;

  // P0 가드 (2026-05-12): 명시적 crypto ticker 없으면 review 아님 — chat fallback 으로 위임.
  const explicitSymbol = findExplicitCryptoSymbol(message);
  if (!explicitSymbol) return null;

  const side: ReviewSide =
    /(숏|매도|short|sell)/i.test(message) ? "short" :
      /(롱|매수|long|buy)/i.test(message) ? "long" :
        "neutral";
  const symbol = normalizeSymbol(explicitSymbol);
  const leverage = parseLeverage(message);
  const parsed = parseMoneyAndQuantity(message, symbol);
  return { symbol, side, leverage, money: parsed.money, quantity: parsed.quantity, notes: parsed.notes };
}

async function fetchBinanceCandles(baseAsset: string, interval: "1h" | "4h" | "1d", limit: number): Promise<OhlcvCandle[]> {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${baseAsset}USDT&interval=${interval}&limit=${limit}`);
    if (!res.ok) {
      console.error(`[reviewReport] Binance candles HTTP error ${interval}:`, res.status, res.statusText);
      return [];
    }
    const data = (await res.json()) as unknown[][];
    return data.map((c) => [Number(c[0]), Number(c[1]), Number(c[2]), Number(c[3]), Number(c[4]), Number(c[5])] as OhlcvCandle);
  } catch (err) {
    console.error(`[reviewReport] fetchBinanceCandles(${baseAsset}, ${interval}) error:`, err);
    return [];
  }
}

async function fetchMarketTicker(baseAsset: string): Promise<{ price: number | null; change: number | null; quoteVolume: number | null }> {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${baseAsset}USDT`);
    if (!res.ok) {
      console.error("[reviewReport] Binance 24hr HTTP error:", res.status, res.statusText);
      return { price: null, change: null, quoteVolume: null };
    }
    const data = (await res.json()) as Record<string, unknown>;
    return {
      price: safeNumber(data.lastPrice),
      change: safeNumber(data.priceChangePercent),
      quoteVolume: safeNumber(data.quoteVolume),
    };
  } catch (err) {
    console.error("[reviewReport] Binance 24hr fetch error:", err);
    return { price: null, change: null, quoteVolume: null };
  }
}

async function fetchFunding(baseAsset: string): Promise<ReviewReport["funding"]> {
  try {
    const res = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${baseAsset}USDT&limit=24`);
    if (!res.ok) {
      console.error("[reviewReport] funding HTTP error:", res.status, res.statusText);
      return { latestPercent: null, avg4Percent: null, avg24Percent: null };
    }
    const data = (await res.json()) as Record<string, unknown>[];
    const rates = data.map((row) => safeNumber(row.fundingRate)).filter((n): n is number => n !== null);
    const avg = (items: number[]) => items.length ? (items.reduce((a, b) => a + b, 0) / items.length) * 100 : null;
    return {
      latestPercent: rates.length ? rates[rates.length - 1] * 100 : null,
      avg4Percent: avg(rates.slice(-4)),
      avg24Percent: avg(rates.slice(-24)),
    };
  } catch (err) {
    console.error("[reviewReport] funding fetch error:", err);
    return { latestPercent: null, avg4Percent: null, avg24Percent: null };
  }
}

async function fetchKimchi(baseAsset: string, currentPrice: number | null, binanceChange: number | null): Promise<{ premium: number | null; change: number | null }> {
  try {
    const res = await fetch(`https://api.upbit.com/v1/ticker?markets=KRW-${baseAsset}`);
    if (!res.ok) {
      console.error("[reviewReport] Upbit HTTP error:", res.status, res.statusText);
      return { premium: null, change: null };
    }
    const data = (await res.json()) as Record<string, unknown>[];
    const row = data[0];
    const upbitPrice = safeNumber(row?.trade_price);
    const upbitChange = safeNumber(row?.signed_change_rate);
    const premium = upbitPrice !== null && currentPrice !== null && currentPrice > 0
      ? ((upbitPrice - currentPrice * KIMCHI_FX_RATE) / (currentPrice * KIMCHI_FX_RATE)) * 100
      : null;
    const change = upbitChange !== null && binanceChange !== null ? upbitChange * 100 - binanceChange : null;
    return { premium, change };
  } catch (err) {
    console.error("[reviewReport] Upbit fetch error:", err);
    return { premium: null, change: null };
  }
}

function bbPercent(close: number | null, upper: number | null, lower: number | null): number | null {
  if (close === null || upper === null || lower === null || upper === lower) return null;
  return ((close - lower) / (upper - lower)) * 100;
}

function bbLabel(percent: number | null): string {
  if (percent === null) return "데이터 부족";
  if (percent >= 100) return "상단 돌파";
  if (percent >= 80) return "상단 근접";
  if (percent <= 0) return "하단 이탈";
  if (percent <= 20) return "하단 근접";
  return "밴드 내부";
}

function buildTimeframe(interval: "1h" | "4h" | "1d", candles: OhlcvCandle[], currentPrice: number | null): TimeframeReport {
  if (candles.length < 30) {
    return { timeframe: interval, rsi: null, bbPositionPercent: null, bbLabel: "데이터 부족", macdHistogram: null, close: null };
  }
  const analysis = taEngine.analyzeSymbol(candles, currentPrice ?? undefined);
  const close = currentPrice ?? analysis.close;
  const pct = bbPercent(close, analysis.bollingerBands.upper, analysis.bollingerBands.lower);
  return {
    timeframe: interval,
    rsi: analysis.rsi.value,
    bbPositionPercent: pct,
    bbLabel: bbLabel(pct),
    macdHistogram: interval === "1d" ? null : analysis.macd.histogram,
    close,
  };
}

function calcVolumeSpike(candles1h: OhlcvCandle[]): number | null {
  if (candles1h.length < 25) return null;
  const volumes = candles1h.map((c) => Array.isArray(c) ? c[5] : c.volume ?? 0);
  const latest = volumes[volumes.length - 1];
  const prev = volumes.slice(-25, -1);
  const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
  return avg > 0 ? latest / avg : null;
}

function status(label: string, statusValue: ReviewChecklistItem["status"], detail: string): ReviewChecklistItem {
  return { label, status: statusValue, detail };
}

function buildChecklist(report: Omit<ReviewReport, "checklist" | "verdict">): ReviewChecklistItem[] {
  const tf = report.timeframes;
  const overheat = tf.filter((t) => t.rsi !== null && t.rsi >= 70).length;
  const oversold = tf.filter((t) => t.rsi !== null && t.rsi <= 30).length;
  const rsiState = overheat >= 2 || oversold >= 2 ? "warn" : "ok";
  const fundingAbs = Math.max(Math.abs(report.funding.latestPercent ?? 0), Math.abs(report.funding.avg4Percent ?? 0));
  const kimchiAbs = Math.abs(report.kimchiPremiumPercent ?? 0);
  const riskBlocked = report.riskGuard.locked || report.riskGuard.dailyPnlPercent <= -report.riskGuard.dailyLossLimitPercent;
  const volatility = Math.abs(report.priceChange24hPercent ?? 0);
  return [
    status("RSI 과열", rsiState, overheat ? `${overheat}개 타임프레임 과매수` : oversold ? `${oversold}개 타임프레임 과매도` : "극단 구간 없음"),
    status("볼린저 위치", tf.some((t) => (t.bbPositionPercent ?? 50) >= 100 || (t.bbPositionPercent ?? 50) <= 0) ? "warn" : "ok", "1h/4h/1d 밴드 위치 확인"),
    status("펀딩비", fundingAbs >= 0.05 ? "warn" : "ok", `최근 ${fmtPercent(report.funding.latestPercent, 3)}`),
    status("김프", kimchiAbs >= 5 ? "warn" : "ok", `${fmtPercent(report.kimchiPremiumPercent, 2)} / 24h 변화 ${fmtPercent(report.kimchiPremiumChange24h, 2)}`),
    status("거래량", (report.volumeSpikeRatio ?? 0) >= 1.5 ? "ok" : "warn", `최근 1h가 24h 평균의 ${fmtNullable(report.volumeSpikeRatio, 2)}배`),
    status("Risk Guard", riskBlocked ? "block" : "ok", riskBlocked ? "잠금 또는 손실 한도 도달" : "차단 조건 없음"),
    status("24h 변동성", volatility >= 8 ? "warn" : "ok", `${fmtPercent(report.priceChange24hPercent, 2)}`),
  ];
}

function verdictFromChecklist(items: ReviewChecklistItem[]): ReviewReport["verdict"] {
  if (items.some((item) => item.status === "block")) return "avoid";
  const warnCount = items.filter((item) => item.status === "warn").length;
  if (warnCount >= 3) return "avoid";
  if (warnCount >= 1) return "caution";
  return "good";
}

export async function runReviewReport(input: ReviewIntentInput): Promise<ReviewReport> {
  const baseAsset = normalizeSymbol(input.symbol);
  const [ticker, candles1h, candles4h, candles1d, funding] = await Promise.all([
    fetchMarketTicker(baseAsset),
    fetchBinanceCandles(baseAsset, "1h", 200),
    fetchBinanceCandles(baseAsset, "4h", 200),
    fetchBinanceCandles(baseAsset, "1d", 220),
    fetchFunding(baseAsset),
  ]);
  const kimchi = await fetchKimchi(baseAsset, ticker.price, ticker.change);
  const guard = await riskGuard.getStatus();
  const riskState = {
    dailyPnlPercent: guard.dailyPnlPercent,
    dailyLossLimitPercent: guard.settings.dailyLossLimitPercent,
    consecutiveLosses: guard.consecutiveLosses,
    consecutiveLossBlock: guard.settings.consecutiveLossBlock,
    locked: guard.manualLock.locked,
    lockReason: guard.manualLock.reason,
  };
  const timeframes = [
    buildTimeframe("1h", candles1h, ticker.price),
    buildTimeframe("4h", candles4h, ticker.price),
    buildTimeframe("1d", candles1d, ticker.price),
  ];
  const liquidationPrice = input.leverage && ticker.price && input.side !== "neutral"
    ? input.side === "long" ? ticker.price * (1 - 1 / input.leverage) : ticker.price * (1 + 1 / input.leverage)
    : null;
  const baseReport = {
    input: { ...input, symbol: baseAsset },
    currentPrice: ticker.price,
    priceChange24hPercent: ticker.change,
    quoteVolume24h: ticker.quoteVolume,
    timeframes,
    volumeSpikeRatio: calcVolumeSpike(candles1h),
    funding,
    kimchiPremiumPercent: kimchi.premium,
    kimchiPremiumChange24h: kimchi.change,
    riskGuard: riskState,
    liquidationPrice,
    notes: input.notes,
  };
  const checklist = buildChecklist(baseReport);
  return { ...baseReport, checklist, verdict: verdictFromChecklist(checklist) };
}

function fmtNullable(value: number | null, decimals = 2): string {
  return value === null ? "N/A" : value.toFixed(decimals);
}

function fmtPercent(value: number | null, decimals = 2): string {
  if (value === null) return "N/A";
  return `${value > 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

function fmtUsd(value: number | null): string {
  if (value === null) return "N/A";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtKrw(value: number | null): string {
  if (value === null) return "N/A";
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function statusIcon(item: ReviewChecklistItem): string {
  if (item.status === "ok") return "✅";
  if (item.status === "warn") return "⚠️";
  return "🚫";
}

export function formatReviewReport(report: ReviewReport): string {
  const sideText = report.input.side === "long" ? "롱" : report.input.side === "short" ? "숏" : "중립";
  const verdict = report.verdict === "good" ? "🟢 양호" : report.verdict === "caution" ? "🟡 주의" : "🔴 비추천";
  const lines = [
    `📋 검토 리포트: ${report.input.symbol} ${sideText}`,
    "━━━━━━━━━━━━",
    `💰 현재가: ${fmtUsd(report.currentPrice)} / 24h ${fmtPercent(report.priceChange24hPercent, 2)}`,
  ];
  if (report.input.money) {
    lines.push(`💵 요청 금액: ${report.input.money.currency === "KRW" ? fmtKrw(report.input.money.value) : fmtUsd(report.input.money.value)}${report.input.money.ambiguous ? " (KRW 가정)" : ""}`);
  }
  if (report.input.quantity) lines.push(`📦 요청 수량: ${report.input.quantity.value} ${report.input.quantity.symbol}`);
  if (report.input.leverage) {
    lines.push(`⚙️ 레버리지: ${report.input.leverage}배 / 단순 청산 추정가: ${fmtUsd(report.liquidationPrice)}`);
  }
  lines.push("");
  lines.push("📈 멀티 타임프레임");
  for (const tf of report.timeframes) {
    const macd = tf.macdHistogram === null ? "" : ` / MACD ${fmtNullable(tf.macdHistogram, 4)}`;
    lines.push(`• ${tf.timeframe}: RSI ${fmtNullable(tf.rsi, 1)} / BB ${fmtNullable(tf.bbPositionPercent, 1)}% (${tf.bbLabel})${macd}`);
  }
  lines.push("");
  lines.push("💹 시장 데이터");
  lines.push(`• 거래량 스파이크: ${fmtNullable(report.volumeSpikeRatio, 2)}배`);
  lines.push(`• 펀딩비: 최근 ${fmtPercent(report.funding.latestPercent, 3)} / 4회 ${fmtPercent(report.funding.avg4Percent, 3)} / 24회 ${fmtPercent(report.funding.avg24Percent, 3)}`);
  lines.push(`• 김프: ${fmtPercent(report.kimchiPremiumPercent, 2)} / 24h 변화 ${fmtPercent(report.kimchiPremiumChange24h, 2)}`);
  lines.push("");
  lines.push("🛡 Risk Guard");
  lines.push(`• 오늘 손익: ${fmtPercent(report.riskGuard.dailyPnlPercent, 2)} / 한도 -${report.riskGuard.dailyLossLimitPercent}%`);
  lines.push(`• 연속 손실: ${report.riskGuard.consecutiveLosses}회 / 차단 ${report.riskGuard.consecutiveLossBlock}회`);
  lines.push(`• 잠금: ${report.riskGuard.locked ? `🚫 ${report.riskGuard.lockReason ?? "수동 잠금"}` : "해제"}`);
  lines.push("");
  lines.push("📌 의사결정 체크리스트");
  report.checklist.forEach((item) => lines.push(`${statusIcon(item)} ${item.label}: ${item.detail}`));
  lines.push("━━━━━━━━━━━━");
  lines.push(`종합 판정: ${verdict}`);
  lines.push("참고: 손절가/목표가는 회장님이 직접 결정하십시오. 이 리포트는 수치 기반 검토 자료이며 매수/매도 추천이 아닙니다.");
  if (report.notes.length > 0) {
    lines.push("");
    lines.push("💡 입력 해석");
    report.notes.forEach((note) => lines.push(`• ${note}`));
  }
  return lines.join("\n");
}
