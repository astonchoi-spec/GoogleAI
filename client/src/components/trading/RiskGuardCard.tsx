import { useEffect, useState, useCallback } from "react";
import { ShieldAlert, ShieldCheck, ShieldOff, Loader2, ChevronDown, ChevronUp } from "lucide-react";

type RiskState = {
  settings: {
    dailyLossLimitPercent: number;
    consecutiveLossWarn: number;
    consecutiveLossBlock: number;
    leverageCaps: Record<string, number>;
    defaultRiskPercent: number;
  };
  daily: {
    date: string;
    realizedPnl: number;
    startingBalance: number;
    losses: number;
    wins: number;
  };
  consecutiveLosses: number;
  manualLock: { locked: boolean; reason?: string; since?: string };
  dailyPnlPercent: number;
};

export default function RiskGuardCard() {
  const [state, setState] = useState<RiskState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/trading/risk/status");
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as RiskState;
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const callPost = async (path: string, body: unknown = {}) => {
    setBusy(true);
    try {
      await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const blocked =
    !!state?.manualLock.locked ||
    (state ? state.dailyPnlPercent <= -state.settings.dailyLossLimitPercent : false) ||
    (state ? state.consecutiveLosses >= state.settings.consecutiveLossBlock : false);
  const warned =
    !!state &&
    !blocked &&
    state.consecutiveLosses >= state.settings.consecutiveLossWarn;
  const tradable = !!state && !blocked;

  const StatusIcon = blocked
    ? ShieldOff
    : warned
      ? ShieldAlert
      : ShieldCheck;
  const statusBadge = blocked
    ? { label: "거래 차단", cls: "border-rose-500/30 bg-rose-500/10 text-rose-300" }
    : warned
      ? { label: "경고", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" }
      : tradable
        ? { label: "거래 가능", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" }
        : { label: "확인 중", cls: "border-white/10 bg-white/5 text-[var(--aston-muted)]" };
  const iconColor = blocked
    ? "text-rose-400"
    : warned
      ? "text-amber-400"
      : tradable
        ? "text-emerald-400"
        : "text-slate-400";

  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] px-5 py-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <div className="flex items-center gap-2 font-semibold text-[var(--aston-text)]">
            <StatusIcon className={`h-5 w-5 ${iconColor}`} />
            <span>🛡 Risk Guard</span>
          </div>

          {error && <span className="text-rose-400">상태 조회 실패: {error}</span>}

          {!state && !error && (
            <span className="flex items-center gap-1 text-[var(--aston-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 로딩 중
            </span>
          )}

          {state && (
            <>
              <span className="text-[var(--aston-muted)]">
                오늘 손익:{" "}
                <span className={state.dailyPnlPercent < 0 ? "text-rose-300" : "text-emerald-300"}>
                  {state.dailyPnlPercent.toFixed(2)}%
                </span>{" "}
                / 한도 -{state.settings.dailyLossLimitPercent}%
              </span>
              <span className="text-[var(--aston-muted)]">
                연속 손실:{" "}
                <span
                  className={
                    state.consecutiveLosses >= state.settings.consecutiveLossBlock
                      ? "text-rose-300"
                      : state.consecutiveLosses >= state.settings.consecutiveLossWarn
                        ? "text-amber-300"
                        : "text-[var(--aston-text)]"
                  }
                >
                  {state.consecutiveLosses}회
                </span>
              </span>
              <span className="text-[var(--aston-muted)]">
                잠금:{" "}
                <span className={state.manualLock.locked ? "text-rose-300" : "text-emerald-300"}>
                  {state.manualLock.locked ? "잠김" : "해제"}
                </span>
              </span>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full border px-2 py-1 text-xs ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-[var(--aston-muted)]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--aston-muted)]" />
          )}
        </div>
      </button>

      {expanded && state && (
        <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-[var(--aston-muted)]">자산별 레버리지 상한</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {Object.entries(state.settings.leverageCaps)
                .filter(([k]) => k !== "default")
                .map(([asset, cap]) => (
                  <span
                    key={asset}
                    className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[var(--aston-text)]"
                  >
                    {asset}: {cap}x
                  </span>
                ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Cell label="기본 리스크" value={`${state.settings.defaultRiskPercent}%`} />
            <Cell label="경고 임계치" value={`${state.settings.consecutiveLossWarn}회`} />
            <Cell label="차단 임계치" value={`${state.settings.consecutiveLossBlock}회`} />
            <Cell label="시작 잔고" value={state.daily.startingBalance.toLocaleString()} />
          </div>

          <div className="flex flex-wrap gap-2">
            {state.manualLock.locked ? (
              <button
                disabled={busy}
                onClick={() => callPost("/api/trading/risk/unlock")}
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                거래 재개
              </button>
            ) : (
              <button
                disabled={busy}
                onClick={() => callPost("/api/trading/risk/lock", { reason: "대시보드 수동 잠금" })}
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
              >
                오늘 거래 중지
              </button>
            )}
            <button
              disabled={busy}
              onClick={refresh}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[var(--aston-text)] hover:bg-white/10 disabled:opacity-50"
            >
              새로고침
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-[var(--aston-muted)]">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-[var(--aston-text)]">{value}</div>
    </div>
  );
}
