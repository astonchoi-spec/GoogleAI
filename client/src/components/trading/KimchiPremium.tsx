import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function KimchiPremium() {
  const query = trpc.trading.getKimchiPremium.useQuery(
    { symbols: ["BTC", "ETH"] },
    { retry: false, refetchInterval: 10_000 }
  );

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <h2 className="text-sm font-semibold text-white">김프 모니터</h2>
      <div className="mt-3 space-y-2">
        {query.isLoading ? (
          <div className="flex items-center rounded-lg bg-slate-800/70 px-3 py-2 text-sm text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            김프 조회 중
          </div>
        ) : query.error ? (
          <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
            Redis/거래소 연결을 확인해주세요.
          </div>
        ) : !query.data?.length ? (
          <div className="rounded-lg bg-slate-800/70 px-3 py-2 text-sm text-slate-400">조회된 데이터가 없습니다.</div>
        ) : (
          query.data.map((item) => {
            const premium = item.premium;
            return (
              <div key={item.symbol} className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
                <span className="text-sm text-slate-300">{item.symbol}</span>
                <span className={`text-sm font-semibold ${(premium ?? 0) >= 0 ? "text-[#00c853]" : "text-[#ff1744]"}`}>
                  {premium === null ? "N/A" : `${premium.toFixed(2)}%`}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
