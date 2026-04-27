import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, CandlestickSeries, ColorType, type IChartApi, type ISeriesApi, type CandlestickData, type UTCTimestamp } from "lightweight-charts";
import { LineChart, Search, ChevronDown } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type TechResult = {
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  bb: { upper: number; middle: number; lower: number } | null;
  price: number | null;
  change24h: number | null;
};

type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

const DEFAULT_SYMBOLS = [
  "BTC/USDT", "ETH/USDT", "SOL/USDT", "XRP/USDT", "DOGE/USDT",
  "ADA/USDT", "AVAX/USDT", "MATIC/USDT", "LINK/USDT", "DOT/USDT",
];

// ── Indicator helpers ──────────────────────────────────────────────────────────

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function calcRsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcMacd(closes: number[]): TechResult["macd"] {
  if (closes.length < 35) return null;
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const macdLine = e12.map((v, i) => v - e26[i]);
  const signalLine = ema(macdLine.slice(25), 9);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  return { macd: lastMacd, signal: lastSignal, histogram: lastMacd - lastSignal };
}

function calcBB(closes: number[], period = 20): TechResult["bb"] {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period);
  return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std };
}

// ── Symbol input with dropdown ─────────────────────────────────────────────────

function SymbolSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (sym: string) => void;
}) {
  const [inputVal, setInputVal] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function commit(sym: string) {
    const normalized = sym.trim().toUpperCase().replace("/", "").replace("USDT", "") + "/USDT";
    setInputVal(normalized);
    setOpen(false);
    onChange(normalized);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commit(inputVal);
  }

  const filtered = DEFAULT_SYMBOLS.filter((s) =>
    s.toLowerCase().includes(inputVal.toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
        <Search className="h-3 w-3 text-slate-500" />
        <input
          className="w-32 bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
          value={inputVal}
          onChange={(e) => { setInputVal(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder="BTC/USDT"
        />
        <button onClick={() => setOpen((o) => !o)}>
          <ChevronDown className="h-3 w-3 text-slate-500" />
        </button>
      </div>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-40 rounded-lg border border-white/10 bg-slate-900 shadow-xl">
          {filtered.map((sym) => (
            <button
              key={sym}
              className="block w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-white/10"
              onMouseDown={() => commit(sym)}
            >
              {sym}
            </button>
          ))}
          {filtered.length === 0 && inputVal.length > 0 && (
            <button
              className="block w-full px-3 py-1.5 text-left text-xs text-cyan-400 hover:bg-white/10"
              onMouseDown={() => commit(inputVal)}
            >
              "{inputVal.toUpperCase()}" 검색
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ChartArea() {
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [tech, setTech] = useState<TechResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // Init chart once
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        fontSize: 11,
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
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#00c853",
      downColor: "#ff1744",
      borderUpColor: "#00c853",
      borderDownColor: "#ff1744",
      wickUpColor: "#00c853",
      wickDownColor: "#ff1744",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Fetch & update data when symbol/timeframe changes
  const loadData = useCallback(async (sym: string, tf: Timeframe) => {
    setLoading(true);
    setError(null);

    const binanceSym = sym.replace("/", "");
    try {
      const [klinesRes, statsRes] = await Promise.all([
        fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=${tf}&limit=200`),
        fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSym}`),
      ]);

      if (!klinesRes.ok) throw new Error(`심볼을 찾을 수 없습니다: ${sym}`);

      const klines = await klinesRes.json() as Array<Array<string | number>>;
      const statsData = await statsRes.json() as { priceChangePercent: string; lastPrice: string };

      const candles: CandlestickData[] = klines.map((k) => ({
        time: Math.floor(Number(k[0]) / 1000) as UTCTimestamp,
        open: parseFloat(String(k[1])),
        high: parseFloat(String(k[2])),
        low: parseFloat(String(k[3])),
        close: parseFloat(String(k[4])),
      }));

      if (seriesRef.current) {
        seriesRef.current.setData(candles);
        chartRef.current?.timeScale().fitContent();
      }

      const closes = candles.map((c) => c.close);
      setTech({
        rsi: calcRsi(closes),
        macd: calcMacd(closes),
        bb: calcBB(closes),
        price: parseFloat(statsData.lastPrice),
        change24h: parseFloat(statsData.priceChangePercent),
      });
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터 로드 실패");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(symbol, timeframe);
  }, [symbol, timeframe, loadData]);

  function rsiColor(rsi: number) {
    if (rsi >= 70) return "text-red-400";
    if (rsi <= 30) return "text-green-400";
    return "text-cyan-300";
  }
  function rsiLabel(rsi: number) {
    if (rsi >= 70) return "과매수";
    if (rsi <= 30) return "과매도";
    return "중립";
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4">
      {/* Header + Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-[var(--aston-text)]">Technical Snapshot</h2>
        </div>

        <SymbolSelector value={symbol} onChange={setSymbol} />

        <div className="flex gap-1">
          {TIMEFRAMES.map((tf) => (
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

        <span className="ml-auto text-xs text-[var(--aston-muted)]">Binance 공개 API</span>
      </div>

      {/* Chart */}
      <div className="relative rounded-lg border border-white/10 bg-black/20 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 text-slate-400 text-sm">
            Loading chart...
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 text-red-300 text-sm">
            {error}
          </div>
        )}
        <div ref={chartContainerRef} className="w-full" style={{ height: 400 }} />
      </div>

      {/* Indicators */}
      {tech && (
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div className="rounded-lg bg-white/5 p-3">
            <p className="text-[var(--aston-muted)]">현재가</p>
            <p className="mt-1 text-base font-bold text-white">
              ${tech.price?.toLocaleString("en-US", { maximumFractionDigits: 4 })}
            </p>
            <p className={`mt-0.5 ${(tech.change24h ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
              {(tech.change24h ?? 0) >= 0 ? "+" : ""}{tech.change24h?.toFixed(2)}% (24h)
            </p>
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <p className="text-[var(--aston-muted)]">RSI (14)</p>
            <p className={`mt-1 text-base font-bold ${tech.rsi !== null ? rsiColor(tech.rsi) : "text-slate-400"}`}>
              {tech.rsi !== null ? tech.rsi.toFixed(1) : "-"}
            </p>
            <p className="mt-0.5 text-[var(--aston-muted)]">
              {tech.rsi !== null ? rsiLabel(tech.rsi) : "-"}
            </p>
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
            ) : (
              <p className="mt-1 text-slate-400">-</p>
            )}
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <p className="text-[var(--aston-muted)]">Bollinger (20, 2σ)</p>
            {tech.bb ? (
              <>
                <p className="mt-1 font-semibold text-white">
                  ${tech.bb.middle.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </p>
                <p className="mt-0.5 text-[var(--aston-muted)]">
                  ↑{tech.bb.upper.toLocaleString("en-US", { maximumFractionDigits: 0 })} ↓{tech.bb.lower.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </p>
              </>
            ) : (
              <p className="mt-1 text-slate-400">-</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
