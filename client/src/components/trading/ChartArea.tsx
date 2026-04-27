import { useEffect, useRef, useState, useCallback } from "react";
import { LineChart } from "lucide-react";

// ── Market presets ─────────────────────────────────────────────────────────────

type Market = {
  label: string;
  tvSymbol: string;
  binanceSymbol: string | null;
};

const QUICK_MARKETS: Market[] = [
  { label: "BTC/USDT",   tvSymbol: "BINANCE:BTCUSDT",  binanceSymbol: "BTCUSDT" },
  { label: "ETH/USDT",   tvSymbol: "BINANCE:ETHUSDT",  binanceSymbol: "ETHUSDT" },
  { label: "나스닥100",   tvSymbol: "CME_MINI:NQ1!",   binanceSymbol: null },
  { label: "S&P500",     tvSymbol: "CME_MINI:ES1!",    binanceSymbol: null },
  { label: "금",          tvSymbol: "COMEX:GC1!",       binanceSymbol: null },
  { label: "삼성전자",    tvSymbol: "KRX:005930",       binanceSymbol: null },
  { label: "SK하이닉스", tvSymbol: "KRX:000660",       binanceSymbol: null },
];

// ── TradingView widget (remounts on symbol change via key) ─────────────────────

function TradingViewWidget({ tvSymbol }: { tvSymbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: "60",
      timezone: "Asia/Seoul",
      theme: "dark",
      style: "1",
      locale: "kr",
      allow_symbol_change: true,
      calendar: false,
      studies: [
        "RSI@tv-basicstudies",
        "MACD@tv-basicstudies",
        "BB@tv-basicstudies",
      ],
      hide_side_toolbar: false,
      support_host: "https://www.tradingview.com",
    });

    el.appendChild(script);

    return () => {
      el.innerHTML = "";
    };
  }, [tvSymbol]);

  return (
    <div
      className="tradingview-widget-container"
      ref={containerRef}
      style={{ height: 500, width: "100%" }}
    >
      <div
        className="tradingview-widget-container__widget"
        style={{ height: "calc(100% - 32px)", width: "100%" }}
      />
    </div>
  );
}

// ── Price bar (Binance API, only for Binance-listed symbols) ───────────────────

type PriceInfo = { price: number; change24h: number };

function PriceBar({ binanceSymbol }: { binanceSymbol: string | null }) {
  const [info, setInfo] = useState<PriceInfo | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPrice = useCallback(async (sym: string) => {
    try {
      const res = await fetch(
        `https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        lastPrice: string;
        priceChangePercent: string;
      };
      setInfo({
        price: parseFloat(data.lastPrice),
        change24h: parseFloat(data.priceChangePercent),
      });
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    setInfo(null);
    if (!binanceSymbol) return;

    void fetchPrice(binanceSymbol);
    timerRef.current = setInterval(() => void fetchPrice(binanceSymbol), 5_000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [binanceSymbol, fetchPrice]);

  if (!binanceSymbol || !info) return null;

  const up = info.change24h >= 0;
  return (
    <div className="flex items-center gap-4 rounded-lg bg-white/5 px-4 py-2 text-sm">
      <span className="font-bold text-white">
        ${info.price.toLocaleString("en-US", { maximumFractionDigits: 4 })}
      </span>
      <span className={up ? "text-green-400" : "text-red-400"}>
        {up ? "+" : ""}
        {info.change24h.toFixed(2)}% (24h)
      </span>
      <span className="text-xs text-slate-500">Binance · 5초 갱신</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ChartArea() {
  const [activeIdx, setActiveIdx] = useState(0);
  const market = QUICK_MARKETS[activeIdx];

  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <LineChart className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold text-[var(--aston-text)]">
          Technical Snapshot
        </h2>
      </div>

      {/* Quick-market buttons */}
      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK_MARKETS.map((m, i) => (
          <button
            key={m.tvSymbol}
            onClick={() => setActiveIdx(i)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              i === activeIdx
                ? "bg-cyan-500 text-slate-950"
                : "bg-white/5 text-[var(--aston-muted)] hover:bg-white/10 hover:text-white"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Current price (Binance) */}
      <div className="mb-3">
        <PriceBar binanceSymbol={market.binanceSymbol} />
      </div>

      {/* TradingView chart — key forces remount on symbol change */}
      <div className="overflow-hidden rounded-lg border border-white/10">
        <TradingViewWidget key={market.tvSymbol} tvSymbol={market.tvSymbol} />
      </div>
    </div>
  );
}
