import { MessageCircle } from "lucide-react";
import { Link } from "wouter";

const commands = [
  "오늘 메일 요약",
  "BTC 포지션 확인",
  "한남 PF 진행상황",
  "오늘 일정 브리핑",
  "Telegram 최근 메시지",
]; // MODIFIED: align home quick commands with the Aston command-center language.

export default function QuickCommandWidget() {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10">
          <MessageCircle className="h-5 w-5 text-cyan-300" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-[var(--aston-text)]">빠른 AI 명령</h3>
          <p className="text-xs text-[var(--aston-muted)]">자주 쓰는 지시를 한 번에 보냅니다.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {commands.map((command) => (
          <Link key={command} href={`/chat?command=${encodeURIComponent(command)}`}>
            <a className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[var(--aston-text)] transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-200">
              {command}
            </a>
          </Link>
        ))}
      </div>
    </div>
  );
}
