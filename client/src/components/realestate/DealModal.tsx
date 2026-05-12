import { X } from "lucide-react";
import type { Deal } from "./types";

type DealModalProps = {
  deal: Deal | null;
  isNew?: boolean;
  onClose: () => void;
};

export default function DealModal({ deal, isNew = false, onClose }: DealModalProps) {
  // MODIFIED: legacy modal retained for backward compatibility; active PF CRUD is handled in DealPipeline with realestate router mutations.
  if (!deal && !isNew) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{isNew ? "New Deal" : deal?.name}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isNew ? (
          <div className="grid gap-3">
            {["Project Name", "Location", "Total Cost", "LTV", "Sponsor"].map((label) => (
              <label key={label} className="grid gap-1 text-sm text-slate-400">
                {label}
                <input className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500" placeholder={`Enter ${label}`} />
              </label>
            ))}
            <button className="mt-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700">
              Save
            </button>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-800/80 p-3">
                <p className="text-xs text-slate-500">Location</p>
                <p className="mt-1 text-white">{deal?.location}</p>
              </div>
              <div className="rounded-lg bg-slate-800/80 p-3">
                <p className="text-xs text-slate-500">Stage</p>
                <p className="mt-1 text-cyan-300">{deal?.stage}</p>
              </div>
              <div className="rounded-lg bg-slate-800/80 p-3">
                <p className="text-xs text-slate-500">Total Cost</p>
                <p className="mt-1 text-white">{deal?.amount}</p>
              </div>
              <div className="rounded-lg bg-slate-800/80 p-3">
                <p className="text-xs text-slate-500">LTV</p>
                <p className="mt-1 text-white">{deal?.ltv}</p>
              </div>
            </div>
            <div className="rounded-lg bg-slate-800/80 p-3">
              <p className="text-xs text-slate-500">Sponsor</p>
              <p className="mt-1 text-white">{deal?.sponsor}</p>
            </div>
            <div className="rounded-lg bg-slate-800/80 p-3">
              <p className="text-xs text-slate-500">Memo</p>
              <p className="mt-1 text-slate-300">{deal?.memo}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

