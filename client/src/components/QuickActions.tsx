const actions = [
  "Binance 잔고 조회",
  "현재 포지션 확인",
  "BTC/USDT 1시간봉 기술분석",
  "PF 딜 파이프라인 요약",
  "DART 공시 조회",
  "회사명으로 DART 검색",
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
          type="button"
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
