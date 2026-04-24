const trades = [
  { date: "2026-04-23", exchange: "Binance", symbol: "BTC/USDT", side: "롱", result: "+82.40", note: "돌파 진입" },
  { date: "2026-04-23", exchange: "Upbit", symbol: "ETH/KRW", side: "현물", result: "+31.20", note: "김프 축소" },
  { date: "2026-04-22", exchange: "Bybit", symbol: "SOL/USDT", side: "롱", result: "-18.00", note: "손절" },
  { date: "2026-04-22", exchange: "Binance", symbol: "ETH/USDT", side: "숏", result: "+57.20", note: "저항 매도" },
  { date: "2026-04-21", exchange: "Upbit", symbol: "XRP/KRW", side: "현물", result: "+12.10", note: "분할 익절" },
  { date: "2026-04-21", exchange: "Binance", symbol: "BTC/USDT", side: "롱", result: "-26.50", note: "가짜 돌파" },
  { date: "2026-04-20", exchange: "Bybit", symbol: "ARB/USDT", side: "숏", result: "+44.00", note: "추세 추종" },
  { date: "2026-04-20", exchange: "Binance", symbol: "BNB/USDT", side: "롱", result: "+19.70", note: "단기 스캘프" },
  { date: "2026-04-19", exchange: "Upbit", symbol: "BTC/KRW", side: "현물", result: "+66.30", note: "프리미엄 반등" },
  { date: "2026-04-19", exchange: "Bybit", symbol: "DOGE/USDT", side: "숏", result: "-9.80", note: "조기 청산" },
];

export default function TradeJournal() {
  // TODO: 여기에 tRPC 연결
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr]">
          <select className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white">
            <option>최근 30일</option>
            <option>이번 주</option>
            <option>이번 달</option>
          </select>
          <select className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white">
            <option>전체 거래소</option>
            <option>Binance</option>
            <option>Upbit</option>
            <option>Bybit</option>
          </select>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["승률", "70%"],
              ["총손익", "+258.60"],
              ["평균손익비", "1.84"],
              ["최대낙폭", "-4.2%"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-800/70 p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">거래 내역</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">일자</th>
                <th className="px-3 py-2 font-medium">거래소</th>
                <th className="px-3 py-2 font-medium">심볼</th>
                <th className="px-3 py-2 font-medium">방향</th>
                <th className="px-3 py-2 font-medium">손익</th>
                <th className="px-3 py-2 font-medium">메모</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr key={`${trade.date}-${trade.exchange}-${trade.symbol}-${trade.result}`} className="border-b border-slate-800 last:border-0">
                  <td className="px-3 py-3 text-slate-300">{trade.date}</td>
                  <td className="px-3 py-3 text-slate-300">{trade.exchange}</td>
                  <td className="px-3 py-3 font-medium text-white">{trade.symbol}</td>
                  <td className="px-3 py-3 text-slate-300">{trade.side}</td>
                  <td className={`px-3 py-3 font-semibold ${trade.result.startsWith("+") ? "text-[#00c853]" : "text-[#ff1744]"}`}>
                    {trade.result} USDT
                  </td>
                  <td className="px-3 py-3 text-slate-400">{trade.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
