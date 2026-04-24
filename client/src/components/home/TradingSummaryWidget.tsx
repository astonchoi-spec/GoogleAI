import { TrendingUp } from "lucide-react";
import { Link } from "wouter";

export default function TradingSummaryWidget() {
  // TODO: 여기에 tRPC 실시간 데이터 연결
  return (
    <Link href="/trading">
      <a className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-cyan-600/50 hover:bg-card/80">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15">
            <TrendingUp className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-card-foreground">트레이딩 요약</h3>
            <p className="text-xs text-muted-foreground">거래소 포지션과 알림 상태</p>
          </div>
        </div>
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">오늘 손익</span>
            <span className="font-semibold text-[#00c853]">+0.00 USDT</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">활성 포지션</span>
            <span className="text-card-foreground">0개</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">활성 알림</span>
            <span className="text-card-foreground">0개</span>
          </div>
        </div>
      </a>
    </Link>
  );
}
