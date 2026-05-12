import { Bell, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function AlertManager() {
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [value, setValue] = useState(0);
  const [operator, setOperator] = useState<"above" | "below">("above");
  const [type, setType] = useState<"price" | "rsi" | "funding" | "kimchi_premium">("price");
  const [exchange, setExchange] = useState<"binance" | "upbit" | "bybit">("binance");
  const [telegramChatId, setTelegramChatId] = useState("");
  const utils = trpc.useUtils();

  const alertsQuery = trpc.trading.listAlerts.useQuery(); // MODIFIED: load alerts from Redis-backed alert engine through trading router.
  const addMutation = trpc.trading.addAlert.useMutation({
    onSuccess: async () => {
      await utils.trading.listAlerts.invalidate(); // MODIFIED: refresh alert list after creation.
      toast.success("Alert added");
    },
    onError: (error) => toast.error(error.message),
  });
  const removeMutation = trpc.trading.removeAlert.useMutation({
    onSuccess: async () => {
      await utils.trading.listAlerts.invalidate(); // MODIFIED: refresh alert list after deletion.
      toast.success("Alert removed");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Bell className="h-4 w-4 text-cyan-400" />
          Alert Settings
        </h2>
      </div>

      <div className="mb-4 grid gap-2 md:grid-cols-6">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
          placeholder="Symbol (e.g. BTC/USDT)"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "price" | "rsi" | "funding" | "kimchi_premium")}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
        >
          <option value="price">price</option>
          <option value="rsi">rsi</option>
          <option value="funding">funding</option>
          <option value="kimchi_premium">kimchi_premium</option>
        </select>
        <select
          value={operator}
          onChange={(e) => setOperator(e.target.value as "above" | "below")}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
        >
          <option value="above">above</option>
          <option value="below">below</option>
        </select>
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
          placeholder="Trigger value"
        />
        <select
          value={exchange}
          onChange={(e) => setExchange(e.target.value as "binance" | "upbit" | "bybit")}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
        >
          <option value="binance">binance</option>
          <option value="upbit">upbit</option>
          <option value="bybit">bybit</option>
        </select>
        <input
          value={telegramChatId}
          onChange={(e) => setTelegramChatId(e.target.value)}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
          placeholder="Telegram chatId"
        />
      </div>

      <button
        onClick={() => addMutation.mutate({ symbol, type, operator, value, exchange, telegramChatId })} // MODIFIED: create alert via backend mutation instead of local-only state append.
        disabled={addMutation.isPending || !telegramChatId.trim()}
        className="mb-4 flex items-center gap-1 rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60"
      >
        <Plus className="h-4 w-4" />
        Add Alert
      </button>

      <div className="grid gap-3">
        {alertsQuery.isLoading && <p className="text-sm text-slate-400">Loading alerts...</p>}
        {alertsQuery.error && <p className="text-sm text-red-300">{alertsQuery.error.message}</p>}
        {(alertsQuery.data ?? []).map((alert) => (
          <div key={alert.id} className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-white">{alert.symbol}</p>
              <p className="mt-1 text-sm text-slate-400">
                {alert.type} {alert.operator} {alert.value} ({alert.exchange}) - {alert.active ? "active" : "inactive"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => removeMutation.mutate({ id: alert.id })} // MODIFIED: remove alert through server mutation for consistent Redis state.
                className="rounded-md p-2 text-slate-400 hover:bg-red-950/30 hover:text-[#ff1744]"
                aria-label="Delete alert"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

