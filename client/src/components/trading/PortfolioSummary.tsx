import { Activity, Bell, Loader2, Wallet } from "lucide-react";
import { trpc } from "@/lib/trpc";

function formatMoney(value: number, suffix = "USDT") {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${suffix}`;
}

export default function PortfolioSummary() {
  const balanceQuery = trpc.trading.getBalance.useQuery({ exchange: "binance" }, { retry: false });
  const positionsQuery = trpc.trading.getPositions.useQuery({ exchange: "binance" }, { retry: false });
  const alertsQuery = trpc.trading.getAlerts.useQuery(undefined, { retry: false });

  const totalUsdt = balanceQuery.data?.total?.USDT ?? 0;
  const totalPnl = positionsQuery.data?.reduce((sum, position) => sum + (position.unrealizedPnl ?? 0), 0) ?? 0;

  const metrics = [
    { label: "총 자산", value: formatMoney(totalUsdt), tone: "text-white" },
    { label: "미실현 손익", value: formatMoney(totalPnl), tone: totalPnl >= 0 ? "text-[#00c853]" : "text-[#ff1744]" },
    { label: "활성 포지션", value: `${positionsQuery.data?.length ?? 0}개`, tone: "text-cyan-300" },
  ];

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <div className="mb-4 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold text-white">포트폴리오 요약</h2>
      </div>

      {balanceQuery.isLoading || positionsQuery.isLoading ? (
        <div className="flex h-24 items-center justify-center text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          거래소 데이터를 불러오는 중
        </div>
      ) : balanceQuery.error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
          {balanceQuery.error.message || "거래소를 연결해주세요."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
              <p className="text-xs text-slate-500">{metric.label}</p>
              <p className={`mt-1 text-lg font-semibold ${metric.tone}`}>{metric.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-lg bg-cyan-950/30 px-3 py-2 text-xs text-cyan-300">
          <Activity className="h-3.5 w-3.5" />
          실시간 포지션 감시
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-blue-950/30 px-3 py-2 text-xs text-blue-300">
          <Bell className="h-3.5 w-3.5" />
          활성 알림 {alertsQuery.data?.filter((alert) => alert.active).length ?? 0}개
        </div>
      </div>
    </div>
  );
}
