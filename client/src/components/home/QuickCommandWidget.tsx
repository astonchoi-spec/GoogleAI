import { MessageCircle } from "lucide-react";
import { Link } from "wouter";

const commands = [
  "잔고 조회",
  "포지션 확인",
  "PF 포트폴리오 요약",
  "BTC 기술적 분석",
  "캘린더 일정 생성",
]; // MODIFIED: align home quick commands with current intent-router actions.

export default function QuickCommandWidget() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
          <MessageCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-card-foreground">Quick AI Commands</h3>
          <p className="text-xs text-muted-foreground">Send frequent commands to chat with one click</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {commands.map((command) => (
          <Link key={command} href={`/chat?command=${encodeURIComponent(command)}`}>
            <a className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:border-cyan-600/50 hover:text-cyan-400">
              {command}
            </a>
          </Link>
        ))}
      </div>
    </div>
  );
}
