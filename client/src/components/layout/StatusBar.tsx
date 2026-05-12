import { FormEvent, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Bell, Bot, KeyRound, LogIn, Menu, Search, Send, ShieldCheck, Sparkles, Wifi } from "lucide-react"; // MODIFIED: add explicit icons for top-bar action buttons.
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { watchPopupClose } from "@/lib/popupMonitor";
import { trpc } from "@/lib/trpc";

interface StatusBarProps {
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
}

const connectionItems = [
  { label: "Google", tone: "success", href: "/google" },
  { label: "Telegram", tone: "info", href: "/chat?source=telegram" },
  { label: "API", tone: "neutral", href: "/chat?openApiSettings=1" },
] as const;

export default function StatusBar({ title, subtitle, onMenuClick }: StatusBarProps) {
  const [, navigate] = useLocation();
  const [command, setCommand] = useState("");
  const utils = trpc.useUtils();
  const { data: googleAuthStatus, isLoading: isGoogleAuthLoading } =
    trpc.googleWorkspace.isAuthenticated.useQuery(); // MODIFIED: keep loading, logged-out, and connected states visually distinct.
  const { data: googleAuthUrlData, refetch: refetchGoogleAuthUrl } =
    trpc.googleWorkspace.getAuthUrl.useQuery(); // MODIFIED: keep the Google OAuth URL warm for a direct popup launch.

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
          <button
            key={item.label}
            type="button"
            onClick={() => navigate(item.href)} // MODIFIED: status chips now open the real integration surface instead of being decorative labels.
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-medium tracking-tight transition hover:border-cyan-400/40 hover:bg-cyan-500/10 ${toneClass}`}
          >
            {item.label}
          </button>
        );
      }),
    [navigate]
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
            onClick={() => navigate("/monitoring")} // MODIFIED: bell button now opens monitoring instead of being a dead control.
            className="rounded-md border border-white/10 bg-white/5 text-[var(--aston-text)] hover:bg-white/10"
            aria-label="알림"
          >
            <Bell className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/chat?openApiSettings=1")} // MODIFIED: expose API key management from the top bar.
            className="hidden h-8 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 text-xs text-[var(--aston-text)] hover:bg-white/10 xl:flex"
          >
            <KeyRound className="h-3.5 w-3.5 text-cyan-300" />
            API 키
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              const popup = window.open("", "_blank", "width=520,height=680");
              if (!popup) {
                navigate("/google");
                return;
              }

              popup.document.write("<p style='font-family:sans-serif;padding:16px'>Google 로그인 창을 여는 중...</p>");

              const authUrl = googleAuthUrlData?.authUrl ?? (await refetchGoogleAuthUrl()).data?.authUrl;
              if (!authUrl) {
                popup.close();
                navigate("/google");
                return;
              }

              popup.location.href = authUrl;
              watchPopupClose(popup, () => {
                void utils.googleWorkspace.isAuthenticated.invalidate();
                void utils.auth.me.invalidate();
              });
            }}
            className="hidden h-8 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 text-xs text-[var(--aston-text)] hover:bg-white/10 md:flex"
          >
            <ShieldCheck
              className={`h-3.5 w-3.5 ${
                googleAuthStatus?.authenticated ? "text-emerald-300" : "text-cyan-300"
              }`}
            />
            <span className="font-medium">
              {isGoogleAuthLoading
                ? "Google 확인 중"
                : googleAuthStatus?.authenticated
                  ? "Google 연결됨"
                  : "Google 로그인"}
            </span>
            <LogIn className="h-3.5 w-3.5 text-cyan-300" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate("/chat?source=telegram")} // MODIFIED: Telegram shortcut opens the unified chat filtered entry point.
            className="hidden rounded-md border border-white/10 bg-white/5 text-cyan-200 hover:bg-white/10 xl:inline-flex"
            aria-label="Telegram 메시지"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>

          <button
            type="button"
            onClick={() => navigate("/settings")} // MODIFIED: sparkle control now opens workspace settings.
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-xs font-semibold text-cyan-200 transition hover:border-cyan-500/30 hover:bg-cyan-500/10"
            aria-label="설정"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
