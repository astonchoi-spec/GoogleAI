import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

function BalanceCard({ exchange, label, color, primaryAsset }: { exchange: "binance" | "upbit"; label: string; color: string; primaryAsset: string }) {
  const query = trpc.trading.getBalance.useQuery({ exchange }, { retry: false, refetchInterval: 30_000 });
  const value = query.data?.total?.[primaryAsset];

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <p className={`text-sm font-semibold ${color}`}>{label}</p>
      {query.isLoading ? (
        <div className="mt-3 flex items-center text-sm text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          조회 중
        </div>
      ) : query.error ? (
        <p className="mt-3 text-sm text-red-300">거래소를 연결해주세요.</p>
      ) : value === undefined ? (
        <p className="mt-3 text-sm text-slate-400">{primaryAsset} 잔고가 없습니다.</p>
      ) : (
        <p className="mt-3 text-2xl font-bold text-white">
          {value.toLocaleString("en-US", { maximumFractionDigits: 4 })} {primaryAsset}
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">{exchange === "binance" ? "Futures wallet" : "Spot account"}</p>
    </div>
  );
}

export default function BalanceCards() {
  return (
    <>
      <BalanceCard exchange="binance" label="Binance" color="text-yellow-300" primaryAsset="USDT" />
      <BalanceCard exchange="upbit" label="Upbit" color="text-blue-300" primaryAsset="KRW" />
    </>
  );
}
