import { FormEvent, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Bell, Bot, Menu, Search, ShieldCheck, Sparkles, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface StatusBarProps {
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
}

const connectionItems = [
  { label: "Google", tone: "success" },
  { label: "Telegram", tone: "info" },
  { label: "API", tone: "neutral" },
] as const;

export default function StatusBar({ title, subtitle, onMenuClick }: StatusBarProps) {
  const [, navigate] = useLocation();
  const [command, setCommand] = useState("");

  const chips = useMemo(
    () =>
      connectionItems.map((item) => {
        const toneClass =
          item.tone === "success"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : item.tone === "info"
              ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
              : "border-slate-500/30 bg-slate-500/10 text-slate-300";

        return (
          <span
            key={item.label}
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-medium tracking-tight ${toneClass}`}
          >
            {item.label}
          </span>
        );
      }),
    []
  );

  const submitCommand = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = command.trim();
    if (!trimmed) return;
    navigate(`/chat?command=${encodeURIComponent(trimmed)}`);
    setCommand("");
  };

  return (
    <header className="sticky top-0 z-30 h-12 border-b border-white/10 bg-[var(--aston-surface)]/90 backdrop-blur-xl">
      <div className="flex h-full items-center gap-3 px-3 sm:px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onMenuClick}
            className="rounded-md border border-white/10 bg-white/5 text-[var(--aston-text)] hover:bg-white/10 lg:hidden"
            aria-label="메뉴 열기"
          >
            <Menu className="h-4 w-4" />
          </Button>

          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--aston-text)]">
                {title}
              </div>
              {subtitle ? (
                <div className="truncate text-[11px] text-[var(--aston-muted)]">{subtitle}</div>
              ) : null}
            </div>
          </div>
        </div>

        <form onSubmit={submitCommand} className="hidden min-w-0 flex-1 md:flex">
          <div className="relative w-full max-w-2xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--aston-muted)]" />
            <Input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="무엇을 도와드릴까요?"
              className="h-8 border-white/10 bg-black/20 pl-9 text-sm text-[var(--aston-text)] placeholder:text-[var(--aston-muted)] focus-visible:border-cyan-500/40 focus-visible:ring-cyan-500/20"
            />
          </div>
        </form>

        <div className="flex items-center gap-2 overflow-hidden">
          <div className="hidden items-center gap-2 lg:flex">{chips}</div>

          <Badge
            variant="outline"
            className="hidden border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-[var(--aston-muted)] md:inline-flex"
          >
            <Wifi className="mr-1 h-3 w-3 text-cyan-300" />
            연결 안정
          </Badge>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-md border border-white/10 bg-white/5 text-[var(--aston-text)] hover:bg-white/10"
            aria-label="알림"
          >
            <Bell className="h-4 w-4" />
          </Button>

          <div className="hidden items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[var(--aston-text)] md:flex">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
            <span className="font-medium">회장님</span>
            <span className="text-[var(--aston-muted)]">/ Admin</span>
          </div>

          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-xs font-semibold text-cyan-200">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </header>
  );
}
