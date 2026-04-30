import fs from "node:fs/promises";
import path from "node:path";
import { taEngine } from "../trading/technicalAnalysis.ts";
import { riskGuard } from "../trading/riskGuard.ts";
import { searchWiki } from "../wiki/wikiStore.ts";
import { getRecentDisclosures } from "../finance/dartAPI.ts";

const KIMCHI_FX_RATE = 1380;

export type MarketSnapshot = {
  symbol: string;
  currentPrice: number | null;
  priceChangePercent: number | null;
  rsi1h: number | null;
  rsi4h: number | null;
  fundingRatePercent: number | null;
  kimchiPremiumPercent: number | null;
  volume24h: number | null;
  notes: string[];
};

export type WikiDigestItem = {
  title: string;
  bodyPreview: string;
  categories: string[];
  date: string;
};

export type WikiDigest = {
  items: WikiDigestItem[];
};

export type DartDigestItem = {
  corpName: string;
  reportName: string;
  reportDate: string;
  receiptNo: string;
  filerName: string;
  matchedKeyword?: string;
};

export type DartDigest = {
  startDate: string;
  endDate: string;
  items: DartDigestItem[];
};

export type RiskGuardSnapshot = {
  dailyPnlPercent: number;
  dailyLossLimitPercent: number;
  consecutiveLosses: number;
  consecutiveLossBlock: number;
  locked: boolean;
  lockReason?: string;
};

export type BriefingArchiveInput = {
  dateKey: string;
  text: string;
  trigger: "cron" | "manual";
};

type Ticker24h = {
  lastPrice: number | null;
  priceChangePercent: number | null;
  quoteVolume: number | null;
};

type UpbitTicker = {
  tradePrice: number | null;
};

type DARTDisclosure = {
  corpName: string;
  reportName: string;
  reportDate: string;
  receiptNo: string;
  filerName: string;
};

function toKstDate(date: Date): Date {
  return new Date(date.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

function toIsoDateKey(date: Date): string {
  const kst = toKstDate(date);
  const year = kst.getFullYear();
  const month = String(kst.getMonth() + 1).padStart(2, "0");
  const day = String(kst.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function previousKstDateKey(date: Date): string {
  return toIsoDateKey(new Date(date.getTime() - 24 * 60 * 60 * 1000));
}

function safeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson<T>(url: string, label: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[briefingSources] ${label} HTTP error:`, response.status, response.statusText);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error(`[briefingSources] ${label} fetch error:`, error);
    return null;
  }
}

type OhlcvPoint = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

async function fetchBinanceCandles(baseAsset: string, interval: string, limit: number): Promise<OhlcvPoint[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${baseAsset}USDT&interval=${interval}&limit=${limit}`;
  const data = await fetchJson<unknown[]>(url, "Binance candles");
  if (!Array.isArray(data)) return [];
  return data
    .filter(Array.isArray)
    .map((candle) => {
      const values = candle as unknown[];
      return {
        timestamp: Number(values[0] ?? 0),
        open: Number(values[1] ?? 0),
        high: Number(values[2] ?? 0),
        low: Number(values[3] ?? 0),
        close: Number(values[4] ?? 0),
        volume: Number(values[5] ?? 0),
      };
    });
}

async function fetchBinanceTicker24h(baseAsset: string): Promise<Ticker24h> {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${baseAsset}USDT`;
  const data = await fetchJson<Record<string, unknown>>(url, "Binance 24h ticker");
  if (!data) {
    return { lastPrice: null, priceChangePercent: null, quoteVolume: null };
  }

  return {
    lastPrice: safeNumber(data.lastPrice),
    priceChangePercent: safeNumber(data.priceChangePercent),
    quoteVolume: safeNumber(data.quoteVolume),
  };
}

async function fetchBinanceFundingRate(baseAsset: string): Promise<number | null> {
  const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${baseAsset}USDT&limit=1`;
  const data = await fetchJson<unknown[]>(url, "Binance funding rate");
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  if (!first || typeof first !== "object") return null;
  const rate = safeNumber((first as Record<string, unknown>).fundingRate);
  return rate === null ? null : rate * 100;
}

async function fetchUpbitTicker(baseAsset: string): Promise<UpbitTicker> {
  const url = `https://api.upbit.com/v1/ticker?markets=KRW-${baseAsset}`;
  const data = await fetchJson<unknown[]>(url, "Upbit ticker");
  if (!Array.isArray(data) || data.length === 0) {
    return { tradePrice: null };
  }
  const first = data[0];
  if (!first || typeof first !== "object") {
    return { tradePrice: null };
  }
  return { tradePrice: safeNumber((first as Record<string, unknown>).trade_price) };
}

function getKstRange(now: Date): { dateKey: string; previousDateKey: string } {
  const dateKey = toIsoDateKey(now);
  return { dateKey, previousDateKey: previousKstDateKey(now) };
}

function formatKstDateKey(date: Date): string {
  return toIsoDateKey(date);
}

export async function collectMarketSnapshot(): Promise<MarketSnapshot> {
  const baseAsset = "BTC";
  const notes: string[] = [];
  const [ticker, fundingRatePercent, upbitTicker, candles1h, candles4h] = await Promise.all([
    fetchBinanceTicker24h(baseAsset),
    fetchBinanceFundingRate(baseAsset),
    fetchUpbitTicker(baseAsset),
    fetchBinanceCandles(baseAsset, "1h", 200),
    fetchBinanceCandles(baseAsset, "4h", 200),
  ]);

  let rsi1h: number | null = null;
  let rsi4h: number | null = null;

  if (candles1h.length >= 30) {
    const analysis = taEngine.analyzeSymbol(candles1h);
    rsi1h = analysis.rsi.value;
  } else {
    notes.push("1h 캔들 데이터가 부족합니다.");
  }

  if (candles4h.length >= 30) {
    const analysis = taEngine.analyzeSymbol(candles4h);
    rsi4h = analysis.rsi.value;
  } else {
    notes.push("4h 캔들 데이터가 부족합니다.");
  }

  const currentPrice = ticker.lastPrice;
  const volume24h = ticker.quoteVolume;

  let kimchiPremiumPercent: number | null = null;
  if (currentPrice !== null && upbitTicker.tradePrice !== null && currentPrice > 0) {
    const binanceKrw = currentPrice * KIMCHI_FX_RATE;
    kimchiPremiumPercent = ((upbitTicker.tradePrice - binanceKrw) / binanceKrw) * 100;
  }

  if (currentPrice === null) {
    notes.push("Binance 현재가를 가져오지 못했습니다.");
  }

  return {
    symbol: baseAsset,
    currentPrice,
    priceChangePercent: ticker.priceChangePercent,
    rsi1h,
    rsi4h,
    fundingRatePercent,
    kimchiPremiumPercent,
    volume24h,
    notes,
  };
}

export async function collectRiskGuardSnapshot(): Promise<RiskGuardSnapshot> {
  const state = await riskGuard.getStatus();
  return {
    dailyPnlPercent: state.dailyPnlPercent,
    dailyLossLimitPercent: state.settings.dailyLossLimitPercent,
    consecutiveLosses: state.consecutiveLosses,
    consecutiveLossBlock: state.settings.consecutiveLossBlock,
    locked: state.manualLock.locked,
    lockReason: state.manualLock.reason ?? undefined,
  };
}

export async function collectWikiDigest(now: Date = new Date()): Promise<WikiDigest> {
  const targetDate = previousKstDateKey(now);

  try {
    const allEntries = await searchWiki({ query: "", limit: 500 });
    const items = allEntries.results
      .filter((result) => {
        if (!result.entry.date) return false;
        const categories = result.entry.categories.map((category) => category.toLowerCase());
        if (categories.includes("briefing") || result.entry.source === "morning-briefing") {
          return false;
        }
        return formatKstDateKey(new Date(result.entry.date)) === targetDate;
      })
      .map((result) => ({
        title: result.entry.title,
        bodyPreview: result.entry.body,
        categories: result.entry.categories.length > 0 ? result.entry.categories : ["uncategorized"],
        date: result.entry.date,
      }));

    return { items };
  } catch (error) {
    console.error("[briefingSources] wiki digest error:", error);
    return { items: [] };
  }
}

function scoreDartDisclosure(disclosure: DARTDisclosure, keywords: string[]): number {
  let score = 0;
  for (const keyword of keywords) {
    if (
      disclosure.corpName.includes(keyword) ||
      disclosure.reportName.includes(keyword) ||
      disclosure.filerName.includes(keyword)
    ) {
      score += 1;
    }
  }
  return score;
}

export async function collectDartDigest(now: Date = new Date()): Promise<DartDigest> {
  const { dateKey: endDate, previousDateKey: startDate } = getKstRange(now);
  const keywords = [
    "부동산",
    "PF",
    "프로젝트",
    "투자",
    "자산",
    "유상증자",
    "전환사채",
    "교환사채",
    "자사주",
    "배당",
    "소송",
    "감자",
    "합병",
  ];

  try {
    const disclosures = await getRecentDisclosures(undefined, startDate.replace(/-/g, ""), endDate.replace(/-/g, ""));
    if (!Array.isArray(disclosures)) {
      return { startDate, endDate, items: [] };
    }

    const items = disclosures
      .map((item) => {
        const matchedKeyword = keywords.find(
          (keyword) =>
            item.corpName.includes(keyword) || item.reportNm.includes(keyword) || item.flrNm.includes(keyword)
        );

        return {
          corpName: item.corpName,
          reportName: item.reportNm,
          reportDate: item.rceptDt,
          receiptNo: item.rceptNo,
          filerName: item.flrNm,
          matchedKeyword,
        };
      })
      .sort((a, b) => {
        const scoreDiff = scoreDartDisclosure(b, keywords) - scoreDartDisclosure(a, keywords);
        if (scoreDiff !== 0) return scoreDiff;
        return b.reportDate.localeCompare(a.reportDate);
      })
      .slice(0, 5);

    return { startDate, endDate, items };
  } catch (error) {
    console.error("[briefingSources] dart digest error:", error);
    return { startDate, endDate, items: [] };
  }
}

export async function saveBriefingArchive(input: BriefingArchiveInput): Promise<string | null> {
  const root = process.env.WIKI_ROOT;
  if (!root) {
    console.error("[briefingSources] WIKI_ROOT is not configured");
    return null;
  }

  try {
    const dailyDir = path.join(root, "daily");
    await fs.mkdir(dailyDir, { recursive: true });

    const filePath = path.join(dailyDir, `${input.dateKey}-briefing.md`);
    const content = `---\nid: ${input.dateKey}-briefing\ndate: ${input.dateKey}\ntitle: ${input.dateKey} briefing\ncategories: [briefing]\nsource: morning-briefing\ntrigger: ${input.trigger}\n---\n\n${input.text}\n`;
    await fs.writeFile(filePath, content, "utf-8");
    return filePath;
  } catch (error) {
    console.error("[briefingSources] save briefing archive error:", error);
    return null;
  }
}
