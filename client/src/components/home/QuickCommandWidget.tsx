import { MessageCircle } from "lucide-react";
import { Link } from "wouter";

const commands = [
  "Binance 잔고 조회",
  "오늘 매매 복기",
  "PF 현황",
  "BTC 분석",
  "DART 공시 조회",
  "회사명으로 DART 검색",
];

export default function QuickCommandWidget() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
          <MessageCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-card-foreground">Quick AI Commands</h3>
          <p className="text-xs text-muted-foreground">채팅 입력창으로 바로 보내는 단축어입니다.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {commands.map((command) => (
          <Link
            key={command}
            href={`/chat?command=${encodeURIComponent(command)}`}
            className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:border-cyan-600/50 hover:text-cyan-400"
          >
            {command}
          </Link>
        ))}
      </div>
    </div>
  );
}
