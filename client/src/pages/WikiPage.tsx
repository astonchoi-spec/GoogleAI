import {
  Library,
  Search,
  HardDrive,
  Users,
  TrendingUp,
  Building2,
  Bot,
  Briefcase,
  Globe,
  Scale,
  FileSearch,
  Target,
  type LucideIcon,
} from "lucide-react";

interface Category {
  icon: LucideIcon;
  title: string;
  description: string;
}

const categories: Category[] = [
  { icon: Users,       title: "가족 · 삶",          description: "가족 일정, 자녀 교육, 부모님 케어, 반려견 황금이, 가족 기록, 여행, 생활 관리" },
  { icon: TrendingUp,  title: "금융 · 트레이딩",     description: "나스닥, 비트코인, 해외선물, 알고리즘 매매, 리스크 관리" },
  { icon: Building2,   title: "부동산 · PF",          description: "한남644, 역북동, 성복동, 신탁, 대주단, 사업수지표" },
  { icon: Bot,         title: "AI · 워크스테이션",    description: "에스턴 워크스테이션, Gemini, Codex, 로컬 Gemma, 에이전트" },
  { icon: Briefcase,   title: "회사 · 운영",          description: "에스턴홀딩스, 폴스타디엑스, 링크에이트, 자유로지스틱스, 업무매뉴얼" },
  { icon: Globe,       title: "몽골 사업",            description: "몽골 부동산, 관급공사, 에너지, 구리, 유통, 프랜차이즈" },
  { icon: Scale,       title: "법무 · 계약 · 분쟁",   description: "특약사항, 자문계약서, 내용증명, 손해배상, M&A, 공매" },
  { icon: FileSearch,  title: "리서치 · 인사이트",    description: "NotebookLM 분석자료, 시장조사, 유튜브 요약, 책 요약, 보고서" },
  { icon: Target,      title: "개인 전략 · 다이어리", description: "명언, 인생전략, 목표, 회고, 건강관리, 루틴" },
];

export default function WikiPage() {
  return (
    <div className="min-h-screen bg-[var(--aston-bg)] text-[var(--aston-text)] p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
            <Library className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">에스턴 위키 - 개인 지식 저장소</h1>
            <p className="text-sm text-[var(--aston-muted)]">
              가족 · 사업 · 투자 · AI · 리서치 자료를 한 곳에 정리하는 개인 지식 허브
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="mt-6 mb-6 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--aston-muted)]" />
          <input
            type="text"
            placeholder="위키에서 검색..."
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-[var(--aston-text)] placeholder:text-[var(--aston-muted)] focus:border-cyan-500/40 focus:outline-none focus:ring-0 transition"
          />
        </div>

        {/* Category Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              style={{
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.06)",
                padding: "20px",
                transition: "border-color 0.15s, background 0.15s",
                cursor: "default",
              }}
              className="wiki-card"
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <Icon size={24} strokeWidth={1.5} style={{ flexShrink: 0, color: "rgb(34,211,238)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 500, color: "var(--aston-text)" }}>{title}</h3>
              </div>
              <p style={{ fontSize: "12px", color: "var(--aston-muted)", lineHeight: "1.6" }}>{description}</p>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-8 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-[var(--aston-muted)]">
          <HardDrive className="h-4 w-4 text-cyan-300 shrink-0" />
          <span>Google Drive 연동 예정</span>
        </div>
      </div>

      <style>{`
        .wiki-card:hover {
          border-color: rgba(0,255,255,0.3) !important;
          background: rgba(0,255,255,0.05) !important;
        }
      `}</style>
    </div>
  );
}
