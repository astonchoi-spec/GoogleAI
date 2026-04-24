import { Building2 } from "lucide-react";
import { Link } from "wouter";

export default function PFSummaryWidget() {
  // TODO: 여기에 tRPC 실시간 데이터 연결
  return (
    <Link href="/real-estate-pf">
      <a className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-cyan-600/50 hover:bg-card/80">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/15">
            <Building2 className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-card-foreground">PF 포트폴리오</h3>
            <p className="text-xs text-muted-foreground">딜 파이프라인과 마일스톤</p>
          </div>
        </div>
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">진행 중 딜</span>
            <span className="text-card-foreground">0건</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">총 익스포저</span>
            <span className="text-card-foreground">0억</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">이번 주 마일스톤</span>
            <span className="text-card-foreground">0건</span>
          </div>
        </div>
      </a>
    </Link>
  );
}
