import { useEffect, useMemo, useRef, useState } from "react";

export type TradingMarket = "crypto" | "kr-stock" | "us-stock" | "kr-futures" | "us-futures";

const MARKET_PRESETS: Record<
  TradingMarket,
  {
    label: string;
    defaultSymbol: string;
    interval: string;
  }
> = {
  crypto: { label: "Crypto", defaultSymbol: "BINANCE:BTCUSDT", interval: "60" },
  "kr-stock": { label: "KR Stock", defaultSymbol: "KRX:005930", interval: "D" },
  "us-stock": { label: "US Stock", defaultSymbol: "NASDAQ:AAPL", interval: "D" },
  "kr-futures": { label: "KR Futures", defaultSymbol: "KRX:KOSPI200", interval: "60" },
  "us-futures": { label: "US Futures", defaultSymbol: "CME_MINI:NQ1!", interval: "60" },
};

const INTERVAL_OPTIONS = [
  { value: "15", label: "15m" },
  { value: "60", label: "1h" },
  { value: "240", label: "4h" },
  { value: "D", label: "1d" },
] as const;

function buildWidgetConfig(symbol: string, interval: string) {
  return {
    autosize: true,
    symbol,
    interval,
    timezone: "Asia/Seoul",
    theme: "dark",
    style: "1",
    locale: "en",
    withdateranges: true,
    hide_side_toolbar: false,
    allow_symbol_change: true,
    details: true,
    studies: ["RSI@tv-basicstudies", "MACD@tv-basicstudies"],
    container_id: "tv-advanced-chart-container",
  };
}

export default function ChartArea({ market }: { market: TradingMarket }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [symbolInput, setSymbolInput] = useState(MARKET_PRESETS[market].defaultSymbol);
  const [interval, setInterval] = useState(MARKET_PRESETS[market].interval);

  const normalizedSymbol = useMemo(() => {
    const trimmed = symbolInput.trim();
    return trimmed.length > 0 ? trimmed : MARKET_PRESETS[market].defaultSymbol;
  }, [market, symbolInput]);

  useEffect(() => {
    setSymbolInput(MARKET_PRESETS[market].defaultSymbol);
    setInterval(MARKET_PRESETS[market].interval);
  }, [market]);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.innerHTML = JSON.stringify(buildWidgetConfig(normalizedSymbol, interval));
    containerRef.current.appendChild(script);
  }, [interval, normalizedSymbol]);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Advanced Chart (TradingView)</h2>
          <p className="mt-1 text-xs text-slate-400">
            Market: {MARKET_PRESETS[market].label} | Symbol format: EXCHANGE:TICKER
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={symbolInput}
            onChange={(event) => setSymbolInput(event.target.value)}
            className="w-40 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-white"
            placeholder="BINANCE:BTCUSDT"
          />
          <select
            value={interval}
            onChange={(event) => setInterval(event.target.value)}
            className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-white"
          >
            {INTERVAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
        <div id="tv-advanced-chart-container" ref={containerRef} className="h-[460px] w-full" />
      </div>
    </div>
  );
}
