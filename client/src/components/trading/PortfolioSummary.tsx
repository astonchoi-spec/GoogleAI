import { Activity, Bell, Wallet } from "lucide-react";
import { trpc } from "@/lib/trpc";

function sumTotalAssets(total: Record<string, number>): number {
  return Object.values(total).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

function formatNumber(value: number, max = 2): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: max });
}

export default function PortfolioSummary() {
  const binanceBalance = trpc.trading.getBalance.useQuery({ exchange: "binance" }); // MODIFIED: replace static summary metrics with live balance data from trading router.
  const positions = trpc.trading.getPositions.useQuery({ exchange: "binance" }); // MODIFIED: compute active position count and PnL from backend positions query.
  const alerts = trpc.trading.listAlerts.useQuery(undefined, { retry: false }); // MODIFIED: show active alert count from alert engine instead of hardcoded number.

  const totalAsset =
    (binanceBalance.data ? sumTotalAssets(binanceBalance.data.total) : 0);
  const totalPnl = (positions.data ?? []).reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0);
  const activePositions = (positions.data ?? []).length;
  const activeAlerts = (alerts.data ?? []).filter((a) => a.active).length;

  const loading = binanceBalance.isLoading || positions.isLoading;
  const hasError = !!binanceBalance.error || !!positions.error;

  // API 키 미설정 시 한 줄 축소 표시
  if (!loading && hasError) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] flex items-center gap-2 px-4 py-3 text-sm text-[var(--aston-muted)]">
        <Wallet className="h-4 w-4 text-slate-500 shrink-0" />
        <span>Portfolio Summary — 거래소 API 키 미설정</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4">
      <div className="mb-4 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold text-[var(--aston-text)]">Portfolio Summary</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/15 p-3">
          <p className="text-xs text-[var(--aston-muted)]">Total Asset (Binance)</p>
          <p className="mt-1 text-lg font-semibold text-[var(--aston-text)]">
            {loading ? "Loading..." : `${formatNumber(totalAsset)} USDT`}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/15 p-3">
          <p className="text-xs text-[var(--aston-muted)]">Unrealized PnL</p>
          <p className={`mt-1 text-lg font-semibold ${totalPnl >= 0 ? "text-[#00c853]" : "text-[#ff1744]"}`}>
            {loading ? "Loading..." : `${totalPnl >= 0 ? "+" : ""}${formatNumber(totalPnl)} USDT`}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/15 p-3">
          <p className="text-xs text-[var(--aston-muted)]">Open Positions</p>
          <p className="mt-1 text-lg font-semibold text-cyan-300">
            {loading ? "Loading..." : `${activePositions}`}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300">
          <Activity className="h-3.5 w-3.5" />
          Live position snapshot enabled
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
          <Bell className="h-3.5 w-3.5" />
          Active alerts: {alerts.isLoading ? "..." : activeAlerts}
        </div>
      </div>
    </div>
  );
}







