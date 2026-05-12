import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const DEAL_STAGES = ["초기", "?�사", "?�정", "?�행", "?�수", "?�료"] as const;

function formatEok(value: number): string {
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}?�원`;
}

export default function DealPipeline() {
  const utils = trpc.useUtils();
  const [newDeal, setNewDeal] = useState({
    projectName: "",
    location: "",
    loanAmount: 0,
    ltv: 0,
    stage: "초기",
  });

  const dealsQuery = trpc.realestate.getDeals.useQuery(); // MODIFIED: connect PF pipeline list to realestate tRPC router.
  const summaryQuery = trpc.realestate.getPortfolioSummary.useQuery(); // MODIFIED: fetch live portfolio summary instead of hardcoded dashboard values.

  const addDealMutation = trpc.realestate.addDeal.useMutation({
    onSuccess: async () => {
      await utils.realestate.getDeals.invalidate(); // MODIFIED: refresh table immediately after adding a new PF deal.
      await utils.realestate.getPortfolioSummary.invalidate();
      setNewDeal({ projectName: "", location: "", loanAmount: 0, ltv: 0, stage: "초기" });
      toast.success("Deal added");
    },
    onError: (error) => toast.error(error.message),
  });

  const updateStageMutation = trpc.realestate.updateDealStage.useMutation({
    onSuccess: async () => {
      await utils.realestate.getDeals.invalidate(); // MODIFIED: keep UI stage value in sync with backend pipeline stage updates.
      await utils.realestate.getPortfolioSummary.invalidate();
      toast.success("Deal stage updated");
    },
    onError: (error) => toast.error(error.message),
  });

  const deals = dealsQuery.data ?? [];
  const totalExposure = deals.reduce((sum, deal) => sum + (deal.loanAmount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4">
          <p className="text-xs text-[var(--aston-muted)]">Deal Count</p>
          <p className="mt-2 text-xl font-semibold text-[var(--aston-text)]">{deals.length}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4">
          <p className="text-xs text-[var(--aston-muted)]">Loan Exposure</p>
          <p className="mt-2 text-xl font-semibold text-[var(--aston-text)]">{formatEok(totalExposure)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4">
          <p className="text-xs text-[var(--aston-muted)]">Data Source</p>
          <p className="mt-2 text-xl font-semibold text-cyan-300">Google Sheets</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--aston-text)]">Add Deal</h2>
        <div className="grid gap-2 md:grid-cols-5">
          <input
            value={newDeal.projectName}
            onChange={(e) => setNewDeal((prev) => ({ ...prev, projectName: e.target.value }))}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-[var(--aston-text)]"
            placeholder="Project name"
          />
          <input
            value={newDeal.location}
            onChange={(e) => setNewDeal((prev) => ({ ...prev, location: e.target.value }))}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-[var(--aston-text)]"
            placeholder="Location"
          />
          <input
            type="number"
            value={newDeal.loanAmount}
            onChange={(e) => setNewDeal((prev) => ({ ...prev, loanAmount: Number(e.target.value) }))}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-[var(--aston-text)]"
            placeholder="Loan amount (??"
          />
          <input
            type="number"
            value={newDeal.ltv}
            onChange={(e) => setNewDeal((prev) => ({ ...prev, ltv: Number(e.target.value) }))}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-[var(--aston-text)]"
            placeholder="LTV %"
          />
          <button
            onClick={() => addDealMutation.mutate({
              projectName: newDeal.projectName,
              location: newDeal.location,
              stage: newDeal.stage,
              loanAmount: newDeal.loanAmount,
              ltv: newDeal.ltv,
              totalProjectCost: 0,
              equityAmount: 0,
              lenders: "",
              nextMilestone: "",
              nextMilestoneDate: "",
              notes: "",
            })} // MODIFIED: create deal via realestate.addDeal so pipeline state is persisted in Google Sheets.
            disabled={addDealMutation.isPending || !newDeal.projectName.trim()}
            className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-[var(--aston-text)] hover:bg-cyan-700 disabled:opacity-60"
          >
            {addDealMutation.isPending ? "Adding..." : "Add"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--aston-text)]">PF Deals</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-[var(--aston-muted)]">
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2 font-medium">Loan</th>
                <th className="px-3 py-2 font-medium">LTV</th>
                <th className="px-3 py-2 font-medium">Next Milestone</th>
              </tr>
            </thead>
            <tbody>
              {dealsQuery.isLoading && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-400">Loading PF deals...</td>
                </tr>
              )}
              {!dealsQuery.isLoading && dealsQuery.error && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-red-300">
                    Failed to load PF deals. Check Google auth and spreadsheet config.
                  </td>
                </tr>
              )}
              {!dealsQuery.isLoading && !dealsQuery.error && deals.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-400">No PF deals found</td>
                </tr>
              )}
              {deals.map((deal) => (
                <tr key={deal.id} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-3 font-medium text-[var(--aston-text)]">{deal.projectName}</td>
                  <td className="px-3 py-3 text-slate-300">{deal.location || "-"}</td>
                  <td className="px-3 py-3 text-cyan-300">
                    <select
                      value={deal.stage}
                      onChange={(e) => updateStageMutation.mutate({ id: deal.id, stage: e.target.value })}
                      className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-cyan-300"
                    >
                      {DEAL_STAGES.map((stage) => (
                        <option key={stage} value={stage}>{stage}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-slate-300">{formatEok(deal.loanAmount || 0)}</td>
                  <td className="px-3 py-3 text-slate-300">{(deal.ltv || 0).toFixed(1)}%</td>
                  <td className="px-3 py-3 text-slate-300">{deal.nextMilestone || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--aston-text)]">Portfolio Summary</h2>
        {summaryQuery.isLoading && <p className="text-sm text-slate-400">Loading summary...</p>}
        {summaryQuery.error && (
          <p className="text-sm text-red-300">Failed to load summary.</p>
        )}
        {!summaryQuery.isLoading && !summaryQuery.error && (
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-300">{summaryQuery.data?.summary || "-"}</pre>
        )}
      </div>
    </div>
  );
}






