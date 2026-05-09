import { useMemo, useState } from "react";
import {
  BookOpen,
  Search,
  ExternalLink,
  Database,
  FolderTree,
  Cpu,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

type TabKey = "track-a" | "track-b";

const CATEGORY_KEYS = [
  "real-estate",
  "trading",
  "system",
  "learning",
  "research",
  "legal",
  "business",
  "mongolia",
  "personal",
  "health",
] as const;

type CategoryKey = (typeof CATEGORY_KEYS)[number];

const CATEGORY_COLOR: Record<CategoryKey, string> = {
  "real-estate": "border-amber-500/30 bg-amber-500/10 text-amber-200",
  trading: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  system: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  learning: "border-violet-500/30 bg-violet-500/10 text-violet-200",
  research: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  legal: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  business: "border-blue-500/30 bg-blue-500/10 text-blue-200",
  mongolia: "border-orange-500/30 bg-orange-500/10 text-orange-200",
  personal: "border-pink-500/30 bg-pink-500/10 text-pink-200",
  health: "border-teal-500/30 bg-teal-500/10 text-teal-200",
};

export default function KnowledgeRagPage() {
  const [tab, setTab] = useState<TabKey>("track-a");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryKey | null>(null);

  const mappings = trpc.rag.listMappings.useQuery();
  const dataStores = trpc.rag.listDataStores.useQuery();

  const filteredNotebooks = useMemo(() => {
    const all = mappings.data?.notebooks ?? [];
    let list = all;
    if (activeCategory) list = list.filter((nb) => nb.category === activeCategory);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (nb) =>
          nb.notebook_name.toLowerCase().includes(q) ||
          nb.display_name.toLowerCase().includes(q) ||
          nb.project.toLowerCase().includes(q),
      );
    }
    return list;
  }, [mappings.data, activeCategory, search]);

  return (
    <div className="min-h-screen bg-[var(--aston-bg)] text-[var(--aston-text)] p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">통합 지식 RAG</h1>
            <p className="text-sm text-[var(--aston-muted)]">
              Track A 외부 NotebookLM 카탈로그 + Track B 내부 Discovery Engine RAG
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-2 border-b border-white/10">
          <TabButton active={tab === "track-a"} onClick={() => setTab("track-a")}>
            <BookOpen className="h-4 w-4 mr-1.5" />
            Track A — 외부 NotebookLM
            {mappings.data && (
              <span className="ml-2 rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-200">
                {mappings.data.totalNotebooks}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === "track-b"} onClick={() => setTab("track-b")}>
            <Database className="h-4 w-4 mr-1.5" />
            Track B — 내부 RAG (Discovery Engine)
            <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200">
              Phase 2 예정
            </span>
          </TabButton>
        </div>

        {tab === "track-a" ? (
          <TrackAPanel
            notebooks={filteredNotebooks}
            allCount={mappings.data?.totalNotebooks ?? 0}
            categoryCounts={mappings.data?.categoryCounts ?? {}}
            categoryLabels={mappings.data?.categoryLabels ?? {}}
            isLoading={mappings.isLoading}
            error={mappings.error?.message}
            search={search}
            setSearch={setSearch}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            validationIssues={mappings.data?.validationIssues ?? []}
          />
        ) : (
          <TrackBPanel
            dataStores={dataStores.data ?? []}
            isLoading={dataStores.isLoading}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-cyan-400 text-cyan-100"
          : "border-transparent text-[var(--aston-muted)] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

interface TrackAPanelProps {
  notebooks: Array<{
    notebook_name: string;
    project: string;
    display_name: string;
    category: string;
    status: string;
    data_store: string;
    data_store_filter: string;
    notebook_url?: string;
    notes?: string;
    created_at?: string;
  }>;
  allCount: number;
  categoryCounts: Record<string, number>;
  categoryLabels: Record<string, string>;
  isLoading: boolean;
  error?: string;
  search: string;
  setSearch: (s: string) => void;
  activeCategory: CategoryKey | null;
  setActiveCategory: (c: CategoryKey | null) => void;
  validationIssues: Array<{ index: number; notebook_name: string; errors: string[] }>;
}

function TrackAPanel({
  notebooks,
  allCount,
  categoryCounts,
  categoryLabels,
  isLoading,
  error,
  search,
  setSearch,
  activeCategory,
  setActiveCategory,
  validationIssues,
}: TrackAPanelProps) {
  return (
    <>
      {/* Search */}
      <div className="mt-6 mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--aston-muted)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="노트북 이름·프로젝트·표시명으로 검색"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-sm placeholder-[var(--aston-muted)] focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
        />
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        <CategoryChip
          active={activeCategory === null}
          onClick={() => setActiveCategory(null)}
          label="전체"
          count={allCount}
        />
        {CATEGORY_KEYS.map((key) => {
          const count = categoryCounts[key] ?? 0;
          if (count === 0) return null;
          return (
            <CategoryChip
              key={key}
              active={activeCategory === key}
              onClick={() => setActiveCategory(activeCategory === key ? null : key)}
              label={categoryLabels[key] ?? key}
              count={count}
              colorClass={CATEGORY_COLOR[key]}
            />
          );
        })}
      </div>

      {/* Validation warning */}
      {validationIssues.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 text-amber-200 text-sm font-medium mb-2">
            <AlertTriangle className="h-4 w-4" />
            매핑 yaml 검증 이슈 {validationIssues.length}건
          </div>
          <ul className="text-xs text-amber-200/70 space-y-1">
            {validationIssues.slice(0, 5).map((iss) => (
              <li key={iss.index}>
                #{iss.index} {iss.notebook_name}: {iss.errors.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Notebook grid */}
      {isLoading ? (
        <div className="text-center py-12 text-[var(--aston-muted)]">로딩 중…</div>
      ) : error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-rose-200">
          오류: {error}
        </div>
      ) : notebooks.length === 0 ? (
        <div className="text-center py-12 text-[var(--aston-muted)]">
          {search || activeCategory
            ? "조건에 맞는 노트북이 없습니다."
            : "매핑된 노트북이 없습니다."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {notebooks.map((nb) => (
            <NotebookCard key={nb.project} nb={nb} categoryLabels={categoryLabels} />
          ))}
        </div>
      )}

      {/* Phase 1 안내 */}
      <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-[var(--aston-muted)] leading-relaxed">
        <div className="flex items-center gap-2 text-[var(--aston-text)] font-medium mb-1.5">
          <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
          Phase 1 (현재): 카탈로그 표시 전용
        </div>
        <ul className="space-y-1 list-disc pl-5">
          <li>NotebookLM 외부 링크 활성화 — `notebook_url` 필드 채워진 노트북만 (현재 0건, 회장님 입력 대기)</li>
          <li>분석 결과 회수 입력 폼 — Phase 3 예정</li>
          <li>Drive Watcher 상태 — Phase 3 예정 (NotebookLM Docs export 폴더 polling)</li>
          <li>Track B Discovery Engine 연동 — Phase 2 예정 (`VERTEX_SEARCH_*` 환경변수 활성화 시)</li>
        </ul>
      </div>
    </>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
  count,
  colorClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  colorClass?: string;
}) {
  const base = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-colors";
  if (active) {
    return (
      <button onClick={onClick} className={`${base} border-cyan-400 bg-cyan-500/15 text-cyan-100`}>
        {label}
        <span className="ml-1 opacity-80">{count}</span>
      </button>
    );
  }
  const inactive = colorClass ?? "border-white/15 bg-white/[0.03] text-[var(--aston-muted)]";
  return (
    <button onClick={onClick} className={`${base} ${inactive} hover:text-white`}>
      {label}
      <span className="ml-1 opacity-80">{count}</span>
    </button>
  );
}

function NotebookCard({
  nb,
  categoryLabels,
}: {
  nb: TrackAPanelProps["notebooks"][number];
  categoryLabels: Record<string, string>;
}) {
  const colorClass = CATEGORY_COLOR[nb.category as CategoryKey] ?? "border-white/15 bg-white/[0.03] text-white";
  const hasUrl = !!nb.notebook_url?.trim();
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:border-cyan-500/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--aston-text)] truncate">
            {nb.display_name}
          </div>
          <div className="text-xs text-[var(--aston-muted)] mt-0.5 line-clamp-2">
            {nb.notebook_name}
          </div>
        </div>
        {hasUrl ? (
          <a
            href={nb.notebook_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 shrink-0"
            title="NotebookLM에서 열기"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-white/30 shrink-0"
            title="notebook_url 미설정"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] border ${colorClass}`}>
          {categoryLabels[nb.category] ?? nb.category}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-white/10 bg-white/[0.02] text-[var(--aston-muted)]">
          <FolderTree className="h-3 w-3" />
          {nb.project}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-white/10 bg-white/[0.02] text-[var(--aston-muted)]">
          <Database className="h-3 w-3" />
          {nb.data_store}
        </span>
      </div>

      {nb.notes && (
        <div className="mt-2 text-[11px] text-[var(--aston-muted)] italic">
          📝 {nb.notes}
        </div>
      )}
    </div>
  );
}

function TrackBPanel({
  dataStores,
  isLoading,
}: {
  dataStores: Array<{ id: string; label: string; projects: string[]; count: number }>;
  isLoading: boolean;
}) {
  return (
    <div className="mt-6">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 mb-6">
        <div className="flex items-center gap-2 text-amber-200 text-sm font-medium mb-2">
          <Cpu className="h-4 w-4" />
          Track B — 내부 GCP Discovery Engine RAG (Phase 2 예정)
        </div>
        <p className="text-xs text-amber-200/80 leading-relaxed">
          GCP Discovery Engine API를 사용한 자체 RAG 파이프라인. 28개 노트북을 9개 데이터 스토어로
          그룹핑한 매핑은 이미 준비되어 있으며, Phase 2에서 인증·문서 업로드·쿼리 메서드를 구현 후 활성화합니다.
          환경변수 <code className="bg-amber-500/15 px-1 rounded">VERTEX_SEARCH_PROJECT_ID</code>,{" "}
          <code className="bg-amber-500/15 px-1 rounded">VERTEX_SEARCH_SERVICE_ACCOUNT_JSON</code>{" "}
          가 필요합니다.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-[var(--aston-muted)]">로딩 중…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {dataStores.map((ds) => (
            <div
              key={ds.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-cyan-300" />
                <div className="text-sm font-medium">{ds.label}</div>
              </div>
              <div className="text-xs text-[var(--aston-muted)] font-mono mb-2">{ds.id}</div>
              <div className="text-xs text-[var(--aston-muted)]">
                매핑된 프로젝트: <span className="text-cyan-200 font-medium">{ds.count}</span>
              </div>
              {ds.projects.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {ds.projects.slice(0, 6).map((p) => (
                    <span
                      key={p}
                      className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-[var(--aston-muted)] truncate max-w-[120px]"
                      title={p}
                    >
                      {p}
                    </span>
                  ))}
                  {ds.projects.length > 6 && (
                    <span className="text-[10px] text-[var(--aston-muted)]">
                      +{ds.projects.length - 6}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
