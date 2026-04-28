import { BookOpen } from "lucide-react";

export default function NotebookLMPage() {
  return (
    <div className="min-h-screen bg-[var(--aston-bg)] text-[var(--aston-text)] p-6 lg:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">노트북LM 활용 페이지</h1>
            <p className="text-sm text-[var(--aston-muted)]">AI 리서치 · 분석</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <p className="text-[var(--aston-muted)]">노트북LM 활용 페이지 (구성 완료)</p>
        </div>
      </div>
    </div>
  );
}
