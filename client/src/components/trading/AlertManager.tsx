import { Bell, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

export default function AlertManager() {
  const [form, setForm] = useState({
    type: "price" as "price" | "rsi" | "funding" | "kimchi_premium",
    exchange: "binance" as "binance" | "upbit" | "bybit",
    symbol: "BTC/USDT",
    operator: "above" as "above" | "below",
    value: "66000",
  });
  const utils = trpc.useUtils();
  const alertsQuery = trpc.trading.getAlerts.useQuery(undefined, { retry: false });
  const setAlert = trpc.trading.setAlert.useMutation({
    onSuccess: () => utils.trading.getAlerts.invalidate(),
  });
  const removeAlert = trpc.trading.removeAlert.useMutation({
    onSuccess: () => utils.trading.getAlerts.invalidate(),
  });

  const submit = () => {
    const value = Number(form.value);
    if (!Number.isFinite(value)) return;
    setAlert.mutate({ ...form, value });
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Bell className="h-4 w-4 text-cyan-400" />
          알림 설정
        </h2>
      </div>

      <div className="mb-4 grid gap-2 md:grid-cols-[0.8fr_0.8fr_1fr_0.8fr_0.8fr_auto]">
        <select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as typeof form.type }))} className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white">
          <option value="price">가격</option>
          <option value="rsi">RSI</option>
          <option value="funding">펀딩비</option>
          <option value="kimchi_premium">김프</option>
        </select>
        <select value={form.exchange} onChange={(e) => setForm((prev) => ({ ...prev, exchange: e.target.value as typeof form.exchange }))} className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white">
          <option value="binance">Binance</option>
          <option value="upbit">Upbit</option>
          <option value="bybit">Bybit</option>
        </select>
        <input value={form.symbol} onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value }))} className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white" />
        <select value={form.operator} onChange={(e) => setForm((prev) => ({ ...prev, operator: e.target.value as typeof form.operator }))} className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white">
          <option value="above">이상</option>
          <option value="below">이하</option>
        </select>
        <input value={form.value} onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))} className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white" />
        <button onClick={submit} disabled={setAlert.isPending} className="flex items-center justify-center gap-1 rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
          {setAlert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          추가
        </button>
      </div>

      {alertsQuery.isLoading ? (
        <div className="flex items-center text-sm text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          알림 조회 중
        </div>
      ) : alertsQuery.error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
          Redis 연결을 확인해주세요.
        </div>
      ) : !alertsQuery.data?.length ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-6 text-center text-sm text-slate-400">
          등록된 알림이 없습니다.
        </div>
      ) : (
        <div className="grid gap-3">
          {alertsQuery.data.map((alert) => (
            <div key={alert.id} className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-white">{alert.symbol}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {alert.exchange} · {alert.type} {alert.operator === "above" ? "이상" : "이하"} {alert.value}
                </p>
              </div>
              <button
                onClick={() => removeAlert.mutate({ alertId: alert.id })}
                disabled={removeAlert.isPending}
                className="rounded-md p-2 text-slate-400 hover:bg-red-950/30 hover:text-[#ff1744] disabled:opacity-50"
                aria-label="Delete alert"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
