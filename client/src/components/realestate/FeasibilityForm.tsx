import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type FeasibilityPayload = {
  result: any;
  report: string;
};

type FeasibilityFormProps = {
  onRun: (payload: FeasibilityPayload) => void;
};

export default function FeasibilityForm({ onRun }: FeasibilityFormProps) {
  const runMutation = trpc.realestate.runFeasibility.useMutation(); // MODIFIED: connect feasibility form submit to backend engine via tRPC.
  const [form, setForm] = useState({
    projectName: "샘플 프로젝트",
    landCost: 150,
    landArea: 1000,
    buildingCoverageRate: 60,
    floorAreaRate: 300,
    floors: 20,
    constructionCostPerPyeong: 900,
    sellingPricePerPyeong: 1800,
    sellingRate: 95,
    loanRate: 6.5,
    loanLTV: 70,
    projectDurationMonths: 30,
    equityRatio: 30,
  });

  const numberFieldKeys = [
    "landCost",
    "landArea",
    "buildingCoverageRate",
    "floorAreaRate",
    "floors",
    "constructionCostPerPyeong",
    "sellingPricePerPyeong",
    "sellingRate",
    "loanRate",
    "loanLTV",
    "projectDurationMonths",
    "equityRatio",
  ] as const;

  const handleRun = async () => {
    try {
      const result = await runMutation.mutateAsync(form);
      onRun(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to run feasibility");
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <h2 className="mb-4 text-sm font-semibold text-white">Feasibility Input</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm text-slate-400">
          Project Name
          <input
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500"
            value={form.projectName}
            onChange={(e) => setForm((prev) => ({ ...prev, projectName: e.target.value }))}
            placeholder="Project name"
          />
        </label>
        {numberFieldKeys.map((key) => (
          <label key={key} className="grid gap-1 text-sm text-slate-400">
            {key}
            <input
              type="number"
              className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500"
              value={form[key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
            />
          </label>
        ))}
      </div>
      <button
        onClick={handleRun}
        disabled={runMutation.isPending}
        className="mt-4 w-full rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60"
      >
        {runMutation.isPending ? "Running..." : "Run Feasibility"}
      </button>
    </div>
  );
}

