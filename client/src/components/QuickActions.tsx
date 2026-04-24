const actions = [
  "잔고 조회",
  "포지션 확인",
  "BTC 기술적 분석",
  "PF 포트폴리오 요약",
  "사업성 분석",
];

type QuickActionsProps = {
  onSelect: (text: string) => void;
  disabled?: boolean;
};

export default function QuickActions({ onSelect, disabled = false }: QuickActionsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {actions.map((action) => (
        <button
          key={action}
          onClick={() => onSelect(action)}
          disabled={disabled}
          className="shrink-0 rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-600/50 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {action}
        </button>
      ))}
    </div>
  );
}

