import { X } from "lucide-react";
import type { Deal } from "./types";

type DealModalProps = {
  deal: Deal | null;
  isNew?: boolean;
  onClose: () => void;
};

export default function DealModal({ deal, isNew = false, onClose }: DealModalProps) {
  // TODO: 여기에 tRPC 연결
  if (!deal && !isNew) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{isNew ? "새 딜 추가" : deal?.name}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isNew ? (
          <div className="grid gap-3">
            {["프로젝트명", "위치", "총사업비", "LTV", "스폰서"].map((label) => (
              <label key={label} className="grid gap-1 text-sm text-slate-400">
                {label}
                <input className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500" placeholder={`${label} 입력`} />
              </label>
            ))}
            <button className="mt-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700">
              저장
            </button>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-800/80 p-3">
                <p className="text-xs text-slate-500">위치</p>
                <p className="mt-1 text-white">{deal?.location}</p>
              </div>
              <div className="rounded-lg bg-slate-800/80 p-3">
                <p className="text-xs text-slate-500">단계</p>
                <p className="mt-1 text-cyan-300">{deal?.stage}</p>
              </div>
              <div className="rounded-lg bg-slate-800/80 p-3">
                <p className="text-xs text-slate-500">총사업비</p>
                <p className="mt-1 text-white">{deal?.amount}</p>
              </div>
              <div className="rounded-lg bg-slate-800/80 p-3">
                <p className="text-xs text-slate-500">LTV</p>
                <p className="mt-1 text-white">{deal?.ltv}</p>
              </div>
            </div>
            <div className="rounded-lg bg-slate-800/80 p-3">
              <p className="text-xs text-slate-500">스폰서</p>
              <p className="mt-1 text-white">{deal?.sponsor}</p>
            </div>
            <div className="rounded-lg bg-slate-800/80 p-3">
              <p className="text-xs text-slate-500">메모</p>
              <p className="mt-1 text-slate-300">{deal?.memo}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
