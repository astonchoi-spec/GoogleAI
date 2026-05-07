import { useMemo, useState } from "react";
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
  ChevronLeft,
  type LucideIcon,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// 카테고리 정의 — title은 UI 표시용 한글, key는 wikiStore의 categories[] 매칭용 영문
interface Category {
  icon: LucideIcon;
  key: string;
  title: string;
  description: string;
  // 매칭에 사용할 키워드들 (한글 카테고리 + 영문 카테고리 + 변형)
  match: string[];
}

const categories: Category[] = [
  { icon: Users,       key: "family",      title: "가족 · 삶",          description: "가족 일정, 자녀 교육, 부모님 케어, 반려견 황금이, 가족 기록, 여행, 생활 관리", match: ["family", "가족", "personal"] },
  { icon: TrendingUp,  key: "trading",     title: "금융 · 트레이딩",     description: "나스닥, 비트코인, 해외선물, 알고리즘 매매, 리스크 관리", match: ["trading", "crypto", "stock", "금융", "트레이딩"] },
  { icon: Building2,   key: "realestate",  title: "부동산 · PF",          description: "한남644, 역북동, 성복동, 신탁, 대주단, 사업수지표", match: ["realestate", "real-estate", "부동산"] },
  { icon: Bot,         key: "ai",          title: "AI · 워크스테이션",    description: "에스턴 워크스테이션, Gemini, Codex, 로컬 Gemma, 에이전트", match: ["ai", "system", "workstation"] },
  { icon: Briefcase,   key: "company",     title: "회사 · 운영",          description: "에스턴홀딩스, 폴스타디엑스, 링크에이트, 자유로지스틱스, 업무매뉴얼", match: ["company", "회사"] },
  { icon: Globe,       key: "mongolia",    title: "몽골 사업",            description: "몽골 부동산, 관급공사, 에너지, 구리, 유통, 프랜차이즈", match: ["mongolia", "몽골"] },
  { icon: Scale,       key: "legal",       title: "법무 · 계약 · 분쟁",   description: "특약사항, 자문계약서, 내용증명, 손해배상, M&A, 공매", match: ["legal", "법무"] },
  { icon: FileSearch,  key: "research",    title: "리서치 · 인사이트",    description: "NotebookLM 분석자료, 시장조사, 유튜브 요약, 책 요약, 보고서", match: ["research", "리서치", "notebooklm"] },
  { icon: Target,      key: "strategy",    title: "개인 전략 · 다이어리", description: "명언, 인생전략, 목표, 회고, 건강관리, 루틴", match: ["strategy", "전략", "diary"] },
];

type WikiSearchEntry = {
  id: string;
  date: string;
  title: string;
  categories: string[];
  source: string;
  bodyPreview: string;
  filePath: string;
  matchInTitle: boolean;
};

function formatRelativeDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))}분 전`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}시간 전`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}일 전`;
  return d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function WikiPage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // 단순 디바운스 — 입력 후 350ms 정지하면 검색 실행
  useMemo(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const status = trpc.wiki.status.useQuery();

  const recent = trpc.wiki.recent.useQuery(
    { limit: 12 },
    { enabled: !activeCategory && debouncedQuery.length === 0 },
  );

  const search = trpc.wiki.search.useQuery(
    { query: debouncedQuery, limit: 30 },
    { enabled: debouncedQuery.length >= 1 && !activeCategory },
  );

  const byCategory = trpc.wiki.byCategory.useQuery(
    activeCategory ? { category: activeCategory.match[0], limit: 50 } : { category: "_disabled_", limit: 1 },
    { enabled: !!activeCategory },
  );

  const showSearch = debouncedQuery.length >= 1 && !activeCategory;
  const showCategory = !!activeCategory;
  const showRecent = !showSearch && !showCategory;

  const activeResults: WikiSearchEntry[] = showSearch
    ? (search.data?.results ?? [])
    : showCategory
      ? (byCategory.data?.results ?? [])
      : (recent.data?.results ?? []);

  const isLoading = showSearch ? search.isLoading : showCategory ? byCategory.isLoading : recent.isLoading;
  const fetchError = showSearch
    ? search.data?.error
    : showCategory
      ? byCategory.data?.error
      : recent.data?.error;

  const wikiRoot = status.data?.astonRoot || status.data?.root;
  const configured = status.data?.configured ?? false;

  const openFolder = trpc.wiki.openFolder.useMutation();
  const handleOpenFolder = (target: "aston" | "legacy") => {
    openFolder.mutate(
      { target },
      {
        onSuccess: (res) => {
          if (!res.ok) alert(`폴더 열기 실패: ${res.error}`);
        },
        onError: (err) => alert(`폴더 열기 실패: ${err.message}`),
      },
    );
  };

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
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length > 0) setActiveCategory(null);
            }}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-[var(--aston-text)] placeholder:text-[var(--aston-muted)] focus:border-cyan-500/40 focus:outline-none focus:ring-0 transition"
          />
        </div>

        {/* Active filter (category back button) */}
        {activeCategory && (
          <button
            onClick={() => setActiveCategory(null)}
            className="mb-4 inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 transition"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {activeCategory.title} · 모든 카테고리로 돌아가기
          </button>
        )}

        {/* Category Cards (only when no search & no active category) */}
        {showRecent && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => {
                  setQuery("");
                  setDebouncedQuery("");
                  setActiveCategory(cat);
                }}
                style={{
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.06)",
                  padding: "20px",
                  transition: "border-color 0.15s, background 0.15s",
                  textAlign: "left",
                  background: "transparent",
                }}
                className="wiki-card"
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <cat.icon size={24} strokeWidth={1.5} style={{ flexShrink: 0, color: "rgb(34,211,238)" }} />
                  <h3 style={{ fontSize: "14px", fontWeight: 500, color: "var(--aston-text)" }}>{cat.title}</h3>
                </div>
                <p style={{ fontSize: "12px", color: "var(--aston-muted)", lineHeight: "1.6" }}>{cat.description}</p>
              </button>
            ))}
          </div>
        )}

        {/* Results section */}
        <div className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--aston-text)]">
              {showSearch ? `검색 결과 — "${debouncedQuery}"` : showCategory ? `${activeCategory?.title} 카테고리` : "최근 항목"}
            </h2>
            <span className="text-xs text-[var(--aston-muted)]">
              {isLoading ? "불러오는 중..." : `${activeResults.length}건`}
            </span>
          </div>

          {fetchError && (
            <div className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
              ⚠️ {fetchError}
            </div>
          )}

          {!configured && status.data && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
              ⚠️ WIKI_ROOT 환경변수가 설정되지 않았습니다. <code className="font-mono">.env</code>에{" "}
              <code className="font-mono">ASTON_WIKI_ROOT</code> 또는 <code className="font-mono">WIKI_ROOT</code>를 추가해 주세요.
            </div>
          )}

          {!isLoading && activeResults.length === 0 && configured && !fetchError && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-6 text-center text-xs text-[var(--aston-muted)]">
              {showSearch ? "검색 결과가 없습니다." : "아직 저장된 위키 항목이 없습니다."}
            </div>
          )}

          {!isLoading && activeResults.length > 0 && (
            <div className="space-y-2">
              {activeResults.map((entry) => (
                <div
                  key={entry.filePath}
                  className="rounded-lg border border-white/10 bg-white/[0.03] hover:border-cyan-500/30 hover:bg-white/[0.05] transition px-4 py-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-medium text-[var(--aston-text)] truncate">
                      {entry.title || "(제목 없음)"}
                    </h3>
                    <span className="shrink-0 text-[10px] text-[var(--aston-muted)]">
                      {formatRelativeDate(entry.date)}
                    </span>
                  </div>
                  {entry.bodyPreview && (
                    <p className="mt-1 text-xs text-[var(--aston-muted)] line-clamp-2">{entry.bodyPreview}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {entry.categories.slice(0, 6).map((c) => (
                      <span
                        key={c}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-500/20 bg-cyan-500/5 text-cyan-300"
                      >
                        #{c}
                      </span>
                    ))}
                    {entry.source && (
                      <span className="text-[10px] text-[var(--aston-muted)] ml-1">· {entry.source}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Wiki Root status — 클릭 시 Windows Explorer 열림 */}
        <div className="mt-8 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-[var(--aston-muted)]">
          <HardDrive className="h-4 w-4 text-cyan-300 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            {configured ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--aston-text)]">Wiki 저장소 연결됨</span>
                  <button
                    type="button"
                    onClick={() => handleOpenFolder(status.data?.astonRoot ? "aston" : "legacy")}
                    disabled={openFolder.isPending}
                    title="폴더 열기"
                    className="font-mono text-[10px] break-all text-cyan-300 hover:text-cyan-200 hover:underline disabled:opacity-60 transition cursor-pointer"
                  >
                    {wikiRoot}
                  </button>
                </div>
              </>
            ) : (
              "Wiki 저장소 미연결 — .env의 ASTON_WIKI_ROOT 또는 WIKI_ROOT 설정 필요"
            )}
            {status.data?.astonRoot && status.data?.root && status.data.astonRoot !== status.data.root && (
              <div className="mt-1 text-[10px] flex items-center gap-1.5">
                <span>레거시 폴더:</span>
                <button
                  type="button"
                  onClick={() => handleOpenFolder("legacy")}
                  disabled={openFolder.isPending}
                  title="레거시 폴더 열기"
                  className="font-mono text-cyan-300 hover:text-cyan-200 hover:underline disabled:opacity-60 transition cursor-pointer"
                >
                  {status.data.root}
                </button>
              </div>
            )}
            {openFolder.isPending && <div className="mt-1 text-[10px] text-cyan-300">📂 폴더 열기 요청 중...</div>}
            {openFolder.data?.ok && (
              <div className="mt-1 text-[10px] text-emerald-400">✅ Windows 탐색기에 폴더가 열렸습니다.</div>
            )}
          </div>
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
