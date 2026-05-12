import { Activity, Bell, Wallet } from "lucide-react";
import { trpc } from "@/lib/trpc";

function sumTotal(total: Record<string, number>): number {
  return Object.values(total).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
}

export default function PortfolioSummary() {
  const binanceBal = trpc.trading.getBalance.useQuery({ exchange: "binance" }, { retry: false });
  const binancePos = trpc.trading.getPositions.useQuery({ exchange: "binance" }, { retry: false });
  const upbitBal   = trpc.trading.getBalance.useQuery({ exchange: "upbit" }, { retry: false });
  const alerts     = trpc.trading.listAlerts.useQuery(undefined, { retry: false });

  const binanceOk  = !binanceBal.isError;  // loading or data — binance configured
  const upbitOk    = !upbitBal.isError;    // loading or data — upbit configured
  const anyLoading = binanceBal.isLoading || upbitBal.isLoading;

  // 두 거래소 다 키 없음 (로딩 완료 후 둘 다 에러)
  if (!anyLoading && !binanceOk && !upbitOk) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] flex items-center gap-2 px-4 py-3 text-sm text-[var(--aston-muted)]">
        <Wallet className="h-4 w-4 text-slate-500 shrink-0" />
        <span>거래소 API 키를 설정해주세요</span>
      </div>
    );
  }

  const totalAsset    = binanceBal.data ? sumTotal(binanceBal.data.total) : 0;
  const totalPnl      = (binancePos.data ?? []).reduce((s, p) => s + (p.unrealizedPnl ?? 0), 0);
  const openPositions = (binancePos.data ?? []).length;
  const activeAlerts  = (alerts.data ?? []).filter((a) => a.active).length;
  const upbitKrw      = upbitBal.data?.total?.KRW ?? 0;
  const upbitCoins    = upbitBal.data
    ? Object.entries(upbitBal.data.total).filter(([k, v]) => k !== "KRW" && v > 0)
    : [];

  const fmtUsdt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const fmtKrw  = (v: number) => v.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4">
      <div className="mb-4 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold text-[var(--aston-text)]">Portfolio Summary</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {/* Binance — API 키 있을 때만 */}
        {binanceOk && (
          <>
            <div className="rounded-xl border border-white/10 bg-black/15 p-3">
              <p className="text-xs text-[var(--aston-muted)]">Total Asset (Binance)</p>
              <p className="mt-1 text-lg font-semibold text-[var(--aston-text)]">
                {binanceBal.isLoading ? "Loading..." : `${fmtUsdt(totalAsset)} USDT`}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/15 p-3">
              <p className="text-xs text-[var(--aston-muted)]">Unrealized PnL</p>
              <p className={`mt-1 text-lg font-semibold ${totalPnl >= 0 ? "text-[#00c853]" : "text-[#ff1744]"}`}>
                {binanceBal.isLoading ? "Loading..." : `${totalPnl >= 0 ? "+" : ""}${fmtUsdt(totalPnl)} USDT`}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/15 p-3">
              <p className="text-xs text-[var(--aston-muted)]">Open Positions</p>
              <p className="mt-1 text-lg font-semibold text-cyan-300">
                {binanceBal.isLoading ? "Loading..." : `${openPositions}`}
              </p>
            </div>
          </>
        )}

        {/* Upbit — API 키 있을 때만 */}
        {upbitOk && (
          <div className="rounded-xl border border-white/10 bg-black/15 p-3 sm:col-span-3">
            <p className="text-xs text-[var(--aston-muted)]">총 자산 (Upbit)</p>
            {upbitBal.isLoading ? (
              <p className="mt-1 text-lg font-semibold text-[var(--aston-text)]">Loading...</p>
            ) : (
              <>
                <p className="mt-1 text-lg font-semibold text-[var(--aston-text)]">
                  ₩{fmtKrw(upbitKrw)} KRW
                </p>
                {upbitCoins.length > 0 && (
                  <p className="mt-1 text-xs text-[var(--aston-muted)]">
                    보유: {upbitCoins.map(([k, v]) => `${k} ${v.toFixed(4)}`).join(" · ")}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {/* Live position 배너 — 거래소 연결 시만 */}
        <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300">
          <Activity className="h-3.5 w-3.5" />
          Live position snapshot enabled
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
          <Bell className="h-3.5 w-3.5" />
          Active alerts: {alerts.isLoading ? "..." : activeAlerts}
        </div>
      </div>
    </div>
  );
}
