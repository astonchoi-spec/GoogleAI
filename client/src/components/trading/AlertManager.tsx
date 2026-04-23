import { Bell, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

const initialAlerts = [
  { id: "1", symbol: "BTC/USDT", condition: "가격 > 66,000", enabled: true },
  { id: "2", symbol: "ETH/USDT", condition: "RSI < 30", enabled: true },
  { id: "3", symbol: "BTC 김프", condition: "김프 > 3%", enabled: false },
];

export default function AlertManager() {
  // TODO: 여기에 tRPC 연결
  const [alerts, setAlerts] = useState(initialAlerts);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Bell className="h-4 w-4 text-cyan-400" />
          알림 설정
        </h2>
        <button className="flex items-center gap-1 rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700">
          <Plus className="h-4 w-4" />
          새 알림 추가
        </button>
      </div>
      <div className="grid gap-3">
        {alerts.map((alert) => (
          <div key={alert.id} className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-white">{alert.symbol}</p>
              <p className="mt-1 text-sm text-slate-400">{alert.condition}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setAlerts((prev) => prev.map((item) => item.id === alert.id ? { ...item, enabled: !item.enabled } : item))}
                className={`relative h-6 w-11 rounded-full transition-colors ${alert.enabled ? "bg-cyan-500" : "bg-slate-600"}`}
                aria-label="Toggle alert"
              >
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${alert.enabled ? "left-6" : "left-1"}`} />
              </button>
              <button
                onClick={() => setAlerts((prev) => prev.filter((item) => item.id !== alert.id))}
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
