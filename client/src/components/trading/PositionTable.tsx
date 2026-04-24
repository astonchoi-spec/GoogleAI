import { trpc } from "@/lib/trpc";

function formatPrice(value: number | null): string {
  if (value === null) return "-";
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function formatSigned(value: number | null): string {
  if (value === null) return "-";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
}

export default function PositionTable() {
  const positionsQuery = trpc.trading.getPositions.useQuery({ exchange: "binance" }); // MODIFIED: connect positions table to trading router instead of static demo rows.

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <h2 className="mb-3 text-sm font-semibold text-white">Open Positions</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-left text-xs text-slate-500">
              <th className="px-3 py-2 font-medium">Symbol</th>
              <th className="px-3 py-2 font-medium">Side</th>
              <th className="px-3 py-2 font-medium">Entry</th>
              <th className="px-3 py-2 font-medium">Mark</th>
              <th className="px-3 py-2 font-medium">Unrealized PnL</th>
              <th className="px-3 py-2 font-medium">Leverage</th>
              <th className="px-3 py-2 font-medium">Liquidation</th>
            </tr>
          </thead>
          <tbody>
            {positionsQuery.isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-400">Loading positions...</td>
              </tr>
            )}
            {!positionsQuery.isLoading && positionsQuery.error && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-red-300">
                  Failed to load positions. Check exchange API credentials.
                </td>
              </tr>
            )}
            {!positionsQuery.isLoading && !positionsQuery.error && (positionsQuery.data ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-400">No open positions</td>
              </tr>
            )}
            {(positionsQuery.data ?? []).map((position) => {
              const pnl = position.unrealizedPnl;
              const isProfit = (pnl ?? 0) >= 0;
              return (
                <tr key={`${position.symbol}-${position.side}`} className="border-b border-slate-800 last:border-0">
                  <td className="px-3 py-3 font-medium text-white">{position.symbol || "-"}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${position.side === "long" ? "bg-green-500/15 text-[#00c853]" : "bg-red-500/15 text-[#ff1744]"}`}>
                      {position.side || "-"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-300">{formatPrice(position.entryPrice)}</td>
                  <td className="px-3 py-3 text-slate-300">{formatPrice(position.markPrice)}</td>
                  <td className={`px-3 py-3 font-semibold ${isProfit ? "text-[#00c853]" : "text-[#ff1744]"}`}>
                    {formatSigned(pnl)}
                  </td>
                  <td className="px-3 py-3 text-slate-300">{position.leverage === null ? "-" : `${position.leverage}x`}</td>
                  <td className="px-3 py-3 text-slate-300">{formatPrice(position.liquidationPrice)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

