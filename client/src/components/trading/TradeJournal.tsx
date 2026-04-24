import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function TradeJournal() {
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [symbols, setSymbols] = useState("BTC/USDT,ETH/USDT");
  const statsQuery = trpc.trading.getTradeStats.useQuery({ period }, { retry: false });
  const syncMutation = trpc.trading.syncJournal.useMutation({
    onSuccess: () => statsQuery.refetch(),
  });

  const stats = statsQuery.data;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
          <select value={period} onChange={(e) => setPeriod(e.target.value as "week" | "month")} className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white">
            <option value="week">이번 주</option>
            <option value="month">최근 30일</option>
          </select>
          <input value={symbols} onChange={(e) => setSymbols(e.target.value)} className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500" placeholder="BTC/USDT,ETH/USDT" />
          <button
            onClick={() => syncMutation.mutate({ exchange: "binance", symbols: symbols.split(",").map((item) => item.trim()).filter(Boolean) })}
            disabled={syncMutation.isPending}
            className="inline-flex items-center justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {syncMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            동기화
          </button>
        </div>

        {statsQuery.isLoading ? (
          <div className="mt-4 flex items-center text-sm text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            통계 조회 중
          </div>
        ) : statsQuery.error ? (
          <div className="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
            {statsQuery.error.message || "Google Sheets 거래일지를 연결해주세요."}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["총 거래", `${stats?.totalTrades ?? 0}건`],
              ["승률", `${(((stats?.winRate ?? 0) * 100)).toFixed(1)}%`],
              ["총 손익", `${(stats?.totalPnl ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`],
              ["손익비", `${(stats?.averagePnlRatio ?? 0).toFixed(2)}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-800/70 p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
