import { FileText, Landmark } from "lucide-react";
import { Link } from "wouter";

const actions = ["Company search", "Disclosures", "Statements"] as const;

export default function FinanceSummaryWidget() {
  return (
    <Link
      href="/finance"
      className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-cyan-600/50 hover:bg-card/80"
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15">
          <Landmark className="h-5 w-5 text-cyan-400" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-card-foreground">DART Finance</h3>
          <p className="text-xs text-muted-foreground">공시, 회사정보, 재무제표 바로 진입</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4 text-cyan-400" />
          <span>Search company by name or corpCode</span>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {actions.map((action) => (
            <span
              key={action}
              className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium text-secondary-foreground"
            >
              {action}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
