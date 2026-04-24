import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { Deal } from "./types";

type DealModalProps = {
  deal: Deal | null;
  isNew?: boolean;
  onClose: () => void;
};

const defaultForm = {
  projectName: "",
  location: "",
  stage: "소싱",
  totalProjectCost: "0",
  loanAmount: "0",
  ltv: "0",
  equityAmount: "0",
  lenders: "",
  nextMilestone: "",
  nextMilestoneDate: "",
  notes: "",
};

export default function DealModal({ deal, isNew = false, onClose }: DealModalProps) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState(() => deal ? {
    projectName: deal.projectName,
    location: deal.location,
    stage: deal.stage,
    totalProjectCost: String(deal.totalProjectCost),
    loanAmount: String(deal.loanAmount),
    ltv: String(deal.ltv),
    equityAmount: String(deal.equityAmount),
    lenders: deal.lenders,
    nextMilestone: deal.nextMilestone,
    nextMilestoneDate: deal.nextMilestoneDate,
    notes: deal.notes,
  } : defaultForm);
  const addDeal = trpc.realestate.addDeal.useMutation({
    onSuccess: () => {
      utils.realestate.getDealList.invalidate();
      onClose();
    },
  });
  const updateStage = trpc.realestate.updateDealStage.useMutation({
    onSuccess: () => {
      utils.realestate.getDealList.invalidate();
      onClose();
    },
  });

  if (!deal && !isNew) return null;

  const save = () => {
    if (isNew) {
      addDeal.mutate({
        ...form,
        totalProjectCost: Number(form.totalProjectCost),
        loanAmount: Number(form.loanAmount),
        ltv: Number(form.ltv),
        equityAmount: Number(form.equityAmount),
      });
    } else if (deal) {
      updateStage.mutate({ id: deal.id, stage: form.stage });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{isNew ? "딜 추가" : deal?.projectName}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1">
          {[
            ["projectName", "프로젝트명"],
            ["location", "위치"],
            ["stage", "단계"],
            ["totalProjectCost", "총사업비"],
            ["loanAmount", "대출금"],
            ["ltv", "LTV"],
            ["equityAmount", "자기자본"],
            ["lenders", "대주단"],
            ["nextMilestone", "다음 마일스톤"],
            ["nextMilestoneDate", "마일스톤 일자"],
            ["notes", "메모"],
          ].map(([key, label]) => (
            <label key={key} className="grid gap-1 text-sm text-slate-400">
              {label}
              <input
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                disabled={!isNew && key !== "stage"}
                className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500 disabled:opacity-70"
              />
            </label>
          ))}
          {(addDeal.error || updateStage.error) && (
            <p className="rounded-md border border-red-900/60 bg-red-950/30 p-2 text-sm text-red-300">
              {(addDeal.error || updateStage.error)?.message}
            </p>
          )}
          <button onClick={save} disabled={addDeal.isPending || updateStage.isPending} className="mt-2 inline-flex items-center justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
            {(addDeal.isPending || updateStage.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
