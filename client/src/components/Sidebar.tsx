import { Link, useLocation } from "wouter";
import {
  Bot,
  LayoutDashboard,
  MessageSquare,
  TrendingUp,
  Building2,
  Mail,
  BookOpen,
  Library,
  Activity,
  Settings,
  Send,
  CalendarPlus,
  BarChart3,
} from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  kind: "link";
  href: string;
  label: string;
  sub: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>;
}

const navItems: NavItem[] = [
  { kind: "link",     href: "/",              label: "홈",              sub: "대시보드",               icon: LayoutDashboard },
  { kind: "link",     href: "/chat",          label: "AI 채팅",          sub: "자연어 지시 · Telegram",  icon: MessageSquare },
  { kind: "link",     href: "/trading",       label: "트레이딩",          sub: "차트 · 포지션 · 분석",    icon: TrendingUp },
  { kind: "link",     href: "/real-estate-pf",label: "부동산 PF",         sub: "딜 · 사업성 분석",        icon: Building2 },
  { kind: "link",     href: "/google",        label: "Google Workspace", sub: "메일 · 드라이브 · 캘린더", icon: Mail },
  { kind: "link",     href: "/notebook-lm",   label: "노트북LM",          sub: "AI 리서치 · 분석",        icon: BookOpen },
  { kind: "link",     href: "/wiki",          label: "에스턴 위키",        sub: "지식 저장소",             icon: Library },
  { kind: "link",     href: "/agents",        label: "Agent Control",   sub: "에이전트 작업 큐",         icon: Bot },
  { kind: "link",     href: "/monitoring",    label: "모니터링",          sub: "시스템 상태",             icon: Activity },
  { kind: "link",     href: "/google?tab=gmail",    label: "메일 작성",   sub: "Gmail 바로가기",   icon: Send },
  { kind: "link",     href: "/google?tab=calendar", label: "일정 만들기", sub: "캘린더 바로가기", icon: CalendarPlus },
  { kind: "link",     href: "/trading",       label: "포지션 확인",       sub: "트레이딩 포지션",         icon: BarChart3 },
  { kind: "link",     href: "/settings",      label: "설정",              sub: "API 키 · 테마",           icon: Settings },
];

const itemStyle = (active: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  borderRadius: "8px",
  padding: "10px 12px",
  border: active ? "1px solid rgba(0,255,255,0.3)" : "1px solid rgba(255,255,255,0.06)",
  background: active ? "rgba(0,255,255,0.07)" : "transparent",
  textDecoration: "none",
  transition: "all 0.15s",
  cursor: "pointer",
  width: "100%",
  boxSizing: "border-box",
});

function NavItemRow({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      style={itemStyle(active)}
      className={active ? "" : "sidebar-nav-inactive"}
    >
      <Icon
        size={18}
        strokeWidth={1.5}
        style={{ flexShrink: 0, color: active ? "rgb(34,211,238)" : "rgb(156,163,175)" }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 500, lineHeight: "1.2", color: active ? "rgb(207,250,254)" : "var(--aston-text)" }}>
          {item.label}
        </div>
        <div style={{ fontSize: "11px", lineHeight: "1.2", color: "var(--aston-muted)", opacity: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.sub}
        </div>
      </div>
    </Link>
  );
}

function SidebarContent({ onClose }: { onClose: () => void }) {
  const [location] = useLocation();

  return (
    <div className="flex h-full flex-col" style={{ padding: "12px 10px 10px" }}>
      {/* Logo */}
      <Link
        href="/"
        onClick={onClose}
        className="flex items-center gap-2 rounded-lg px-3 py-2 mb-3 transition hover:bg-white/5"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-cyan-500/20 bg-cyan-500/10">
          <Bot size={15} strokeWidth={1.5} className="text-cyan-400" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold leading-tight text-[var(--aston-text)]">에스턴 워크스테이션</div>
          <div className="text-[10px] leading-tight text-emerald-400 opacity-80">● 안정 운영 중</div>
        </div>
      </Link>

      {/* Nav items */}
      <nav className="flex flex-col" style={{ gap: "4px" }}>
        {navItems.map((item) => {
          const active = item.kind === "link" && location === item.href;
          return (
            <NavItemRow
              key={item.label}
              item={item}
              active={active}
              onClick={onClose}
            />
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ marginTop: "auto", paddingTop: "10px", textAlign: "center" }}>
        <div style={{ fontSize: "10px", color: "var(--aston-muted)", opacity: 0.4 }}>
          Aston Workstation · Google · Telegram · AI
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      <style>{`
        .sidebar-nav-inactive:hover {
          background: rgba(0,255,255,0.05) !important;
          border-color: rgba(0,255,255,0.15) !important;
        }
      `}</style>

      {/* Desktop */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-[256px] lg:flex-col border-r border-white/10 bg-[var(--aston-panel)] text-[var(--aston-text)]">
        <SidebarContent onClose={onClose} />
      </aside>

      {/* Mobile */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 w-[256px] border-r border-white/10 bg-[var(--aston-panel)] text-[var(--aston-text)] lg:hidden",
          "transform transition-transform duration-300",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <SidebarContent onClose={onClose} />
      </aside>
    </>
  );
}
