import { useState } from "react";
import DealPipeline from "@/components/realestate/DealPipeline";
import FeasibilityForm from "@/components/realestate/FeasibilityForm";
import FeasibilityResult from "@/components/realestate/FeasibilityResult";
import LandSearch from "@/components/realestate/LandSearch";

const tabs = ["딜 파이프라인", "사업성분석", "토지조회"] as const;
type RealEstateTab = (typeof tabs)[number];

export default function RealEstatePage() {
  const [activeTab, setActiveTab] = useState<RealEstateTab>("딜 파이프라인");
  const [showResult, setShowResult] = useState(true);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 md:px-8 py-4">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-2xl font-bold leading-tight text-transparent md:text-3xl">
            부동산PF
          </h1>
          <p className="mt-1 text-sm text-slate-400">PF 딜 파이프라인, 사업성, 토지 정보를 통합 관리합니다.</p>
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

        {activeTab === "딜 파이프라인" && <DealPipeline />}
        {activeTab === "사업성분석" && (
          <div className="space-y-4">
            <FeasibilityForm onRun={() => setShowResult(true)} />
            {showResult && <FeasibilityResult />}
          </div>
        )}
        {activeTab === "토지조회" && <LandSearch />}
      </div>
    </div>
  );
}
