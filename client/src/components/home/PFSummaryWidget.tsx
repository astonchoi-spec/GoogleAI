import { Building2 } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

function formatEok(value: number): string {
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`;
}

export default function PFSummaryWidget() {
  const deals = trpc.realestate.getDeals.useQuery(undefined, { retry: false }); // MODIFIED: populate PF widget counters from live deal pipeline query.

  const totalExposure = (deals.data ?? []).reduce((sum, deal) => sum + (deal.loanAmount || 0), 0);
  const inProgress = (deals.data ?? []).filter((d) => d.stage !== "완료").length;
  const thisWeekMilestones = (deals.data ?? []).filter((d) => {
    if (!d.nextMilestoneDate) return false;
    const date = new Date(d.nextMilestoneDate);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    const days = (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 7;
  }).length;

  return (
    <Link href="/real-estate-pf">
      <a className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-cyan-600/50 hover:bg-card/80">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/15">
            <Building2 className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-card-foreground">PF Portfolio</h3>
            <p className="text-xs text-muted-foreground">Pipeline and milestone status</p>
          </div>
        </div>
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">In progress</span>
            <span className="text-card-foreground">{deals.isLoading ? "..." : `${inProgress}건`}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total exposure</span>
            <span className="text-card-foreground">{deals.isLoading ? "..." : formatEok(totalExposure)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Milestones (7d)</span>
            <span className="text-card-foreground">{deals.isLoading ? "..." : `${thisWeekMilestones}건`}</span>
          </div>
        </div>
      </a>
    </Link>
  );
}
