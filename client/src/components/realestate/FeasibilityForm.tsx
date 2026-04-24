import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

export type FeasibilityPayload = {
  result: {
    grossFloorAreaSqm: number;
    grossFloorAreaPyeong: number;
    saleableAreaPyeong: number;
    salesRevenue: number;
    constructionCost: number;
    totalProjectCost: number;
    projectProfit: number;
    projectProfitRate: number;
    verdict: string;
  };
  report: string;
};

type FeasibilityFormProps = {
  onResult: (result: FeasibilityPayload) => void;
};

const fieldDefs = [
  ["projectName", "프로젝트명", "강남 PF 개발"],
  ["landCost", "토지비(억)", "500"],
  ["landArea", "대지면적(㎡)", "1420"],
  ["buildingCoverageRate", "건폐율(%)", "60"],
  ["floorAreaRate", "용적률(%)", "600"],
  ["floors", "층수", "20"],
  ["constructionCostPerPyeong", "평당 공사비(만원)", "900"],
  ["sellingPricePerPyeong", "평당 분양가(만원)", "4500"],
  ["sellingRate", "분양률(%)", "95"],
  ["loanRate", "PF 금리(%)", "6.5"],
  ["loanLTV", "LTV(%)", "70"],
  ["projectDurationMonths", "사업기간(개월)", "30"],
  ["equityRatio", "자기자본 비율(%)", "30"],
] as const;

function toInput(form: Record<string, string>) {
  return {
    projectName: form.projectName,
    landCost: Number(form.landCost),
    landArea: Number(form.landArea),
    buildingCoverageRate: Number(form.buildingCoverageRate),
    floorAreaRate: Number(form.floorAreaRate),
    floors: Number(form.floors),
    constructionCostPerPyeong: Number(form.constructionCostPerPyeong),
    sellingPricePerPyeong: Number(form.sellingPricePerPyeong),
    sellingRate: Number(form.sellingRate),
    loanRate: Number(form.loanRate),
    loanLTV: Number(form.loanLTV),
    projectDurationMonths: Number(form.projectDurationMonths),
    equityRatio: Number(form.equityRatio),
  };
}

export default function FeasibilityForm({ onResult }: FeasibilityFormProps) {
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(fieldDefs.map(([key, , value]) => [key, value])));
  const [submitted, setSubmitted] = useState<ReturnType<typeof toInput> | null>(null);
  const query = trpc.realestate.feasibility.useQuery(submitted ?? toInput(form), {
    enabled: !!submitted,
    retry: false,
  });

  useEffect(() => {
    if (query.data) onResult(query.data);
  }, [query.data, onResult]);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <h2 className="mb-4 text-sm font-semibold text-white">사업성 분석 입력</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {fieldDefs.map(([key, label]) => (
          <label key={key} className="grid gap-1 text-sm text-slate-400">
            {label}
            <input
              value={form[key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
              className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500"
              placeholder={`${label} 입력`}
            />
          </label>
        ))}
      </div>
      {query.error && (
        <p className="mt-3 rounded-md border border-red-900/60 bg-red-950/30 p-2 text-sm text-red-300">
          {query.error.message}
        </p>
      )}
      <button onClick={() => setSubmitted(toInput(form))} disabled={query.isFetching} className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
        {query.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        분석 실행
      </button>
    </div>
  );
}
