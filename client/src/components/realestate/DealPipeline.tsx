import { Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import DealCard from "./DealCard";
import DealModal from "./DealModal";
import type { Deal } from "./types";

const fallbackStages = ["소싱", "심사", "약정", "실행", "회수", "완료"];

export default function DealPipeline() {
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const dealsQuery = trpc.realestate.getDealList.useQuery(undefined, { retry: false });
  const deals = (dealsQuery.data ?? []) as Deal[];
  const stages = useMemo(() => {
    const unique = Array.from(new Set([...fallbackStages, ...deals.map((deal) => deal.stage).filter(Boolean)]));
    return unique;
  }, [deals]);
  const totalExposure = deals.reduce((sum, deal) => sum + deal.loanAmount, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["총 딜 수", `${deals.length}건`],
          ["총 익스포저", `${totalExposure.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`],
          ["진행 중", `${deals.filter((deal) => !["완료", "회수"].includes(deal.stage)).length}건`],
          ["완료/회수", `${deals.filter((deal) => ["완료", "회수"].includes(deal.stage)).length}건`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      {dealsQuery.isLoading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/50 text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          PF 딜 조회 중
        </div>
      ) : dealsQuery.error ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
          {dealsQuery.error.message || "Google Sheets PF 파이프라인을 연결해주세요."}
        </div>
      ) : deals.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
          등록된 PF 딜이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <div className="grid min-w-[980px] grid-cols-6 gap-3">
            {stages.map((stage) => (
              <div key={stage} className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">{stage}</h3>
                  <span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                    {deals.filter((deal) => deal.stage === stage).length}
                  </span>
                </div>
                <div className="space-y-2">
                  {deals.filter((deal) => deal.stage === stage).map((deal) => (
                    <DealCard key={deal.id} deal={deal} onClick={setSelectedDeal} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setShowNewDeal(true)}
        className="flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
      >
        <Plus className="h-4 w-4" />
        딜 추가
      </button>

      <DealModal deal={selectedDeal} onClose={() => setSelectedDeal(null)} />
      {showNewDeal && <DealModal deal={null} isNew onClose={() => setShowNewDeal(false)} />}
    </div>
  );
}
