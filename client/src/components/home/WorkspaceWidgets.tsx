import PFSummaryWidget from "./PFSummaryWidget";
import QuickCommandWidget from "./QuickCommandWidget";
import TradingSummaryWidget from "./TradingSummaryWidget";

export default function WorkspaceWidgets() {
  return (
    <section className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-5">
      <div className="mx-auto max-w-6xl space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-[var(--aston-text)]">실시간 요약 위젯</h2>
          <p className="mt-1 text-sm text-[var(--aston-muted)]">
            트레이딩, 부동산 PF, 자주 쓰는 명령을 한 곳에 모았습니다.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <TradingSummaryWidget />
          <PFSummaryWidget />
          <QuickCommandWidget />
        </div>
      </div>
    </section>
  );
}
