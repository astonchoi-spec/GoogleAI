import { Loader2, Search } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

export default function LandSearch() {
  const [pnu, setPnu] = useState("");
  const [lawdCd, setLawdCd] = useState("");
  const [dealYmd, setDealYmd] = useState(new Date().toISOString().slice(0, 7).replace("-", ""));
  const [submittedPnu, setSubmittedPnu] = useState("");
  const [submittedPrice, setSubmittedPrice] = useState<{ lawdCd: string; dealYmd: string } | null>(null);

  const landQuery = trpc.realestate.landCheck.useQuery(
    { pnu: submittedPnu },
    { enabled: !!submittedPnu, retry: false }
  );
  const priceQuery = trpc.realestate.realPrice.useQuery(
    { lawdCd: submittedPrice?.lawdCd ?? "", dealYmd: submittedPrice?.dealYmd ?? "", type: "land" },
    { enabled: !!submittedPrice, retry: false }
  );

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <h2 className="mb-4 text-sm font-semibold text-white">토지 조회</h2>
      <div className="grid gap-2 md:grid-cols-[1.5fr_1fr_1fr_auto]">
        <input value={pnu} onChange={(e) => setPnu(e.target.value)} className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500" placeholder="PNU 입력" />
        <input value={lawdCd} onChange={(e) => setLawdCd(e.target.value)} className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500" placeholder="법정동 코드" />
        <input value={dealYmd} onChange={(e) => setDealYmd(e.target.value)} className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500" placeholder="YYYYMM" />
        <button
          onClick={() => {
            setSubmittedPnu(pnu.trim());
            if (lawdCd.trim() && dealYmd.trim()) setSubmittedPrice({ lawdCd: lawdCd.trim(), dealYmd: dealYmd.trim() });
          }}
          className="flex items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
        >
          <Search className="h-4 w-4" />
          조회
        </button>
      </div>

      {(landQuery.isLoading || priceQuery.isLoading) && (
        <div className="mt-5 flex items-center text-sm text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          조회 중
        </div>
      )}

      {(landQuery.error || priceQuery.error) && (
        <div className="mt-5 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
          {(landQuery.error || priceQuery.error)?.message}
        </div>
      )}

      {landQuery.data && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[
            ["용도지역", landQuery.data.useAreaName ?? "-"],
            ["건폐율/용적률 상한", `${landQuery.data.buldRatLimit ?? "-"}% / ${landQuery.data.flAreaRatLimit ?? "-"}%`],
            ["지목", landQuery.data.jimok ?? "-"],
            ["면적", landQuery.data.area ? `${landQuery.data.area.toLocaleString("ko-KR")}㎡` : "-"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-800/70 p-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-white">{value}</p>
            </div>
          ))}
          <div className="rounded-lg bg-slate-800/70 p-3 md:col-span-2">
            <p className="text-xs text-slate-500">규제사항</p>
            {landQuery.data.regulationInfo.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                {landQuery.data.regulationInfo.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-400">규제 정보가 없습니다.</p>
            )}
          </div>
        </div>
      )}

      {priceQuery.data && (
        <div className="mt-3 rounded-lg bg-slate-800/70 p-3">
          <p className="text-xs text-slate-500">주변 실거래가</p>
          <p className="mt-1 text-sm text-slate-300">{priceQuery.data.length}건 조회됨</p>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-400">
            {JSON.stringify(priceQuery.data.slice(0, 5), null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
