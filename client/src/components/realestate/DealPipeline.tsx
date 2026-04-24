import { Plus } from "lucide-react";
import { useState } from "react";
import DealCard from "./DealCard";
import DealModal from "./DealModal";
import type { Deal, DealStage } from "./types";

const stages: DealStage[] = ["소싱", "심사", "약정", "실행", "회수"];

const deals: Deal[] = [
  { id: "1", name: "역삼 오피스 개발", location: "서울 강남구 역삼동", amount: "500억", ltv: "65%", stage: "소싱", sponsor: "A 시행", memo: "토지 매입 협의 진행 중" },
  { id: "2", name: "판교 물류센터", location: "성남시 분당구", amount: "800억", ltv: "70%", stage: "심사", sponsor: "B 로지스", memo: "임차 LOI 검토 필요" },
  { id: "3", name: "마곡 R&D 센터", location: "서울 강서구 마곡동", amount: "620억", ltv: "62%", stage: "약정", sponsor: "C 개발", memo: "약정서 최종 문안 협의" },
  { id: "4", name: "강남 주상복합", location: "서울 강남구 논현동", amount: "1,200억", ltv: "60%", stage: "실행", sponsor: "D 홀딩스", memo: "1차 기표 완료" },
  { id: "5", name: "부산 해운대 호텔", location: "부산 해운대구", amount: "430억", ltv: "55%", stage: "회수", sponsor: "E 관광개발", memo: "분양 수입 회수 단계" },
];

export default function DealPipeline() {
  // TODO: 여기에 tRPC 연결
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showNewDeal, setShowNewDeal] = useState(false);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["총 딜수", "5건"],
          ["총 익스포저", "3,550억"],
          ["진행중", "4건"],
          ["완료", "1건"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <div className="grid min-w-[980px] grid-cols-5 gap-3">
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

      <button
        onClick={() => setShowNewDeal(true)}
        className="flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
      >
        <Plus className="h-4 w-4" />
        새 딜 추가
      </button>

      <DealModal deal={selectedDeal} onClose={() => setSelectedDeal(null)} />
      {showNewDeal && <DealModal deal={null} isNew onClose={() => setShowNewDeal(false)} />}
    </div>
  );
}
