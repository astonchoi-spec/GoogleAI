import { TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function TradingSummaryWidget() {
  const positions = trpc.trading.getPositions.useQuery({ exchange: "binance" }, { retry: false }); // MODIFIED: feed home trading widget with live position snapshot from trading router.
  const alerts = trpc.trading.listAlerts.useQuery(undefined, { retry: false }); // MODIFIED: show active alert count from backend instead of fixed mock value.

  const totalPnl = (positions.data ?? []).reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0);
  const activePositions = (positions.data ?? []).length;
  const activeAlerts = (alerts.data ?? []).filter((a) => a.active).length;

  return (
    <Link href="/trading">
      <a className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-cyan-600/50 hover:bg-card/80">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15">
            <TrendingUp className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-card-foreground">Trading Summary</h3>
            <p className="text-xs text-muted-foreground">Position and alert snapshot</p>
          </div>
        </div>
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Unrealized PnL</span>
            <span className={`font-semibold ${totalPnl >= 0 ? "text-[#00c853]" : "text-[#ff1744]"}`}>
              {positions.isLoading ? "..." : `${totalPnl >= 0 ? "+" : ""}${formatNumber(totalPnl)} USDT`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Open positions</span>
            <span className="text-card-foreground">{positions.isLoading ? "..." : `${activePositions}`}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Active alerts</span>
            <span className="text-card-foreground">{alerts.isLoading ? "..." : `${activeAlerts}`}</span>
          </div>
        </div>
      </a>
    </Link>
  );
}

