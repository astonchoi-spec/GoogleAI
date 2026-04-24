import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Period = "week" | "month";

function formatPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const DEFAULT_SYMBOLS = ["BTC/USDT", "ETH/USDT"];

export default function TradeJournal() {
  const [period, setPeriod] = useState<Period>("week");
  const [exchange, setExchange] = useState<"binance" | "upbit" | "bybit">("binance");
  const utils = trpc.useUtils();

  const statsQuery = trpc.trading.getTradeStats.useQuery({ period }); // MODIFIED: fetch weekly/monthly trade stats directly from TradeJournal backend.
  const syncMutation = trpc.trading.syncTradeJournal.useMutation({
    onSuccess: async () => {
      await utils.trading.getTradeStats.invalidate({ period }); // MODIFIED: refresh stats after trade sync to reflect latest sheet append results.
      toast.success("Trade journal synced.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const stats = statsQuery.data;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <select
            value={exchange}
            onChange={(e) => setExchange(e.target.value as "binance" | "upbit" | "bybit")}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
          >
            <option value="binance">Binance</option>
            <option value="upbit">Upbit</option>
            <option value="bybit">Bybit</option>
          </select>
          <button
            onClick={() => syncMutation.mutate({ exchange, symbols: DEFAULT_SYMBOLS })} // MODIFIED: sync new trades into Google Sheet journal through trading router mutation.
            disabled={syncMutation.isPending}
            className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60"
          >
            {syncMutation.isPending ? "Syncing..." : "Sync Trades"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Trade Stats</h2>
        {statsQuery.isLoading && <p className="text-sm text-slate-400">Loading trade stats...</p>}
        {statsQuery.error && <p className="text-sm text-red-300">{statsQuery.error.message}</p>}
        {stats && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-800/70 p-3">
              <p className="text-xs text-slate-500">Total Trades</p>
              <p className="mt-1 text-sm font-semibold text-white">{stats.totalTrades}</p>
            </div>
            <div className="rounded-lg bg-slate-800/70 p-3">
              <p className="text-xs text-slate-500">Win Rate</p>
              <p className="mt-1 text-sm font-semibold text-white">{formatPct(stats.winRate)}</p>
            </div>
            <div className="rounded-lg bg-slate-800/70 p-3">
              <p className="text-xs text-slate-500">Total PnL</p>
              <p className={`mt-1 text-sm font-semibold ${stats.totalPnl >= 0 ? "text-[#00c853]" : "text-[#ff1744]"}`}>
                {stats.totalPnl >= 0 ? "+" : ""}{formatNumber(stats.totalPnl)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-800/70 p-3">
              <p className="text-xs text-slate-500">Profit Factor</p>
              <p className="mt-1 text-sm font-semibold text-white">{formatNumber(stats.averagePnlRatio)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

