import { Building2, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

export default function PFSummaryWidget() {
  const summaryQuery = trpc.realestate.portfolioSummary.useQuery(undefined, { retry: false });

  return (
    <Link
      href="/real-estate-pf"
      className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-cyan-600/50 hover:bg-card/80"
    >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/15">
            <Building2 className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-card-foreground">PF 포트폴리오</h3>
            <p className="text-xs text-muted-foreground">딜 파이프라인과 마일스톤</p>
          </div>
        </div>
        {summaryQuery.isLoading ? (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            조회 중
          </div>
        ) : summaryQuery.error ? (
          <p className="text-sm text-red-400">Google Sheets PF 데이터를 연결해주세요.</p>
        ) : (
          <pre className="line-clamp-6 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {summaryQuery.data?.summary || "등록된 PF 요약이 없습니다."}
          </pre>
        )}
    </Link>
  );
}
