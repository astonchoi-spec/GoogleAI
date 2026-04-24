import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { TradingMarket } from "./ChartArea";

type ManualTradeRow = {
  id: string;
  date: string;
  market: TradingMarket;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  fee: number;
  note: string;
};

type ManualFormState = Omit<ManualTradeRow, "id">;

const EMPTY_FORM: ManualFormState = {
  date: new Date().toISOString().slice(0, 10),
  market: "kr-stock",
  symbol: "",
  side: "buy",
  quantity: 1,
  entryPrice: 0,
  exitPrice: 0,
  fee: 0,
  note: "",
};

const MARKET_OPTIONS: Array<{ key: TradingMarket; label: string }> = [
  { key: "crypto", label: "Crypto" },
  { key: "kr-stock", label: "KR Stock" },
  { key: "us-stock", label: "US Stock" },
  { key: "kr-futures", label: "KR Futures" },
  { key: "us-futures", label: "US Futures" },
];

function parseCsvRows(text: string): Array<Record<string, string>> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1);
  return rows.map((line) => {
    const cols = line.split(",").map((col) => col.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cols[index] ?? "";
    });
    return row;
  });
}

function normalizeMarket(value: string): TradingMarket {
  const v = value.trim().toLowerCase();
  if (v === "crypto") return "crypto";
  if (v === "kr-stock" || v === "kr_stock") return "kr-stock";
  if (v === "us-stock" || v === "us_stock") return "us-stock";
  if (v === "kr-futures" || v === "kr_futures") return "kr-futures";
  if (v === "us-futures" || v === "us_futures") return "us-futures";
  return "kr-stock";
}

export default function TradeJournal({ market }: { market: TradingMarket }) {
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [symbols, setSymbols] = useState("BTC/USDT,ETH/USDT");
  const [manualForm, setManualForm] = useState<ManualFormState>({ ...EMPTY_FORM, market });
  const [manualRows, setManualRows] = useState<ManualTradeRow[]>([]);
  const [csvRows, setCsvRows] = useState<ManualTradeRow[]>([]);

  const statsQuery = trpc.trading.getTradeStats.useQuery({ period }, { retry: false });
  const syncMutation = trpc.trading.syncJournal.useMutation({
    onSuccess: () => statsQuery.refetch(),
  });

  const totalManualPnl = useMemo(() => {
    return manualRows.reduce((acc, row) => {
      const gross = (row.exitPrice - row.entryPrice) * row.quantity * (row.side === "buy" ? 1 : -1);
      return acc + gross - row.fee;
    }, 0);
  }, [manualRows]);

  const handleAddManualRow = () => {
    if (!manualForm.symbol.trim()) return;
    const row: ManualTradeRow = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...manualForm,
      symbol: manualForm.symbol.trim(),
    };
    setManualRows((prev) => [row, ...prev]);
    setManualForm((prev) => ({ ...EMPTY_FORM, market: prev.market, date: prev.date }));
  };

  const handleCsvUpload = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsvRows(text).map((row, index) => ({
      id: `csv-${Date.now()}-${index}`,
      date: row.date || new Date().toISOString().slice(0, 10),
      market: normalizeMarket(row.market || ""),
      symbol: row.symbol || "",
      side: row.side?.toLowerCase() === "sell" ? ("sell" as const) : ("buy" as const),
      quantity: Number(row.quantity || 0),
      entryPrice: Number(row.entryPrice || 0),
      exitPrice: Number(row.exitPrice || 0),
      fee: Number(row.fee || 0),
      note: row.note || "",
    }));
    setCsvRows(parsed.filter((row) => row.symbol.trim().length > 0));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Auto Sync Journal</h2>
        <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as "week" | "month")}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
          >
            <option value="week">This Week</option>
            <option value="month">Last 30 Days</option>
          </select>
          <input
            value={symbols}
            onChange={(event) => setSymbols(event.target.value)}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500"
            placeholder="BTC/USDT,ETH/USDT"
          />
          <button
            onClick={() =>
              syncMutation.mutate({
                exchange: "binance",
                symbols: symbols
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
            disabled={syncMutation.isPending}
            className="inline-flex items-center justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {syncMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync
          </button>
        </div>

        {statsQuery.isLoading ? (
          <div className="mt-4 flex items-center text-sm text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading stats...
          </div>
        ) : statsQuery.error ? (
          <div className="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
            {statsQuery.error.message || "Google Sheets journal is not connected."}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Total Trades", `${statsQuery.data?.totalTrades ?? 0}`],
              ["Win Rate", `${(((statsQuery.data?.winRate ?? 0) * 100)).toFixed(1)}%`],
              ["Total PnL", `${(statsQuery.data?.totalPnl ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`],
              ["Avg PnL Ratio", `${(statsQuery.data?.averagePnlRatio ?? 0).toFixed(2)}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-800/70 p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Manual Entry (Toss fallback)</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <input
            type="date"
            value={manualForm.date}
            onChange={(event) => setManualForm((prev) => ({ ...prev, date: event.target.value }))}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
          />
          <select
            value={manualForm.market}
            onChange={(event) =>
              setManualForm((prev) => ({ ...prev, market: event.target.value as TradingMarket }))
            }
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
          >
            {MARKET_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={manualForm.symbol}
            onChange={(event) => setManualForm((prev) => ({ ...prev, symbol: event.target.value }))}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
            placeholder="e.g. 005930 or AAPL"
          />
          <select
            value={manualForm.side}
            onChange={(event) => setManualForm((prev) => ({ ...prev, side: event.target.value as "buy" | "sell" }))}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
          <input
            type="number"
            value={manualForm.quantity}
            onChange={(event) => setManualForm((prev) => ({ ...prev, quantity: Number(event.target.value || 0) }))}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
            placeholder="Quantity"
          />
          <input
            type="number"
            value={manualForm.entryPrice}
            onChange={(event) => setManualForm((prev) => ({ ...prev, entryPrice: Number(event.target.value || 0) }))}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
            placeholder="Entry"
          />
          <input
            type="number"
            value={manualForm.exitPrice}
            onChange={(event) => setManualForm((prev) => ({ ...prev, exitPrice: Number(event.target.value || 0) }))}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
            placeholder="Exit"
          />
          <input
            type="number"
            value={manualForm.fee}
            onChange={(event) => setManualForm((prev) => ({ ...prev, fee: Number(event.target.value || 0) }))}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
            placeholder="Fee"
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={manualForm.note}
            onChange={(event) => setManualForm((prev) => ({ ...prev, note: event.target.value }))}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
            placeholder="Memo"
          />
          <button
            onClick={handleAddManualRow}
            className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
          >
            Add Manual Row
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Manual trades: {manualRows.length} rows | Estimated net PnL:{" "}
          <span className={totalManualPnl >= 0 ? "text-emerald-400" : "text-red-400"}>
            {totalManualPnl.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </span>
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">CSV Import (Toss fallback)</h2>
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:border-cyan-600/50 hover:text-cyan-300">
            <Upload className="mr-2 h-4 w-4" />
            Select CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => void handleCsvUpload(event.target.files?.[0] ?? null)}
            />
          </label>
          <p className="text-xs text-slate-400">CSV columns: date,market,symbol,side,quantity,entryPrice,exitPrice,fee,note</p>
        </div>

        {csvRows.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/90 text-slate-400">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Market</th>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Side</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Entry</th>
                  <th className="px-3 py-2">Exit</th>
                  <th className="px-3 py-2">Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {csvRows.slice(0, 20).map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">{row.date}</td>
                    <td className="px-3 py-2">{row.market}</td>
                    <td className="px-3 py-2">{row.symbol}</td>
                    <td className="px-3 py-2">{row.side}</td>
                    <td className="px-3 py-2">{row.quantity}</td>
                    <td className="px-3 py-2">{row.entryPrice}</td>
                    <td className="px-3 py-2">{row.exitPrice}</td>
                    <td className="px-3 py-2">{row.fee}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-400">
            No CSV rows loaded.
          </div>
        )}
      </div>
    </div>
  );
}
