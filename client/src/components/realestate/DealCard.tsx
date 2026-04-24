import type { Deal } from "./types";

type DealCardProps = {
  deal: Deal;
  onClick: (deal: Deal) => void;
};

function formatEok(value: number) {
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`;
}

export default function DealCard({ deal, onClick }: DealCardProps) {
  return (
    <button
      onClick={() => onClick(deal)}
      className="w-full rounded-lg border border-slate-700 bg-slate-800/80 p-3 text-left transition-colors hover:border-cyan-600/50 hover:bg-slate-800"
    >
      <p className="font-semibold text-white">{deal.projectName}</p>
      <p className="mt-1 text-xs text-slate-500">{deal.location || "-"}</p>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-slate-400">총사업비</span>
        <span className="font-medium text-slate-200">{formatEok(deal.totalProjectCost)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-slate-400">LTV</span>
        <span className="font-medium text-cyan-300">{deal.ltv}%</span>
      </div>
    </button>
  );
}
