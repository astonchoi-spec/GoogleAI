import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { Link } from "wouter";

interface DocMenuProps {
  onNavigate?: () => void;
}

const DOC_ITEMS = [
  { label: "개요", anchor: "overview" },
  { label: "아키텍처", anchor: "architecture" },
  { label: "기능", anchor: "features" },
  { label: "대화 흐름", anchor: "conversation-flow" },
  { label: "기술 스택", anchor: "tech-stack" },
  { label: "구현 예제", anchor: "examples" },
  { label: "API 참조", anchor: "api-reference" },
  { label: "보안", anchor: "security" },
  { label: "로드맵", anchor: "roadmap" },
];

export default function DocMenu({ onNavigate }: DocMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm font-semibold text-[var(--aston-text)] transition hover:bg-white/5"
      >
        <span className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-cyan-300" />
          문서 / 기술자료
        </span>
        <ChevronDown
          className={`h-4 w-4 text-[var(--aston-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div className={`grid overflow-hidden transition-all duration-300 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="mt-2 space-y-1.5">
            {DOC_ITEMS.map((item) => (
              <Link
                key={item.anchor}
                href={`/#${item.anchor}`}
                onClick={onNavigate}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--aston-muted)] transition hover:bg-white/5 hover:text-[var(--aston-text)]"
              >
                <span>{item.label}</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--aston-muted)]">doc</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
