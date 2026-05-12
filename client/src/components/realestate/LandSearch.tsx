import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

type TransactionType = "apt" | "land" | "office";

export default function LandSearch() {
  const [pnu, setPnu] = useState("");
  const [lawdCd, setLawdCd] = useState("11110");
  const [dealYmd, setDealYmd] = useState("202604");
  const [type, setType] = useState<TransactionType>("apt");
  const [searchParams, setSearchParams] = useState<{
    pnu: string;
    lawdCd: string;
    dealYmd: string;
    type: TransactionType;
  } | null>(null);

  const landQuery = trpc.realestate.getLandRegulation.useQuery(
    { pnu: searchParams?.pnu || "0000000000000000000" },
    { enabled: !!searchParams?.pnu }
  ); // MODIFIED: connect land regulation panel to realestate.getLandRegulation tRPC query.

  const txQuery = trpc.realestate.getRealTransactions.useQuery(
    {
      lawdCd: searchParams?.lawdCd || "11110",
      dealYmd: searchParams?.dealYmd || "202604",
      type: searchParams?.type || "apt",
    },
    { enabled: !!searchParams }
  ); // MODIFIED: connect transaction summary panel to realestate.getRealTransactions tRPC query.

  const txCount = (txQuery.data ?? []).length;
  const txPreview = useMemo(() => {
    const first = txQuery.data?.[0];
    if (!first) return null;
    return JSON.stringify(first, null, 2);
  }, [txQuery.data]);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <h2 className="mb-4 text-sm font-semibold text-white">Land Lookup</h2>
      <div className="grid gap-2 sm:grid-cols-5">
        <input
          value={pnu}
          onChange={(e) => setPnu(e.target.value)}
          className="sm:col-span-2 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500"
          placeholder="PNU (19 digits)"
        />
        <input
          value={lawdCd}
          onChange={(e) => setLawdCd(e.target.value)}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500"
          placeholder="LAWD_CD"
        />
        <input
          value={dealYmd}
          onChange={(e) => setDealYmd(e.target.value)}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500"
          placeholder="YYYYMM"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TransactionType)}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white"
        >
          <option value="apt">apt</option>
          <option value="land">land</option>
          <option value="office">office</option>
        </select>
      </div>

      <button
        onClick={() => setSearchParams({ pnu, lawdCd, dealYmd, type })} // MODIFIED: trigger both regulation and transaction fetches from current input values.
        className="mt-2 flex items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
      >
        <Search className="h-4 w-4" />
        Search
      </button>

      {searchParams && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg bg-slate-800/70 p-3">
            <p className="text-xs text-slate-500">Use Area</p>
            <p className="mt-1 text-white">
              {landQuery.isLoading ? "Loading..." : landQuery.error ? "Unavailable" : landQuery.data?.useAreaName || "-"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-800/70 p-3">
            <p className="text-xs text-slate-500">Coverage / FAR Limit</p>
            <p className="mt-1 text-white">
              {landQuery.isLoading
                ? "Loading..."
                : landQuery.error
                  ? "Unavailable"
                  : `${landQuery.data?.buldRatLimit ?? "-"}% / ${landQuery.data?.flAreaRatLimit ?? "-"}%`}
            </p>
          </div>
          <div className="rounded-lg bg-slate-800/70 p-3">
            <p className="text-xs text-slate-500">Land Category (Jimok)</p>
            <p className="mt-1 text-white">
              {landQuery.isLoading ? "Loading..." : landQuery.error ? "Unavailable" : landQuery.data?.jimok || "-"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-800/70 p-3">
            <p className="text-xs text-slate-500">Area</p>
            <p className="mt-1 text-white">
              {landQuery.isLoading ? "Loading..." : landQuery.error ? "Unavailable" : `${landQuery.data?.area ?? "-"} ㎡`}
            </p>
          </div>

          <div className="rounded-lg bg-slate-800/70 p-3 md:col-span-2">
            <p className="text-xs text-slate-500">Regulation Notes</p>
            {landQuery.isLoading && <p className="mt-1 text-sm text-slate-300">Loading...</p>}
            {landQuery.error && <p className="mt-1 text-sm text-red-300">{landQuery.error.message}</p>}
            {!landQuery.isLoading && !landQuery.error && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                {(landQuery.data?.regulationInfo ?? []).slice(0, 8).map((item, idx) => (
                  <li key={`${item}-${idx}`}>{item}</li>
                ))}
                {(landQuery.data?.regulationInfo ?? []).length === 0 && <li>No regulation note returned</li>}
              </ul>
            )}
          </div>

          <div className="rounded-lg bg-slate-800/70 p-3 md:col-span-2">
            <p className="text-xs text-slate-500">Recent Transaction Snapshot</p>
            <p className="mt-1 text-sm text-slate-300">
              {txQuery.isLoading ? "Loading..." : txQuery.error ? txQuery.error.message : `Records: ${txCount}`}
            </p>
            {txPreview && (
              <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap text-xs text-slate-300">{txPreview}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

