import { LineChart } from "lucide-react";

export default function ChartArea() {
  // TODO: 여기에 tRPC 연결
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">차트 영역</h2>
        <span className="text-xs text-slate-500">lightweight-charts 예정</span>
      </div>
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/70">
        <div className="text-center">
          <LineChart className="mx-auto mb-3 h-9 w-9 text-slate-600" />
          <p className="text-sm text-slate-400">실시간 차트 연결 대기</p>
        </div>
      </div>
    </div>
  );
}
