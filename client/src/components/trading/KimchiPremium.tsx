import { trpc } from "@/lib/trpc";

function PremiumRow({ symbol }: { symbol: string }) {
  const query = trpc.trading.getKimchiPremium.useQuery({ symbol }); // MODIFIED: replace static premium list with live kimchi premium query per symbol.

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
        <span className="text-sm text-slate-300">{symbol}</span>
        <span className="text-sm font-semibold text-slate-400">Loading...</span>
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
        <span className="text-sm text-slate-300">{symbol}</span>
        <span className="text-sm font-semibold text-red-300">Unavailable</span>
      </div>
    );
  }

  const tone = query.data.premiumPercent >= 0 ? "text-[#00c853]" : "text-[#ff1744]";
  const sign = query.data.premiumPercent >= 0 ? "+" : "";

  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
      <span className="text-sm text-slate-300">{symbol}</span>
      <span className={`text-sm font-semibold ${tone}`}>{sign}{query.data.premiumPercent.toFixed(2)}%</span>
    </div>
  );
}

export default function KimchiPremium() {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <h2 className="text-sm font-semibold text-white">Kimchi Premium</h2>
      <div className="mt-3 space-y-2">
        <PremiumRow symbol="BTC" />
        <PremiumRow symbol="ETH" />
      </div>
    </div>
  );
}

