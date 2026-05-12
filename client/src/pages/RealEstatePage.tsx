import { useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import DealPipeline from "@/components/realestate/DealPipeline";
import FeasibilityForm from "@/components/realestate/FeasibilityForm";
import FeasibilityResult from "@/components/realestate/FeasibilityResult";
import LandSearch from "@/components/realestate/LandSearch";

const tabs = ["파이프라인", "사업성분석", "토지조회"] as const;
type RealEstateTab = (typeof tabs)[number];

export default function RealEstatePage() {
  const [activeTab, setActiveTab] = useState<RealEstateTab>("파이프라인");
  const [feasibilityData, setFeasibilityData] = useState<{ result: any; report: string } | null>(null);

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
              Real Estate PF desk
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--aston-text)]">
              부동산 PF
            </h1>
            <p className="max-w-3xl text-sm text-[var(--aston-muted)]">
              PF 딜 파이프라인, 사업성 분석, 토지 조회를 한 화면에서 관리합니다.
            </p>
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

        {activeTab === "파이프라인" && (
          <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4 md:p-5">
            <DealPipeline />
          </div>
        )}

        {activeTab === "사업성분석" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4 md:p-5">
              <FeasibilityForm onRun={(payload) => setFeasibilityData(payload)} /> {/* MODIFIED: render feasibility result from real mutation output. */}
            </div>
            <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4 md:p-5">
              <FeasibilityResult data={feasibilityData} /> {/* MODIFIED: replace static result card with backend-driven analysis data. */}
            </div>
          </div>
        )}

        {activeTab === "토지조회" && (
          <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4 md:p-5">
            <LandSearch />
          </div>
        )}
      </div>
    </div>
  );
}
