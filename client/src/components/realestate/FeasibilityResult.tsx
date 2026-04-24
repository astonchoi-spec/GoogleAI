export default function FeasibilityResult() {
  // TODO: 여기에 tRPC 연결
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">분석 결과</h2>
        <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-400">양호</span>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["연면적", "4,820평"],
          ["총수입", "1,140억"],
          ["총비용", "920억"],
          ["사업이익률", "19.3%"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-800/70 p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>수입</span>
            <span>1,140억</span>
          </div>
          <div className="h-3 rounded-full bg-slate-800">
            <div className="h-3 w-full rounded-full bg-cyan-500" />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>비용</span>
            <span>920억</span>
          </div>
          <div className="h-3 rounded-full bg-slate-800">
            <div className="h-3 w-[81%] rounded-full bg-blue-500" />
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">Sheets에 저장</button>
        <button className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">시나리오 비교</button>
      </div>
    </div>
  );
}
