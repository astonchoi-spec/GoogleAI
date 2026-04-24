import { useState } from "react";
import AlertManager from "@/components/trading/AlertManager";
import BalanceCards from "@/components/trading/BalanceCards";
import ChartArea, { type TradingMarket } from "@/components/trading/ChartArea";
import KimchiPremium from "@/components/trading/KimchiPremium";
import PortfolioSummary from "@/components/trading/PortfolioSummary";
import PositionTable from "@/components/trading/PositionTable";
import TradeJournal from "@/components/trading/TradeJournal";

const PAGE_TABS = ["Dashboard", "Journal", "Alerts"] as const;
type TradingTab = (typeof PAGE_TABS)[number];

const MARKET_TABS: Array<{ key: TradingMarket; label: string }> = [
  { key: "crypto", label: "Crypto" },
  { key: "kr-stock", label: "KR Stock" },
  { key: "us-stock", label: "US Stock" },
  { key: "kr-futures", label: "KR Futures" },
  { key: "us-futures", label: "US Futures" },
];

export default function TradingPage() {
  const [activeTab, setActiveTab] = useState<TradingTab>("Dashboard");
  const [market, setMarket] = useState<TradingMarket>("crypto");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 py-4 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-2xl font-bold leading-tight text-transparent md:text-3xl">
            Trading
          </h1>
          <p className="mt-1 text-sm text-slate-400">Market dashboard, journal, and alert controls in one place.</p>
        </div>

        <div className="space-y-3">
          <div className="flex gap-1 rounded-lg border border-slate-700 bg-slate-800/50 p-1">
            {PAGE_TABS.map((tab) => (
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

          <div className="flex flex-wrap gap-2">
            {MARKET_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setMarket(tab.key)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  market === tab.key
                    ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-300"
                    : "border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "Dashboard" && (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <PortfolioSummary />
              <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                <h2 className="mb-3 text-sm font-semibold text-white">Quick Actions</h2>
                <div className="grid gap-2">
                  {["Balance", "AI Analysis", "Create Alert"].map((label) => (
                    <button
                      key={label}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:border-cyan-600/50 hover:text-cyan-300"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <PositionTable />
            <ChartArea market={market} />
            <div className="grid gap-4 md:grid-cols-3">
              <BalanceCards />
              <KimchiPremium />
            </div>
          </div>
        )}

        {activeTab === "Journal" && <TradeJournal market={market} />}
        {activeTab === "Alerts" && <AlertManager />}
      </div>
    </div>
  );
}
