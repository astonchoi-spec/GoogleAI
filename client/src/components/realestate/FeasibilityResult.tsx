type FeasibilityResultProps = {
  data: {
    result: any;
    report: string;
  } | null;
};

function formatPercent(value: number): string {
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
}

function formatEok(value: number): string {
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}억원`;
}

export default function FeasibilityResult({ data }: FeasibilityResultProps) {
  if (!data) return null; // MODIFIED: hide result panel until the first successful feasibility run.

  const r = data.result;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Analysis Result</h2>
        <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-400">{r.verdict}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg bg-slate-800/70 p-3">
          <p className="text-xs text-slate-500">Sales Revenue</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEok(r.salesRevenue)}</p>
        </div>
        <div className="rounded-lg bg-slate-800/70 p-3">
          <p className="text-xs text-slate-500">Total Cost</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEok(r.totalProjectCost)}</p>
        </div>
        <div className="rounded-lg bg-slate-800/70 p-3">
          <p className="text-xs text-slate-500">Project Profit</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEok(r.projectProfit)}</p>
        </div>
        <div className="rounded-lg bg-slate-800/70 p-3">
          <p className="text-xs text-slate-500">Profit Rate</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatPercent(r.projectProfitRate)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-slate-800/70 p-3">
        <pre className="whitespace-pre-wrap text-xs text-slate-300">{data.report}</pre>
      </div>
    </div>
  );
}

