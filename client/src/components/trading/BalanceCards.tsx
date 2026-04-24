import { trpc } from "@/lib/trpc";

type ExchangeKey = "binance" | "upbit";

function pickTopAsset(total: Record<string, number>): { symbol: string; amount: number } {
  const entries = Object.entries(total).filter(([, amount]) => Number.isFinite(amount) && amount > 0);
  if (entries.length === 0) return { symbol: "-", amount: 0 };
  entries.sort((a, b) => b[1] - a[1]);
  return { symbol: entries[0][0], amount: entries[0][1] };
}

function formatAmount(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function BalanceCard({ exchange }: { exchange: ExchangeKey }) {
  const query = trpc.trading.getBalance.useQuery({ exchange }); // MODIFIED: replace static mock cards with live tRPC balance data.

  if (query.isLoading) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <p className="text-sm font-semibold text-slate-300">{exchange}</p>
        <p className="mt-3 text-lg font-semibold text-slate-400">Loading...</p>
        <p className="mt-1 text-xs text-slate-500">Exchange balance</p>
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <p className="text-sm font-semibold text-slate-300">{exchange}</p>
        <p className="mt-3 text-lg font-semibold text-red-300">Unavailable</p>
        <p className="mt-1 text-xs text-slate-500">API key or exchange connection required</p>
      </div>
    );
  }

  const top = pickTopAsset(query.data.total);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <p className="text-sm font-semibold text-cyan-300">{exchange}</p>
      <p className="mt-3 text-2xl font-bold text-white">{formatAmount(top.amount)} {top.symbol}</p>
      <p className="mt-1 text-xs text-slate-500">Largest available asset</p>
    </div>
  );
}

export default function BalanceCards() {
  return (
    <>
      <BalanceCard exchange="binance" />
      <BalanceCard exchange="upbit" />
    </>
  );
}

