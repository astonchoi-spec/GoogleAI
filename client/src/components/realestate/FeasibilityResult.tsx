import type { FeasibilityPayload } from "./FeasibilityForm";

type FeasibilityResultProps = {
  data: FeasibilityPayload | null;
};

function format(value: number, suffix = "") {
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}${suffix}`;
}

export default function FeasibilityResult({ data }: FeasibilityResultProps) {
  if (!data) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-6 text-center text-sm text-slate-400">
        사업성 분석을 실행하면 결과가 표시됩니다.
      </div>
    );
  }

  const result = data.result;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">분석 결과</h2>
        <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-400">{result.verdict}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["연면적", format(result.grossFloorAreaPyeong, "평")],
          ["총수입", format(result.salesRevenue, "억")],
          ["총비용", format(result.totalProjectCost, "억")],
          ["사업이익률", format(result.projectProfitRate, "%")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-800/70 p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>
      <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950/70 p-3 text-xs leading-relaxed text-slate-300">
        {data.report}
      </pre>
    </div>
  );
}
