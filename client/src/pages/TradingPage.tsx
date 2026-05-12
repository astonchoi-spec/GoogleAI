import { useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import AlertManager from "@/components/trading/AlertManager";
import BalanceCards from "@/components/trading/BalanceCards";
import ChartArea from "@/components/trading/ChartArea";
import KimchiPremium from "@/components/trading/KimchiPremium";
import PortfolioSummary from "@/components/trading/PortfolioSummary";
import PositionTable from "@/components/trading/PositionTable";
import RiskGuardCard from "@/components/trading/RiskGuardCard";
import TradeJournal from "@/components/trading/TradeJournal";

const tabs = ["대시보드", "매매일지", "알림설정"] as const;

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
            <PortfolioSummary />
            <RiskGuardCard />
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
