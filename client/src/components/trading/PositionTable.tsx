const positions = [
  { symbol: "BTC/USDT", side: "롱", entry: "64,250", mark: "65,120", pnl: "+135.40", leverage: "10x", liquidation: "58,420" },
  { symbol: "ETH/USDT", side: "숏", entry: "3,340", mark: "3,302", pnl: "+57.20", leverage: "5x", liquidation: "3,702" },
  { symbol: "SOL/USDT", side: "롱", entry: "142.20", mark: "139.80", pnl: "-24.00", leverage: "3x", liquidation: "108.40" },
  { symbol: "XRP/USDT", side: "롱", entry: "0.612", mark: "0.628", pnl: "+16.80", leverage: "2x", liquidation: "0.421" },
];

export default function PositionTable() {
  // TODO: 여기에 tRPC 연결
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <h2 className="mb-3 text-sm font-semibold text-white">포지션 현황</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-left text-xs text-slate-500">
              <th className="px-3 py-2 font-medium">심볼</th>
              <th className="px-3 py-2 font-medium">방향</th>
              <th className="px-3 py-2 font-medium">진입가</th>
              <th className="px-3 py-2 font-medium">현재가</th>
              <th className="px-3 py-2 font-medium">미실현손익</th>
              <th className="px-3 py-2 font-medium">레버리지</th>
              <th className="px-3 py-2 font-medium">청산가</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => {
              const isProfit = position.pnl.startsWith("+");
              return (
                <tr key={position.symbol} className="border-b border-slate-800 last:border-0">
                  <td className="px-3 py-3 font-medium text-white">{position.symbol}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${position.side === "롱" ? "bg-green-500/15 text-[#00c853]" : "bg-red-500/15 text-[#ff1744]"}`}>
                      {position.side}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-300">{position.entry}</td>
                  <td className="px-3 py-3 text-slate-300">{position.mark}</td>
                  <td className={`px-3 py-3 font-semibold ${isProfit ? "text-[#00c853]" : "text-[#ff1744]"}`}>
                    {position.pnl} USDT
                  </td>
                  <td className="px-3 py-3 text-slate-300">{position.leverage}</td>
                  <td className="px-3 py-3 text-slate-300">{position.liquidation}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
