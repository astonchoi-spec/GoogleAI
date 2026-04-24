import { Search } from "lucide-react";
import { useState } from "react";

export default function LandSearch() {
  // TODO: 여기에 tRPC 연결
  const [searched, setSearched] = useState(false);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <h2 className="mb-4 text-sm font-semibold text-white">토지조회</h2>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="flex-1 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500"
          placeholder="PNU 입력 또는 주소 검색"
        />
        <button
          onClick={() => setSearched(true)}
          className="flex items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
        >
          <Search className="h-4 w-4" />
          조회
        </button>
      </div>

      {searched && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[
            ["용도지역", "일반상업지역"],
            ["건폐율/용적률 상한", "80% / 800%"],
            ["지목", "대"],
            ["면적", "1,420.5㎡"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-800/70 p-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-white">{value}</p>
            </div>
          ))}
          <div className="rounded-lg bg-slate-800/70 p-3 md:col-span-2">
            <p className="text-xs text-slate-500">규제사항</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              <li>지구단위계획구역</li>
              <li>대공방어협조구역</li>
              <li>주차장 설치 기준 강화 지역</li>
            </ul>
          </div>
          <div className="rounded-lg bg-slate-800/70 p-3 md:col-span-2">
            <p className="text-xs text-slate-500">주변 실거래가 요약</p>
            <p className="mt-1 text-sm text-slate-300">최근 6개월 상업용지 평균 거래가: 3.2억/평</p>
          </div>
        </div>
      )}
    </div>
  );
}
