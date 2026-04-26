import { ReactNode, useState } from "react";
import { useLocation } from "wouter";
import Sidebar from "@/components/Sidebar";
import StatusBar from "./StatusBar";

interface AppShellProps {
  children: ReactNode;
}

const ROUTE_META: Record<string, { title: string; subtitle: string }> = {
  "/": {
    title: "에스턴 워크스테이션",
    subtitle: "Aston Workstation Executive Command Center",
  },
  "/chat": {
    title: "AI 채팅",
    subtitle: "Unified command and response console",
  },
  "/trading": {
    title: "트레이딩",
    subtitle: "Portfolio, position, and alert operations",
  },
  "/real-estate-pf": {
    title: "부동산 PF",
    subtitle: "Deal pipeline and feasibility workspace",
  },
  "/google": {
    title: "Google Workspace",
    subtitle: "Gmail, Calendar, Drive, Sheets operations",
  },
  "/monitoring": {
    title: "모니터링",
    subtitle: "System health and analytics view",
  },
  "/settings": {
    title: "설정",
    subtitle: "Workspace preferences and controls",
  },
  "/login": {
    title: "로그인",
    subtitle: "Access control",
  },
};

export default function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (location === "/login") {
    return <>{children}</>; // MODIFIED: render the login page without the dashboard shell so the form stays unobstructed.
  }

  const meta = ROUTE_META[location] ?? ROUTE_META["/"];

  return (
    <div className="min-h-screen bg-[var(--aston-bg)] text-[var(--aston-text)]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[280px]">
        <StatusBar
          title={meta.title}
          subtitle={meta.subtitle}
          onMenuClick={() => setSidebarOpen(true)}
        />

        <main className="relative min-h-[calc(100vh-48px)] overflow-y-auto">
          {children}
        </main>
      </div>

      {sidebarOpen && (
        <button
          type="button"
          aria-label="사이드바 닫기"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden"
        />
      )}
    </div>
  );
}
