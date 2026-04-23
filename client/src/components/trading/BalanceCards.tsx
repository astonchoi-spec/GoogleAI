const balances = [
  { exchange: "Binance", asset: "5,000 USDT", sub: "Futures wallet", color: "text-yellow-300" },
  { exchange: "Upbit", asset: "3,000,000 KRW", sub: "Spot account", color: "text-blue-300" },
];

export default function BalanceCards() {
  // TODO: 여기에 tRPC 연결
  return (
    <>
      {balances.map((balance) => (
        <div key={balance.exchange} className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <p className={`text-sm font-semibold ${balance.color}`}>{balance.exchange}</p>
          <p className="mt-3 text-2xl font-bold text-white">{balance.asset}</p>
          <p className="mt-1 text-xs text-slate-500">{balance.sub}</p>
        </div>
      ))}
    </>
  );
}
