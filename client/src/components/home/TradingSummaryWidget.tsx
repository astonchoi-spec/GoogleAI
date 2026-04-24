import { Loader2, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

export default function TradingSummaryWidget() {
  const balanceQuery = trpc.trading.getBalance.useQuery({ exchange: "gate" }, { retry: false });
  const positionsQuery = trpc.trading.getPositions.useQuery({ exchange: "gate" }, { retry: false });
  const alertsQuery = trpc.trading.getAlerts.useQuery(undefined, { retry: false });

  return (
    <Link
      href="/trading"
      className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-cyan-600/50 hover:bg-card/80"
    >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15">
            <TrendingUp className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-card-foreground">트레이딩 요약</h3>
            <p className="text-xs text-muted-foreground">거래소 잔고와 포지션 상태</p>
          </div>
        </div>
        {balanceQuery.isLoading ? (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            조회 중
          </div>
        ) : balanceQuery.error ? (
          <p className="text-sm text-red-400">거래소를 연결해주세요.</p>
        ) : (
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">USDT 잔고</span>
              <span className="font-semibold text-card-foreground">{(balanceQuery.data?.total?.USDT ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">활성 포지션</span>
              <span className="text-card-foreground">{positionsQuery.data?.length ?? 0}개</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">활성 알림</span>
              <span className="text-card-foreground">{alertsQuery.data?.filter((alert) => alert.active).length ?? 0}개</span>
            </div>
          </div>
        )}
    </Link>
  );
}
