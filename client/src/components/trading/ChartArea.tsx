import { LineChart } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function ChartArea() {
  const analysis = trpc.trading.getTechnicalAnalysis.useQuery({
    exchange: "binance",
    symbol: "BTC/USDT",
    timeframe: "1h",
    limit: 200,
  }); // MODIFIED: render live technical-analysis briefing in place of static chart placeholder.

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Technical Snapshot</h2>
        <span className="text-xs text-slate-500">BTC/USDT · 1h</span>
      </div>
      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/70 p-4">
        {analysis.isLoading && (
          <div className="flex h-56 items-center justify-center text-slate-400">Loading analysis...</div>
        )}
        {analysis.error && (
          <div className="flex h-56 items-center justify-center text-red-300">{analysis.error.message}</div>
        )}
        {analysis.data && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-cyan-300">
              <LineChart className="h-4 w-4" />
              <span className="text-xs">Indicator briefing</span>
            </div>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs text-slate-300">
              {analysis.data.briefing}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

