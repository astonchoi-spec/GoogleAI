import { ChevronLeft, Bot, Building2, Home, Landmark, LayoutGrid, MessageCircle, TrendingUp } from "lucide-react";
import { Link, useLocation } from "wouter";

const NAV_LINKS = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/chat", icon: MessageCircle, label: "AI Chat" },
  { href: "/trading", icon: TrendingUp, label: "Trading" },
  { href: "/real-estate-pf", icon: Building2, label: "Real Estate PF" },
  { href: "/finance", icon: Landmark, label: "DART" },
  { href: "/google", icon: LayoutGrid, label: "Google Workspace" },
] as const;

const BACK_LINKS: Record<string, string> = {
  "/chat": "/",
  "/trading": "/chat",
  "/real-estate-pf": "/trading",
  "/finance": "/real-estate-pf",
  "/google": "/chat",
};

export default function Navbar() {
  const [location] = useLocation();
  const currentIdx = NAV_LINKS.findIndex((item) => item.href === location);
  const backHref = BACK_LINKS[location] ?? (currentIdx > 0 ? NAV_LINKS[currentIdx - 1].href : "/");
  const isHome = location === "/";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-5xl items-center gap-3 px-4">
        {!isHome ? (
          <Link href={backHref} className="mr-1 flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white">
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Link>
        ) : null}

        <Link href="/" className="flex items-center gap-2 font-bold text-white">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-cyan-500 to-blue-600">
            <Bot className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="hidden bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-sm text-transparent sm:inline">
            Aston Workstation
          </span>
        </Link>

        <div className="flex-1" />

        <nav className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, icon: Icon, label }) => {
            const isActive = location === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  isActive
                    ? "border border-cyan-600/30 bg-cyan-600/20 text-cyan-400"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
