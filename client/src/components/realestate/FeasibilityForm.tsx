const fields = [
  "프로젝트명",
  "토지비",
  "대지면적",
  "건폐율",
  "용적률",
  "층수",
  "평당공사비",
  "평당분양가",
  "분양률",
  "PF금리",
  "LTV",
  "사업기간",
  "에쿼티",
];

type FeasibilityFormProps = {
  onRun: () => void;
};

export default function FeasibilityForm({ onRun }: FeasibilityFormProps) {
  // TODO: 여기에 tRPC 연결
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <h2 className="mb-4 text-sm font-semibold text-white">사업성 분석 입력</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((field) => (
          <label key={field} className="grid gap-1 text-sm text-slate-400">
            {field}
            <input
              className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500"
              placeholder={`${field} 입력`}
            />
          </label>
        ))}
      </div>
      <button onClick={onRun} className="mt-4 w-full rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700">
        분석 실행
      </button>
    </div>
  );
}
