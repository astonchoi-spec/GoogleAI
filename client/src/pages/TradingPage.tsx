import { useState } from "react";
import { Link } from "wouter"; // MODIFIED: route dashboard quick-action buttons into AI chat intent flow.
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
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
    <div className="px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-5"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <Badge variant="outline" className="border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                Trading command desk
              </Badge>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-[var(--aston-text)]">
                  트레이딩
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-[var(--aston-muted)]">
                  거래소 포지션, 매매일지, 알림을 한 화면에서 통합 관리합니다.
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {quickActions.map((action) => (
                <Link key={action.label} href={`/chat?command=${encodeURIComponent(action.command)}`}>
                  <a className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--aston-text)] transition hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-200">
                    {action.label}
                  </a>
                </Link>
              ))}
            </div>
          </div>
        </motion.section>

        <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-2">
          <div className="flex gap-2 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`min-w-[10rem] flex-1 rounded-xl px-4 py-3 text-sm font-medium transition ${
                  activeTab === tab
                    ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20"
                    : "bg-white/0 text-[var(--aston-muted)] hover:bg-white/5 hover:text-[var(--aston-text)]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "대시보드" && (
          <div className="space-y-5">
            <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
              <PortfolioSummary />
              <div className="rounded-2xl border border-white/10 bg-black/15 p-5">
                <h2 className="text-lg font-semibold text-[var(--aston-text)]">빠른 액션</h2>
                <p className="mt-1 text-sm text-[var(--aston-muted)]">자주 쓰는 실행 명령입니다.</p>
                <div className="mt-4 grid gap-2">
                  {quickActions.map((action) => (
                    <Link key={action.label} href={`/chat?command=${encodeURIComponent(action.command)}`}>
                      <a className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--aston-text)] transition hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-200">
                        {action.label}
                      </a>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <PositionTable />
            <ChartArea />

            <div className="grid gap-4 xl:grid-cols-2">
              <BalanceCards />
              <KimchiPremium />
            </div>
          </div>
        )}

        {activeTab === "매매일지" && (
          <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4 md:p-5">
            <TradeJournal />
          </div>
        )}

        {activeTab === "알림설정" && (
          <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4 md:p-5">
            <AlertManager />
          </div>
        )}
      </div>
    </div>
  );
}
