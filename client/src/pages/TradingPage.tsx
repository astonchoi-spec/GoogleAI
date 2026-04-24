import { useState } from "react";
import { Link } from "wouter"; // MODIFIED: route dashboard quick-action buttons into AI chat intent flow.
import AlertManager from "@/components/trading/AlertManager";
import BalanceCards from "@/components/trading/BalanceCards";
import ChartArea from "@/components/trading/ChartArea";
import KimchiPremium from "@/components/trading/KimchiPremium";
import PortfolioSummary from "@/components/trading/PortfolioSummary";
import PositionTable from "@/components/trading/PositionTable";
import TradeJournal from "@/components/trading/TradeJournal";

const tabs = ["대시보드", "매매일지", "알림설정"] as const; // MODIFIED: normalize tab labels for readable runtime UI.
const quickActions = [
  { label: "잔고 조회", command: "잔고 조회" },
  { label: "AI 시장 분석", command: "BTC 기술적 분석" },
  { label: "알림 만들기", command: "알림 추가 BTC/USDT 100000 above" },
] as const; // MODIFIED: make quick actions actionable via chat prefill routing.

type TradingTab = (typeof tabs)[number];

export default function TradingPage() {
  const [activeTab, setActiveTab] = useState<TradingTab>("대시보드");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 py-4 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-2xl font-bold leading-tight text-transparent md:text-3xl">
            트레이딩
          </h1>
          <p className="mt-1 text-sm text-slate-400">거래소 포지션, 매매일지, 알림을 통합 관리합니다.</p>
        </div>

        <div className="flex gap-1 rounded-lg border border-slate-700 bg-slate-800/50 p-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                activeTab === tab
                  ? "bg-cyan-600 text-white shadow"
                  : "text-slate-400 hover:bg-slate-700/50 hover:text-slate-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "대시보드" && (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <PortfolioSummary />
              <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                <h2 className="mb-3 text-sm font-semibold text-white">빠른 액션</h2>
                <div className="grid gap-2">
                  {quickActions.map((action) => (
                    <Link key={action.label} href={`/chat?command=${encodeURIComponent(action.command)}`}>
                      <a className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:border-cyan-600/50 hover:text-cyan-300">
                        {action.label}
                      </a>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <PositionTable />
            <ChartArea />
            <div className="grid gap-4 md:grid-cols-3">
              <BalanceCards />
              <KimchiPremium />
            </div>
          </div>
        )}

        {activeTab === "매매일지" && <TradeJournal />}
        {activeTab === "알림설정" && <AlertManager />}
      </div>
    </div>
  );
}
