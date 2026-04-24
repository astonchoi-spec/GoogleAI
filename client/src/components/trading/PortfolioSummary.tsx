import { Activity, Bell, Wallet } from "lucide-react";

const metrics = [
  { label: "총자산", value: "8,214 USDT", tone: "text-white" },
  { label: "총손익", value: "+324.80 USDT", tone: "text-[#00c853]" },
  { label: "활성 포지션", value: "4개", tone: "text-cyan-300" },
];

export default function PortfolioSummary() {
  // TODO: 여기에 tRPC 연결
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <div className="mb-4 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold text-white">포트폴리오 요약</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
            <p className="text-xs text-slate-500">{metric.label}</p>
            <p className={`mt-1 text-lg font-semibold ${metric.tone}`}>{metric.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-lg bg-cyan-950/30 px-3 py-2 text-xs text-cyan-300">
          <Activity className="h-3.5 w-3.5" />
          실시간 포지션 감시 준비됨
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-blue-950/30 px-3 py-2 text-xs text-blue-300">
          <Bell className="h-3.5 w-3.5" />
          가격/RSI 알림 3개 활성
        </div>
      </div>
    </div>
  );
}
