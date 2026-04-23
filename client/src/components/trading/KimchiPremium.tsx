const premiums = [
  { symbol: "BTC", value: "+2.14%", tone: "text-[#00c853]" },
  { symbol: "ETH", value: "+1.72%", tone: "text-[#00c853]" },
];

export default function KimchiPremium() {
  // TODO: 여기에 tRPC 연결
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <h2 className="text-sm font-semibold text-white">김프 모니터</h2>
      <div className="mt-3 space-y-2">
        {premiums.map((item) => (
          <div key={item.symbol} className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
            <span className="text-sm text-slate-300">{item.symbol}</span>
            <span className={`text-sm font-semibold ${item.tone}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
