import PFSummaryWidget from "./PFSummaryWidget";
import QuickCommandWidget from "./QuickCommandWidget";
import TradingSummaryWidget from "./TradingSummaryWidget";

export default function WorkspaceWidgets() {
  return (
    <section className="px-4 py-20 md:px-0 md:py-32">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold md:text-4xl">워크스테이션 위젯</h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-foreground/60">
            트레이딩, 부동산PF, AI 명령을 한 화면에서 빠르게 시작합니다.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <TradingSummaryWidget />
          <PFSummaryWidget />
          <QuickCommandWidget />
        </div>
      </div>
    </section>
  );
}
