import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

function formatNumber(value: number | null, suffix = "") {
  if (value === null || value === undefined) return "-";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 6 })}${suffix}`;
}

export default function PositionTable() {
  const positionsQuery = trpc.trading.getPositions.useQuery({ exchange: "gate" }, { retry: false, refetchInterval: 15_000 });

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <h2 className="mb-3 text-sm font-semibold text-white">포지션 현황</h2>
      {positionsQuery.isLoading ? (
        <div className="flex h-24 items-center justify-center text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          포지션을 불러오는 중
        </div>
      ) : positionsQuery.error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
          {positionsQuery.error.message || "거래소를 연결해주세요."}
        </div>
      ) : !positionsQuery.data?.length ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-6 text-center text-sm text-slate-400">
          열린 포지션이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">심볼</th>
                <th className="px-3 py-2 font-medium">방향</th>
                <th className="px-3 py-2 font-medium">진입가</th>
                <th className="px-3 py-2 font-medium">현재가</th>
                <th className="px-3 py-2 font-medium">미실현 손익</th>
                <th className="px-3 py-2 font-medium">레버리지</th>
                <th className="px-3 py-2 font-medium">청산가</th>
              </tr>
            </thead>
            <tbody>
              {positionsQuery.data.map((position) => {
                const pnl = position.unrealizedPnl ?? 0;
                return (
                  <tr key={position.symbol} className="border-b border-slate-800 last:border-0">
                    <td className="px-3 py-3 font-medium text-white">{position.symbol}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs ${position.side === "long" ? "bg-green-500/15 text-[#00c853]" : "bg-red-500/15 text-[#ff1744]"}`}>
                        {position.side || "-"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-300">{formatNumber(position.entryPrice)}</td>
                    <td className="px-3 py-3 text-slate-300">{formatNumber(position.markPrice)}</td>
                    <td className={`px-3 py-3 font-semibold ${pnl >= 0 ? "text-[#00c853]" : "text-[#ff1744]"}`}>
                      {formatNumber(position.unrealizedPnl, " USDT")}
                    </td>
                    <td className="px-3 py-3 text-slate-300">{formatNumber(position.leverage, "x")}</td>
                    <td className="px-3 py-3 text-slate-300">{formatNumber(position.liquidationPrice)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
