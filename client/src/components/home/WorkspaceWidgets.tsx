import FinanceSummaryWidget from "./FinanceSummaryWidget";
import PFSummaryWidget from "./PFSummaryWidget";
import QuickCommandWidget from "./QuickCommandWidget";
import TradingSummaryWidget from "./TradingSummaryWidget";

export default function WorkspaceWidgets() {
  return (
    <section className="px-4 py-20 md:px-0 md:py-32">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold md:text-4xl">Workspace Overview</h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-foreground/60">
            Trading, real estate, finance, and quick AI access are available from one dashboard.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          <TradingSummaryWidget />
          <PFSummaryWidget />
          <FinanceSummaryWidget />
          <QuickCommandWidget />
        </div>
      </div>
    </section>
  );
}
