import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart, CandlestickSeries, ColorType,
  type IChartApi, type ISeriesApi, type CandlestickData, type UTCTimestamp,
} from "lightweight-charts";
import { LineChart, Search } from "lucide-react";

// ── Tab ───────────────────────────────────────────────────────────────────────

type MarketTab = "coin" | "kr" | "us" | "futures";

const TABS: { id: MarketTab; label: string }[] = [
  { id: "coin",    label: "코인"    },
  { id: "kr",      label: "한국주식" },
  { id: "us",      label: "미국주식" },
  { id: "futures", label: "선물/지수" },
];

// ── Presets ───────────────────────────────────────────────────────────────────

type CoinPreset  = { label: string; tvSymbol: string; binanceSymbol: string };
type YahooPreset = { label: string; symbol: string };

const COIN_PRESETS: CoinPreset[] = [
  { label: "BTC/USDT",  tvSymbol: "BINANCE:BTCUSDT",  binanceSymbol: "BTCUSDT"  },
  { label: "ETH/USDT",  tvSymbol: "BINANCE:ETHUSDT",  binanceSymbol: "ETHUSDT"  },
  { label: "SOL/USDT",  tvSymbol: "BINANCE:SOLUSDT",  binanceSymbol: "SOLUSDT"  },
  { label: "BNB/USDT",  tvSymbol: "BINANCE:BNBUSDT",  binanceSymbol: "BNBUSDT"  },
  { label: "XRP/USDT",  tvSymbol: "BINANCE:XRPUSDT",  binanceSymbol: "XRPUSDT"  },
  { label: "DOGE/USDT", tvSymbol: "BINANCE:DOGEUSDT", binanceSymbol: "DOGEUSDT" },
];

const KR_PRESETS: YahooPreset[] = [
  { label: "삼성전자",       symbol: "005930.KS" },
  { label: "SK하이닉스",    symbol: "000660.KS" },
  { label: "NAVER",          symbol: "035420.KS" },
  { label: "카카오",         symbol: "035720.KS" },
  { label: "현대차",         symbol: "005380.KS" },
  { label: "LG에너지솔루션", symbol: "373220.KS" },
];

const US_PRESETS: YahooPreset[] = [
  { label: "AAPL",  symbol: "AAPL"  },
  { label: "MSFT",  symbol: "MSFT"  },
  { label: "GOOGL", symbol: "GOOGL" },
  { label: "AMZN",  symbol: "AMZN"  },
  { label: "NVDA",  symbol: "NVDA"  },
  { label: "TSLA",  symbol: "TSLA"  },
  { label: "META",  symbol: "META"  },
];

const FUTURES_PRESETS: YahooPreset[] = [
  { label: "나스닥100", symbol: "^IXIC"  },
  { label: "S&P500",    symbol: "^GSPC"  },
  { label: "다우존스",  symbol: "^DJI"   },
  { label: "금",        symbol: "GC=F"   },
  { label: "원유",      symbol: "CL=F"   },
  { label: "달러/원",   symbol: "KRW=X"  },
];

// ── Yahoo Finance timeframes ───────────────────────────────────────────────────

type YahooTF = "1d" | "5d" | "1wk" | "1mo";

const YAHOO_TFS: YahooTF[] = ["1d", "5d", "1wk", "1mo"];

const TF_YAHOO: Record<YahooTF, { interval: string; range: string }> = {
  "1d":  { interval: "1d",  range: "6mo" },
  "5d":  { interval: "1d",  range: "1y"  },
  "1wk": { interval: "1wk", range: "2y"  },
  "1mo": { interval: "1mo", range: "5y"  },
};

// ── Yahoo Finance API types ────────────────────────────────────────────────────

type YahooResponse = {
  chart: {
    result?: Array<{
      meta: {
        regularMarketPrice: number;
        chartPreviousClose: number;
        currency: string;
      };
      timestamp?: number[];
      indicators: {
        quote: Array<{
          open:  (number | null)[];
          high:  (number | null)[];
          low:   (number | null)[];
          close: (number | null)[];
        }>;
      };
    }>;
    error?: { message: string };
  };
};

async function fetchYahooChart(symbol: string, interval: string, range: string): Promise<YahooResponse> {
  const url = `/api/yahoo-chart?symbol=${encodeURIComponent(symbol)}&interval=${interval}&range=${range}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<YahooResponse>;
}

// ── Indicator helpers ──────────────────────────────────────────────────────────

type TechResult = {
  rsi:  number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  bb:   { upper: number; middle: number; lower: number } | null;
};

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function calcRsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}

function calcMacd(closes: number[]): TechResult["macd"] {
  if (closes.length < 35) return null;
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const macdLine = e12.map((v, i) => v - e26[i]);
  const signal = ema(macdLine.slice(25), 9);
  const m = macdLine[macdLine.length - 1];
  const s = signal[signal.length - 1];
  return { macd: m, signal: s, histogram: m - s };
}

function calcBB(closes: number[], period = 20): TechResult["bb"] {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std  = Math.sqrt(slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period);
  return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std };
}

// ── TradingView widget ─────────────────────────────────────────────────────────

function TradingViewWidget({ tvSymbol }: { tvSymbol: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 심볼 전환 시 즉시 로딩 상태로 — 깜빡임 방지
    setIsLoading(true);

    const script = document.createElement("script");
    script.src  = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type  = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: false, height: 700, symbol: tvSymbol, interval: "60",
      timezone: "Asia/Seoul", theme: "dark", style: "1", locale: "kr",
      allow_symbol_change: true, calendar: false,
      studies: ["RSI@tv-basicstudies", "MACD@tv-basicstudies", "BB@tv-basicstudies"],
      hide_side_toolbar: false, support_host: "https://www.tradingview.com",
    });
    el.appendChild(script);

    // iframe 등장 감지 → 로딩 오버레이 페이드아웃
    const observer = new MutationObserver(() => {
      if (el.querySelector("iframe")) {
        setIsLoading(false);
        observer.disconnect();
      }
    });
    observer.observe(el, { childList: true, subtree: true });

    // 안전장치: 5초 경과 시 무조건 해제
    const safetyTimer = setTimeout(() => setIsLoading(false), 5000);

    return () => {
      observer.disconnect();
      clearTimeout(safetyTimer);
      el.innerHTML = "";
    };
  }, [tvSymbol]);

  return (
    <div className="relative" style={{ height: 700, width: "100%" }}>
      <div ref={ref} className="tradingview-widget-container" style={{ height: 700, width: "100%" }}>
        <div className="tradingview-widget-container__widget" style={{ height: "100%", width: "100%" }} />
      </div>
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-slate-900/60 backdrop-blur-sm pointer-events-none">
          <div className="flex items-center gap-2 text-cyan-300">
            <div className="h-3 w-3 rounded-full bg-cyan-400 animate-pulse" />
            <div className="h-3 w-3 rounded-full bg-cyan-400 animate-pulse [animation-delay:150ms]" />
            <div className="h-3 w-3 rounded-full bg-cyan-400 animate-pulse [animation-delay:300ms]" />
          </div>
          <div className="text-sm font-medium text-slate-300">{tvSymbol} 차트 로딩 중...</div>
        </div>
      )}
    </div>
  );
}

// ── Binance price bar (coin tab) ───────────────────────────────────────────────

function BinancePriceBar({ sym }: { sym: string }) {
  const [info, setInfo] = useState<{ price: number; change24h: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch24h = useCallback(async (s: string) => {
    try {
      const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`);
      if (!r.ok) return;
      const d = (await r.json()) as { lastPrice: string; priceChangePercent: string };
      setInfo({ price: parseFloat(d.lastPrice), change24h: parseFloat(d.priceChangePercent) });
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    setInfo(null);
    void fetch24h(sym);
    timer.current = setInterval(() => void fetch24h(sym), 5_000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [sym, fetch24h]);

  if (!info) return null;
  const up = info.change24h >= 0;
  return (
    <div className="flex items-center gap-4 rounded-lg bg-white/5 px-4 py-2 text-sm">
      <span className="font-bold text-white">${info.price.toLocaleString("en-US", { maximumFractionDigits: 4 })}</span>
      <span className={up ? "text-green-400" : "text-red-400"}>{up ? "+" : ""}{info.change24h.toFixed(2)}% (24h)</span>
      <span className="text-xs text-slate-500">Binance · 5초 갱신</span>
    </div>
  );
}

// ── Yahoo chart (lightweight-charts) ──────────────────────────────────────────

interface YahooChartProps {
  presets:       YahooPreset[];
  symbolSuffix?: string;  // ".KS" for KR stocks
  useKst?:       boolean;
}

function YahooChart({ presets, symbolSuffix = "", useKst = false }: YahooChartProps) {
  const [activeSymbol, setActiveSymbol] = useState(presets[0].symbol);
  const [customInput,  setCustomInput]  = useState("");
  const [timeframe,    setTimeframe]    = useState<YahooTF>("1d");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [priceInfo,    setPriceInfo]    = useState<{ current: number; prevClose: number; currency: string } | null>(null);
  const [tech,         setTech]         = useState<TechResult | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef          = useRef<IChartApi | null>(null);
  const seriesRef         = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // init chart once
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8", fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        vertLine: { color: "rgba(6,182,212,0.4)", labelBackgroundColor: "#0e7490" },
        horzLine: { color: "rgba(6,182,212,0.4)", labelBackgroundColor: "#0e7490" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
      width: chartContainerRef.current.clientWidth,
      height: 700,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#00c853", downColor: "#ff1744",
      borderUpColor: "#00c853", borderDownColor: "#ff1744",
      wickUpColor: "#00c853", wickDownColor: "#ff1744",
    });
    chartRef.current  = chart;
    seriesRef.current = series;
    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth });
    });
    ro.observe(chartContainerRef.current);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, []);

  const loadData = useCallback(async (sym: string, tf: YahooTF) => {
    setLoading(true);
    setError(null);
    const { interval, range } = TF_YAHOO[tf];
    try {
      const data   = await fetchYahooChart(sym, interval, range);
      const result = data.chart.result?.[0];
      if (!result?.timestamp) throw new Error(data.chart.error?.message ?? "데이터 없음");

      const { timestamp, indicators, meta } = result;
      const quote   = indicators.quote[0];
      const KST_OFF = useKst ? 9 * 3600 : 0;
      const candles: CandlestickData[] = [];
      for (let i = 0; i < timestamp.length; i++) {
        const o = quote.open[i], h = quote.high[i], l = quote.low[i], c = quote.close[i];
        if (o == null || h == null || l == null || c == null) continue;
        candles.push({ time: (timestamp[i] + KST_OFF) as UTCTimestamp, open: o, high: h, low: l, close: c });
      }
      if (seriesRef.current) {
        seriesRef.current.setData(candles);
        chartRef.current?.timeScale().fitContent();
      }
      const closes = candles.map((c) => c.close);
      setTech({ rsi: calcRsi(closes), macd: calcMacd(closes), bb: calcBB(closes) });
      setPriceInfo({ current: meta.regularMarketPrice, prevClose: meta.chartPreviousClose, currency: meta.currency });
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [useKst]);

  useEffect(() => { void loadData(activeSymbol, timeframe); }, [activeSymbol, timeframe, loadData]);

  function handleSearch() {
    const v = customInput.trim();
    if (!v) return;
    const sym = (symbolSuffix && !v.includes(".")) ? v.toUpperCase() + symbolSuffix : v.toUpperCase();
    setActiveSymbol(sym);
    setCustomInput("");
  }

  const changePct = priceInfo ? (priceInfo.current - priceInfo.prevClose) / priceInfo.prevClose * 100 : null;
  const rsiColor  = (r: number) => r >= 70 ? "text-red-400" : r <= 30 ? "text-green-400" : "text-cyan-300";
  const rsiLabel  = (r: number) => r >= 70 ? "과매수" : r <= 30 ? "과매도" : "중립";

  return (
    <div className="space-y-3">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Preset buttons */}
        {presets.map((p) => (
          <button
            key={p.symbol}
            onClick={() => setActiveSymbol(p.symbol)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              activeSymbol === p.symbol
                ? "bg-cyan-500 text-slate-950"
                : "bg-white/5 text-[var(--aston-muted)] hover:bg-white/10 hover:text-white"
            }`}
          >
            {p.label}
          </button>
        ))}
        {/* Custom search */}
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 px-2 py-1">
          <Search className="h-3 w-3 text-slate-500" />
          <input
            className="w-24 bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder={symbolSuffix ? "종목코드" : "티커 입력"}
          />
        </div>
        {/* Timeframes */}
        <div className="ml-auto flex gap-1">
          {YAHOO_TFS.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`rounded px-2 py-1 text-xs font-medium transition ${
                timeframe === tf
                  ? "bg-cyan-500 text-slate-950"
                  : "bg-white/5 text-[var(--aston-muted)] hover:bg-white/10 hover:text-white"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Price bar */}
      {priceInfo && changePct !== null && (
        <div className="flex items-center gap-4 rounded-lg bg-white/5 px-4 py-2 text-sm">
          <span className="text-xs text-slate-400">{activeSymbol}</span>
          <span className="font-bold text-white">
            {priceInfo.currency === "KRW"
              ? priceInfo.current.toLocaleString("ko-KR") + " ₩"
              : "$" + priceInfo.current.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </span>
          <span className={changePct >= 0 ? "text-green-400" : "text-red-400"}>
            {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
          </span>
          <span className="text-xs text-slate-500">Yahoo Finance</span>
        </div>
      )}

      {/* Chart */}
      <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black/20">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 text-slate-400 text-sm">
            Loading...
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/40 p-4">
            <p className="text-center text-sm text-red-300">{error}</p>
            <button
              onClick={() => void loadData(activeSymbol, timeframe)}
              className="text-xs text-cyan-400 underline hover:text-cyan-300"
            >
              다시 시도
            </button>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full" style={{ height: 700 }} />
      </div>

      {/* Indicator tiles */}
      {tech && (
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="rounded-lg bg-white/5 p-3">
            <p className="text-[var(--aston-muted)]">RSI (14)</p>
            <p className={`mt-1 text-base font-bold ${tech.rsi !== null ? rsiColor(tech.rsi) : "text-slate-400"}`}>
              {tech.rsi !== null ? tech.rsi.toFixed(1) : "-"}
            </p>
            <p className="mt-0.5 text-[var(--aston-muted)]">{tech.rsi !== null ? rsiLabel(tech.rsi) : "-"}</p>
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <p className="text-[var(--aston-muted)]">MACD (12/26/9)</p>
            {tech.macd ? (
              <>
                <p className={`mt-1 font-semibold ${tech.macd.histogram >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {tech.macd.macd.toFixed(2)}
                </p>
                <p className="mt-0.5 text-[var(--aston-muted)]">
                  Sig {tech.macd.signal.toFixed(2)} · H {tech.macd.histogram.toFixed(2)}
                </p>
              </>
            ) : <p className="mt-1 text-slate-400">-</p>}
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <p className="text-[var(--aston-muted)]">Bollinger (20, 2σ)</p>
            {tech.bb ? (
              <>
                <p className="mt-1 font-semibold text-white">
                  {tech.bb.middle.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </p>
                <p className="mt-0.5 text-[var(--aston-muted)]">
                  ↑{tech.bb.upper.toLocaleString("en-US", { maximumFractionDigits: 0 })} ↓{tech.bb.lower.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </p>
              </>
            ) : <p className="mt-1 text-slate-400">-</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ChartArea() {
  const [tab,     setTab]     = useState<MarketTab>("coin");
  const [coinIdx, setCoinIdx] = useState(0);
  const coin = COIN_PRESETS[coinIdx];

  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <LineChart className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold text-[var(--aston-text)]">Technical Snapshot</h2>
      </div>

      {/* Market tabs */}
      <div className="mb-4 flex gap-1 border-b border-white/10 pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              tab === t.id
                ? "bg-cyan-500 text-slate-950"
                : "bg-white/5 text-[var(--aston-muted)] hover:bg-white/10 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 코인 ── */}
      {tab === "coin" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {COIN_PRESETS.map((m, i) => (
              <button
                key={m.tvSymbol}
                onClick={() => setCoinIdx(i)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  i === coinIdx
                    ? "bg-cyan-500 text-slate-950"
                    : "bg-white/5 text-[var(--aston-muted)] hover:bg-white/10 hover:text-white"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <BinancePriceBar sym={coin.binanceSymbol} />
          <div className="overflow-hidden rounded-lg border border-white/10" style={{ height: 700 }}>
            <TradingViewWidget key={coin.tvSymbol} tvSymbol={coin.tvSymbol} />
          </div>
        </div>
      )}

      {/* ── 한국주식 ── */}
      {tab === "kr" && (
        <YahooChart key="kr" presets={KR_PRESETS} symbolSuffix=".KS" useKst />
      )}

      {/* ── 미국주식 ── */}
      {tab === "us" && (
        <YahooChart key="us" presets={US_PRESETS} />
      )}

      {/* ── 선물/지수 ── */}
      {tab === "futures" && (
        <YahooChart key="futures" presets={FUTURES_PRESETS} />
      )}
    </div>
  );
}
