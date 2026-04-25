import { Link, useLocation } from "wouter";
import {
  Bot,
  MessageCircle,
  TrendingUp,
  Building2,
  LayoutGrid,
  Send,
  Activity,
  Settings2,
  CalendarDays,
  Mail,
  PanelLeft,
  CircleCheckBig,
} from "lucide-react";
import DocMenu from "@/components/layout/DocMenu";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  { href: "/", label: "홈", icon: Bot },
  { href: "/chat", label: "AI 채팅", icon: MessageCircle },
  { href: "/trading", label: "트레이딩", icon: TrendingUp },
  { href: "/real-estate-pf", label: "부동산 PF", icon: Building2 },
  { href: "/google", label: "Google Workspace", icon: LayoutGrid },
  { href: "/monitoring", label: "모니터링", icon: Activity },
  { href: "/settings", label: "설정", icon: Settings2 },
];

const quickActions = [
  { label: "AI에게 지시", command: "회장님 업무를 정리해서 실행 계획으로 만들어줘", icon: MessageCircle },
  { label: "Telegram 전송", command: "Telegram으로 전달할 메시지를 정리해줘", icon: Send },
  { label: "메일 작성", command: "Gmail 초안 메일을 작성해줘", icon: Mail },
  { label: "일정 만들기", command: "Calendar 일정 초안을 만들어줘", icon: CalendarDays },
  { label: "포지션 확인", command: "BTC 포지션을 확인해줘", icon: TrendingUp },
  { label: "PF 사업성 분석", command: "부동산 PF 사업성 분석을 요약해줘", icon: Building2 },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [location] = useLocation();

  const desktop = (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-[280px] lg:flex-col border-r border-white/10 bg-[var(--aston-panel)] text-[var(--aston-text)]">
      <div className="flex h-full min-h-0 flex-col p-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <Link href="/">
            <a className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold">에스턴 워크스테이션</div>
                <div className="truncate text-xs text-[var(--aston-muted)]">Aston Workstation</div>
              </div>
            </a>
          </Link>

          <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between text-xs text-[var(--aston-muted)]">
              <span>운영 상태</span>
              <span className="inline-flex items-center gap-1 text-emerald-300">
                <CircleCheckBig className="h-3.5 w-3.5" />
                안정
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300">
                Google
              </span>
              <span className="inline-flex items-center rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300">
                Telegram
              </span>
              <span className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-[var(--aston-muted)]">
                API
              </span>
            </div>
          </div>
        </div>

        <nav className="mt-4 flex-1 space-y-1 overflow-y-auto pr-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link key={href} href={href}>
                <a
                  onClick={onClose}
                  className={[
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition",
                    active
                      ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]"
                      : "border-transparent text-[var(--aston-muted)] hover:border-white/10 hover:bg-white/5 hover:text-[var(--aston-text)]",
                  ].join(" ")}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-cyan-300" : "text-[var(--aston-muted)]"}`} />
                  <span className="font-medium">{label}</span>
                </a>
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--aston-muted)]">
            빠른 실행
          </div>
          <div className="mt-2 grid gap-2">
            {quickActions.map(({ label, command, icon: Icon }) => (
              <Link key={label} href={`/chat?command=${encodeURIComponent(command)}`}>
                <a
                  onClick={onClose}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[var(--aston-text)] transition hover:border-cyan-500/30 hover:bg-white/5 hover:text-cyan-200"
                >
                  <Icon className="h-4 w-4 text-cyan-300" />
                  <span>{label}</span>
                </a>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <DocMenu onNavigate={onClose} />
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[var(--aston-muted)]">
          <div className="flex items-center gap-2 text-[var(--aston-text)]">
            <PanelLeft className="h-3.5 w-3.5 text-cyan-300" />
            <span className="font-medium">Aston Executive Mode</span>
          </div>
          <div className="mt-1">Google Workspace · Telegram · AI · Trading · PF</div>
        </div>
      </div>
    </aside>
  );

  const mobile = (
    <aside
      className={[
        "fixed inset-y-0 left-0 z-50 w-[280px] border-r border-white/10 bg-[var(--aston-panel)] text-[var(--aston-text)] lg:hidden",
        "transform transition-transform duration-300",
        isOpen ? "translate-x-0" : "-translate-x-full",
      ].join(" ")}
    >
      <div className="flex h-full min-h-0 flex-col p-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">에스턴 워크스테이션</div>
              <div className="truncate text-xs text-[var(--aston-muted)]">Aston Workstation</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300">
              Google
            </span>
            <span className="inline-flex items-center rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300">
              Telegram
            </span>
            <span className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-[var(--aston-muted)]">
              API
            </span>
          </div>
        </div>

        <nav className="mt-4 flex-1 space-y-1 overflow-y-auto pr-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link key={href} href={href}>
                <a
                  onClick={onClose}
                  className={[
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition",
                    active
                      ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                      : "border-transparent text-[var(--aston-muted)] hover:border-white/10 hover:bg-white/5 hover:text-[var(--aston-text)]",
                  ].join(" ")}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-cyan-300" : "text-[var(--aston-muted)]"}`} />
                  <span className="font-medium">{label}</span>
                </a>
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--aston-muted)]">
            빠른 실행
          </div>
          <div className="mt-2 grid gap-2">
            {quickActions.map(({ label, command, icon: Icon }) => (
              <Link key={label} href={`/chat?command=${encodeURIComponent(command)}`}>
                <a
                  onClick={onClose}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[var(--aston-text)] transition hover:border-cyan-500/30 hover:bg-white/5 hover:text-cyan-200"
                >
                  <Icon className="h-4 w-4 text-cyan-300" />
                  <span>{label}</span>
                </a>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <DocMenu onNavigate={onClose} />
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[var(--aston-muted)]">
          <div className="flex items-center gap-2 text-[var(--aston-text)]">
            <PanelLeft className="h-3.5 w-3.5 text-cyan-300" />
            <span className="font-medium">Aston Executive Mode</span>
          </div>
          <div className="mt-1">Google Workspace · Telegram · AI · Trading · PF</div>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {desktop}
      {mobile}
    </>
  );
}
