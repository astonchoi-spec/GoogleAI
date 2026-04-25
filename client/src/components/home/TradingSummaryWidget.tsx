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
      <a className="block rounded-2xl border border-white/10 bg-black/15 p-5 transition-colors hover:border-cyan-500/30 hover:bg-white/5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10">
            <TrendingUp className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--aston-text)]">트레이딩 요약</h3>
            <p className="text-xs text-[var(--aston-muted)]">포지션과 알림 상태를 보여줍니다.</p>
          </div>
        </div>
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--aston-muted)]">평가손익</span>
            <span className={`font-semibold ${totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {positions.isLoading ? "..." : `${totalPnl >= 0 ? "+" : ""}${formatNumber(totalPnl)} USDT`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--aston-muted)]">열린 포지션</span>
            <span className="text-[var(--aston-text)]">{positions.isLoading ? "..." : `${activePositions}`}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--aston-muted)]">활성 알림</span>
            <span className="text-[var(--aston-text)]">{alerts.isLoading ? "..." : `${activeAlerts}`}</span>
          </div>
        </div>
      </a>
    </Link>
  );
}
