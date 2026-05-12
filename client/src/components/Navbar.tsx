import { Link, useLocation } from "wouter";
import {
  Home,
  MessageCircle,
  LayoutGrid,
  ChevronLeft,
  Bot,
  TrendingUp,
  Building2,
  Settings2,
  Activity,
} from "lucide-react";

const NAV_LINKS = [
  { href: "/", icon: Home, label: "홈" },
  { href: "/chat", icon: MessageCircle, label: "AI 채팅" },
  { href: "/trading", icon: TrendingUp, label: "트레이딩" },
  { href: "/real-estate-pf", icon: Building2, label: "부동산PF" },
  { href: "/google", icon: LayoutGrid, label: "Google Workspace" },
  { href: "/settings", icon: Settings2, label: "설정" },
  { href: "/monitoring", icon: Activity, label: "모니터링" }, // MODIFIED: surface analytics dashboard in primary navigation.
];

const BACK_LINKS: Record<string, string> = {
  "/chat": "/",
  "/google": "/chat",
  "/settings": "/google",
  "/monitoring": "/settings", // MODIFIED: keep the analytics page in the back-navigation chain.
  "/trading": "/chat",
  "/real-estate-pf": "/trading",
};

export default function Navbar() {
  const [location] = useLocation();
  const currentIdx = NAV_LINKS.findIndex((n) => n.href === location);
  const backHref = BACK_LINKS[location] ?? (currentIdx > 0 ? NAV_LINKS[currentIdx - 1].href : "/");
  const isHome = location === "/";

  return (
    <header className="sticky top-0 z-50 w-full bg-slate-950/80 backdrop-blur-md border-b border-slate-800/60">
      <div className="max-w-5xl mx-auto px-4 h-12 flex items-center gap-3">
        {!isHome ? (
          <Link href={backHref} className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm mr-1">
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">뒤로</span>
          </Link>
        ) : null}

        <Link href="/" className="flex items-center gap-2 font-bold text-white">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent hidden sm:inline">
            GoogleTG 워크스테이션
          </span>
        </Link>

        <div className="flex-1" />

        <nav className="flex max-w-full items-center gap-1 overflow-x-auto pb-1">
          {NAV_LINKS.map(({ href, icon: Icon, label }) => {
            const isActive = location === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-cyan-600/20 text-cyan-400 border border-cyan-600/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
