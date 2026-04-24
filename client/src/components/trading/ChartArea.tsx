import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, createChart, ColorType, type IChartApi, type Time } from "lightweight-charts";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function ChartArea() {
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [timeframe, setTimeframe] = useState("1h");
  const chartRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const query = trpc.trading.analyze.useQuery(
    { exchange: "binance", symbol, timeframe },
    { retry: false, refetchInterval: 30_000 }
  );

  useEffect(() => {
    if (!chartRef.current || !query.data?.candles?.length) return;

    chartApiRef.current?.remove();
    const chart = createChart(chartRef.current, {
      height: 288,
      layout: {
        background: { type: ColorType.Solid, color: "#020617" },
        textColor: "#cbd5e1",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      rightPriceScale: { borderColor: "#334155" },
      timeScale: { borderColor: "#334155" },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#00c853",
      downColor: "#ff1744",
      borderVisible: false,
      wickUpColor: "#00c853",
      wickDownColor: "#ff1744",
    });
    series.setData(query.data.candles.map((candle) => ({
      time: candle.time as Time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })));
    chart.timeScale().fitContent();
    chartApiRef.current = chart;

    const resize = () => chart.applyOptions({ width: chartRef.current?.clientWidth ?? 0 });
    window.addEventListener("resize", resize);
    resize();
    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
      chartApiRef.current = null;
    };
  }, [query.data]);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">차트 영역</h2>
          {query.data?.briefing && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{query.data.briefing}</p>}
        </div>
        <div className="flex gap-2">
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} className="w-28 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-white" />
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-white">
            <option value="15m">15m</option>
            <option value="1h">1h</option>
            <option value="4h">4h</option>
            <option value="1d">1d</option>
          </select>
        </div>
      </div>
      {query.isLoading ? (
        <div className="flex h-72 items-center justify-center rounded-lg bg-slate-950/70 text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          차트 조회 중
        </div>
      ) : query.error ? (
        <div className="flex h-72 items-center justify-center rounded-lg border border-red-900/60 bg-red-950/30 p-4 text-center text-sm text-red-300">
          {query.error.message || "거래소 캔들 데이터를 불러오지 못했습니다."}
        </div>
      ) : !query.data?.candles?.length ? (
        <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/70 text-sm text-slate-400">
          캔들 데이터가 없습니다.
        </div>
      ) : (
        <div ref={chartRef} className="h-72 rounded-lg border border-slate-800 bg-slate-950" />
      )}
    </div>
  );
}
