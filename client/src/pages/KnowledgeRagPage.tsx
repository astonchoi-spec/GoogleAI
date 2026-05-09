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
  Save,
  FileText,
  X,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  HardDrive,
  Folder,
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
  // 선택된 노트북 (회수 입력 + 회수 자료 필터링 컨텍스트)
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  // 회수 입력 폼 상태
  const [pasteBody, setPasteBody] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [saveResult, setSaveResult] = useState<
    | { kind: "ok"; savedPath: string; wasSkipped: boolean }
    | { kind: "err"; message: string }
    | null
  >(null);
  // 본문 미리보기 모달
  const [previewKey, setPreviewKey] = useState<{ project: string; filename: string } | null>(null);

  const mappings = trpc.rag.listMappings.useQuery();
  const dataStores = trpc.rag.listDataStores.useQuery();
  const trackBStatus = trpc.rag.trackBStatus.useQuery();
  const driveStatus = trpc.rag.driveWatcherStatus.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const savedNotes = trpc.rag.listSavedNotes.useQuery({
    project: selectedProject ?? undefined,
    limit: 30,
  });
  const sourceFiles = trpc.rag.listSourceFiles.useQuery(
    { project: selectedProject ?? "_disabled_" },
    { enabled: !!selectedProject },
  );
  const noteContent = trpc.rag.readSavedNote.useQuery(
    previewKey ?? { project: "_disabled_", filename: "_disabled_.md" },
    { enabled: !!previewKey },
  );

  const utils = trpc.useUtils();
  const triggerScan = trpc.rag.triggerDriveScan.useMutation({
    onSuccess: () => {
      utils.rag.driveWatcherStatus.invalidate();
      utils.rag.listSavedNotes.invalidate();
    },
  });
  const saveAnalysis = trpc.rag.saveAnalysis.useMutation({
    onSuccess: (res) => {
      if (res.ok) {
        setSaveResult({
          kind: "ok",
          savedPath: res.savedPath,
          wasSkipped: res.wasSkipped,
        });
        setPasteBody("");
        setSourceLabel("");
        // 회수 자료 목록 즉시 갱신
        utils.rag.listSavedNotes.invalidate();
      } else {
        setSaveResult({ kind: "err", message: res.error });
      }
    },
    onError: (err) => setSaveResult({ kind: "err", message: err.message }),
  });

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
            <h1 className="text-xl font-semibold">노트북LM</h1>
            <p className="text-sm text-[var(--aston-muted)]">
              AI 리서치 · 분석 — 외부 NotebookLM 28개 카탈로그 + 내부 RAG (Discovery Engine)
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
            {trackBStatus.data?.configured ? (
              <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200">
                🟢 ADC
              </span>
            ) : (
              <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200">
                ❓ 미설정
              </span>
            )}
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
            selectedProject={selectedProject}
            setSelectedProject={setSelectedProject}
            pasteBody={pasteBody}
            setPasteBody={setPasteBody}
            sourceLabel={sourceLabel}
            setSourceLabel={setSourceLabel}
            saveResult={saveResult}
            setSaveResult={setSaveResult}
            onSave={() => {
              if (!selectedProject) return;
              setSaveResult(null);
              saveAnalysis.mutate({
                project: selectedProject,
                body: pasteBody,
                sourceLabel: sourceLabel || undefined,
              });
            }}
            isSaving={saveAnalysis.isPending}
            savedNotes={savedNotes.data?.items ?? []}
            savedTotal={savedNotes.data?.totalScanned ?? 0}
            isLoadingSaved={savedNotes.isLoading}
            onPreview={(project, filename) => setPreviewKey({ project, filename })}
            driveStatus={driveStatus.data}
            onScan={() => triggerScan.mutate()}
            isScanning={triggerScan.isPending}
            scanResult={triggerScan.data}
            sourceFiles={sourceFiles.data?.ok ? sourceFiles.data.files : []}
            sourceFolderPath={sourceFiles.data?.ok ? sourceFiles.data.sourceFolder : null}
            exportFolderPath={sourceFiles.data?.ok ? sourceFiles.data.exportFolder : null}
            isLoadingSources={sourceFiles.isLoading}
          />
        ) : (
          <TrackBPanel
            dataStores={dataStores.data ?? []}
            isLoading={dataStores.isLoading}
            status={trackBStatus.data}
          />
        )}

        {/* 회수 자료 본문 미리보기 모달 */}
        {previewKey && (
          <PreviewModal
            project={previewKey.project}
            filename={previewKey.filename}
            content={noteContent.data?.ok ? noteContent.data.content : null}
            error={
              noteContent.data?.ok === false ? noteContent.data.error : noteContent.error?.message
            }
            isLoading={noteContent.isLoading}
            onClose={() => setPreviewKey(null)}
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

interface SavedNoteItem {
  project: string;
  filename: string;
  relativePath: string;
  sizeBytes: number;
  mtime: string;
  titleHint: string;
}

interface SourceFileItem {
  filename: string;
  sizeBytes: number;
  mtime: string;
  extension: string;
}

interface DriveStatus {
  enabled: boolean;
  watchedRoot: string;
  watchedProjects: string[];
  startedAt: string | null;
  lastEventAt: string | null;
  ingestedCount: number;
  recentEvents: Array<{
    filePath: string;
    project: string;
    ingestedAt: string;
    reason: string;
    savedPath?: string;
    error?: string;
  }>;
  exportsRoot: string;
  sourcesRoot: string;
  wikiRoot: string;
}

type SaveResult =
  | { kind: "ok"; savedPath: string; wasSkipped: boolean }
  | { kind: "err"; message: string }
  | null;

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
  // Phase W-1
  selectedProject: string | null;
  setSelectedProject: (p: string | null) => void;
  pasteBody: string;
  setPasteBody: (s: string) => void;
  sourceLabel: string;
  setSourceLabel: (s: string) => void;
  saveResult: SaveResult;
  setSaveResult: (r: SaveResult) => void;
  onSave: () => void;
  isSaving: boolean;
  savedNotes: SavedNoteItem[];
  savedTotal: number;
  isLoadingSaved: boolean;
  onPreview: (project: string, filename: string) => void;
  // Phase W-2
  driveStatus?: DriveStatus;
  onScan: () => void;
  isScanning: boolean;
  scanResult?: { scanned: number; newlyIngested: number };
  sourceFiles: SourceFileItem[];
  sourceFolderPath: string | null;
  exportFolderPath: string | null;
  isLoadingSources: boolean;
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
  selectedProject,
  setSelectedProject,
  pasteBody,
  setPasteBody,
  sourceLabel,
  setSourceLabel,
  saveResult,
  setSaveResult,
  onSave,
  isSaving,
  savedNotes,
  savedTotal,
  isLoadingSaved,
  onPreview,
  driveStatus,
  onScan,
  isScanning,
  scanResult,
  sourceFiles,
  sourceFolderPath,
  exportFolderPath,
  isLoadingSources,
}: TrackAPanelProps) {
  const selectedNotebook = notebooks.find((n) => n.project === selectedProject) ?? null;
  return (
    <>
      {/* Drive Watcher Status */}
      <DriveWatcherCard
        status={driveStatus}
        onScan={onScan}
        isScanning={isScanning}
        scanResult={scanResult}
      />

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
            <NotebookCard
              key={nb.project}
              nb={nb}
              categoryLabels={categoryLabels}
              isSelected={selectedProject === nb.project}
              onSelect={() =>
                setSelectedProject(selectedProject === nb.project ? null : nb.project)
              }
            />
          ))}
        </div>
      )}

      {/* 소스 자료 (NotebookLM 입력) */}
      <SourceFilesSection
        selectedNotebook={selectedNotebook}
        files={sourceFiles}
        sourceFolderPath={sourceFolderPath}
        exportFolderPath={exportFolderPath}
        isLoading={isLoadingSources}
      />

      {/* 회수 입력 폼 */}
      <PasteForm
        selectedNotebook={selectedNotebook}
        pasteBody={pasteBody}
        setPasteBody={setPasteBody}
        sourceLabel={sourceLabel}
        setSourceLabel={setSourceLabel}
        saveResult={saveResult}
        setSaveResult={setSaveResult}
        onSave={onSave}
        isSaving={isSaving}
        onClear={() => setSelectedProject(null)}
      />

      {/* 회수된 자료 섹션 */}
      <SavedNotesSection
        selectedNotebook={selectedNotebook}
        items={savedNotes}
        totalScanned={savedTotal}
        isLoading={isLoadingSaved}
        onPreview={onPreview}
      />

      {/* Phase 안내 */}
      <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-[var(--aston-muted)] leading-relaxed">
        <div className="flex items-center gap-2 text-[var(--aston-text)] font-medium mb-1.5">
          <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
          현재 동작 단계
        </div>
        <ul className="space-y-1 list-disc pl-5">
          <li>✅ <b>Phase W-1</b>: 노트북 카드 클릭 → 분석 결과 붙여넣기 → Wiki 자동 저장 (회수 자료 즉시 갱신)</li>
          <li>⬜ <b>Phase W-2</b>: NotebookLM Docs export → Drive Watcher 자동 회수 (회장님 1클릭)</li>
          <li>⬜ <b>채팅 RAG 주입</b>: 회수된 자료를 채팅 답변 컨텍스트로 자동 사용</li>
          <li>⬜ <b>Track B</b> Discovery Engine 인덱싱 — 위키 자료 안정화 후 검토</li>
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
  isSelected,
  onSelect,
}: {
  nb: TrackAPanelProps["notebooks"][number];
  categoryLabels: Record<string, string>;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const colorClass = CATEGORY_COLOR[nb.category as CategoryKey] ?? "border-white/15 bg-white/[0.03] text-white";
  const hasUrl = !!nb.notebook_url?.trim();
  const cardBorder = isSelected
    ? "border-cyan-400 bg-cyan-500/10"
    : "border-white/10 bg-white/[0.03] hover:border-cyan-500/40";
  return (
    <div
      onClick={onSelect}
      className={`rounded-xl border p-4 transition-colors cursor-pointer ${cardBorder}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--aston-text)] truncate flex items-center gap-1.5">
            {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-cyan-300 shrink-0" />}
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
            onClick={(e) => e.stopPropagation()}
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

function PasteForm({
  selectedNotebook,
  pasteBody,
  setPasteBody,
  sourceLabel,
  setSourceLabel,
  saveResult,
  setSaveResult,
  onSave,
  isSaving,
  onClear,
}: {
  selectedNotebook: TrackAPanelProps["notebooks"][number] | null;
  pasteBody: string;
  setPasteBody: (s: string) => void;
  sourceLabel: string;
  setSourceLabel: (s: string) => void;
  saveResult: SaveResult;
  setSaveResult: (r: SaveResult) => void;
  onSave: () => void;
  isSaving: boolean;
  onClear: () => void;
}) {
  const canSave = !!selectedNotebook && pasteBody.trim().length >= 10 && !isSaving;
  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Save className="h-4 w-4 text-cyan-300" />
          <div className="text-sm font-medium">분석 결과 회수 (NotebookLM → Wiki 저장)</div>
        </div>
        {selectedNotebook && (
          <button
            onClick={onClear}
            className="text-xs text-[var(--aston-muted)] hover:text-white"
          >
            선택 해제
          </button>
        )}
      </div>

      {!selectedNotebook ? (
        <div className="text-xs text-[var(--aston-muted)] py-3">
          위 카드에서 회수할 노트북을 클릭해주세요.
        </div>
      ) : (
        <>
          <div className="text-xs text-[var(--aston-muted)] mb-2">
            저장 대상:{" "}
            <span className="text-cyan-200 font-medium">{selectedNotebook.display_name}</span>{" "}
            <span className="font-mono opacity-70">({selectedNotebook.project})</span>{" "}
            → <code className="bg-white/[0.05] px-1 rounded">projects/{selectedNotebook.project}/notebooklm/</code>
          </div>
          <textarea
            value={pasteBody}
            onChange={(e) => {
              setPasteBody(e.target.value);
              if (saveResult) setSaveResult(null);
            }}
            placeholder="NotebookLM에서 답변·요약·노트를 복사해서 붙여넣으세요. (최소 10자)"
            rows={8}
            className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/30 text-sm placeholder-[var(--aston-muted)] focus:outline-none focus:ring-1 focus:ring-cyan-400/40 font-mono leading-relaxed resize-y"
          />
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              placeholder="출처 라벨 (선택, 예: 한남동 PFV / 2026-05-09 미팅요약)"
              className="flex-1 px-3 py-2 rounded-lg border border-white/10 bg-black/30 text-xs placeholder-[var(--aston-muted)] focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
            />
            <button
              onClick={onSave}
              disabled={!canSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-cyan-500/40 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="h-3.5 w-3.5" />
              {isSaving ? "저장 중…" : "Wiki 저장"}
            </button>
          </div>
          {saveResult?.kind === "ok" && (
            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
              ✅ 저장 완료
              {saveResult.wasSkipped && " (이미 동일 내용 — skip)"}
              <div className="mt-1 font-mono opacity-80 break-all">{saveResult.savedPath}</div>
            </div>
          )}
          {saveResult?.kind === "err" && (
            <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
              ❌ 저장 실패: {saveResult.message}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SavedNotesSection({
  selectedNotebook,
  items,
  totalScanned,
  isLoading,
  onPreview,
}: {
  selectedNotebook: TrackAPanelProps["notebooks"][number] | null;
  items: SavedNoteItem[];
  totalScanned: number;
  isLoading: boolean;
  onPreview: (project: string, filename: string) => void;
}) {
  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-cyan-300" />
          <div className="text-sm font-medium">
            회수된 분석 자료
            {selectedNotebook ? (
              <span className="ml-2 text-xs text-[var(--aston-muted)]">
                — {selectedNotebook.display_name}
              </span>
            ) : (
              <span className="ml-2 text-xs text-[var(--aston-muted)]">— 전체 28개 노트북</span>
            )}
          </div>
        </div>
        <span className="text-xs text-[var(--aston-muted)]">
          {totalScanned}건 (최근 30건 표시)
        </span>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-[var(--aston-muted)] text-xs">로딩 중…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-6 text-[var(--aston-muted)] text-xs">
          {selectedNotebook
            ? `${selectedNotebook.display_name} 노트북에서 회수된 자료가 아직 없습니다. 위 폼으로 첫 자료를 회수해보세요.`
            : "회수된 자료가 없습니다. 노트북 카드를 선택해 첫 자료를 회수하세요."}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li
              key={`${it.project}::${it.filename}`}
              onClick={() => onPreview(it.project, it.filename)}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 hover:border-cyan-500/40 cursor-pointer"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-[var(--aston-text)] truncate">
                  {it.titleHint}
                </div>
                <div className="text-[10px] text-[var(--aston-muted)] font-mono truncate">
                  {it.relativePath}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-[10px] text-[var(--aston-muted)]">
                <span>{formatRelativeMtime(it.mtime)}</span>
                <span>{(it.sizeBytes / 1024).toFixed(1)}KB</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PreviewModal({
  project,
  filename,
  content,
  error,
  isLoading,
  onClose,
}: {
  project: string;
  filename: string;
  content: string | null;
  error?: string;
  isLoading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-white/15 bg-[var(--aston-bg)] shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-white/10">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{filename}</div>
            <div className="text-xs text-[var(--aston-muted)] font-mono truncate">
              projects/{project}/notebooklm/
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 hover:bg-white/[0.05]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {isLoading ? (
            <div className="text-center py-8 text-[var(--aston-muted)] text-sm">로딩 중…</div>
          ) : error ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              {error}
            </div>
          ) : (
            <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words font-mono text-[var(--aston-text)]">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function DriveWatcherCard({
  status,
  onScan,
  isScanning,
  scanResult,
}: {
  status?: DriveStatus;
  onScan: () => void;
  isScanning: boolean;
  scanResult?: { scanned: number; newlyIngested: number };
}) {
  const enabled = status?.enabled ?? false;
  const recent = status?.recentEvents ?? [];
  return (
    <div
      className={`mt-6 rounded-xl border p-4 ${
        enabled
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <HardDrive className={`h-4 w-4 ${enabled ? "text-emerald-300" : "text-amber-300"}`} />
          <div className="text-sm font-medium">
            {enabled ? "🟢" : "❓"} NotebookLM Drive 자동 동기화
          </div>
        </div>
        <button
          onClick={onScan}
          disabled={isScanning || !enabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-cyan-500/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-3 w-3 ${isScanning ? "animate-spin" : ""}`} />
          {isScanning ? "스캔 중…" : "지금 동기화"}
        </button>
      </div>
      {enabled ? (
        <div className="text-xs text-emerald-200/80 leading-relaxed space-y-1">
          <div>
            감시 폴더 <code className="bg-emerald-500/15 px-1 rounded">{status?.exportsRoot}</code>
            {" "}({status?.watchedProjects.length}개 노트북 폴더 감시 중)
          </div>
          <div>
            누적 회수 <span className="text-emerald-100 font-medium">{status?.ingestedCount}건</span>
            {status?.lastEventAt && (
              <span className="ml-2 opacity-70">— 최근: {formatRelativeMtime(status.lastEventAt)}</span>
            )}
          </div>
          {scanResult && (
            <div className="mt-1.5 px-2 py-1 rounded bg-emerald-500/15 text-emerald-100">
              ✅ 즉시 스캔: {scanResult.scanned}개 파일 점검 / 신규 회수 {scanResult.newlyIngested}건
            </div>
          )}
          {recent.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-emerald-200/90 hover:text-white">
                최근 이벤트 {recent.length}건 보기
              </summary>
              <ul className="mt-2 space-y-1 text-[11px] font-mono">
                {recent.slice(0, 8).map((ev, i) => (
                  <li key={i} className="flex items-start gap-2 opacity-90">
                    <span className="shrink-0">
                      {ev.reason === "auto-ingest" ? "✅" : ev.reason === "meta-only" ? "📋" : ev.reason === "skipped" ? "⏭" : "❌"}
                    </span>
                    <span className="break-all">
                      [{ev.project}] {ev.filePath.split(/[/\\]/).pop()}
                      {ev.error && <span className="text-rose-300"> — {ev.error}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : (
        <div className="text-xs text-amber-200/80 leading-relaxed">
          Drive Watcher 비활성화 상태. <code className="bg-amber-500/15 px-1 rounded">ASTON_WIKI_ROOT</code>{" "}
          가 설정되어 있고 <code className="bg-amber-500/15 px-1 rounded">DRIVE_WATCHER_ENABLED</code>{" "}
          가 false 가 아니면 자동 시작됩니다. 서버 재시작 필요.
        </div>
      )}
      <div className="mt-2 text-[11px] text-[var(--aston-muted)] leading-relaxed">
        <b>운영 약속</b>: NotebookLM에서 노트 → "Google Docs로 보내기" 또는 .md/.txt 다운로드 →{" "}
        <code className="bg-white/[0.05] px-1 rounded">{"{Wiki}/notebooklm-exports/{project}/"}</code>{" "}
        폴더에 저장하면 자동 회수.{" "}
        <span className="text-amber-200">.md/.txt 본문 자동 추출, .docx/.pdf/.gdoc 은 메타만 기록 (운영자가 .md 변환 후 재업로드 권장).</span>
      </div>
    </div>
  );
}

function SourceFilesSection({
  selectedNotebook,
  files,
  sourceFolderPath,
  exportFolderPath,
  isLoading,
}: {
  selectedNotebook: TrackAPanelProps["notebooks"][number] | null;
  files: SourceFileItem[];
  sourceFolderPath: string | null;
  exportFolderPath: string | null;
  isLoading: boolean;
}) {
  if (!selectedNotebook) return null;
  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 text-cyan-300" />
          <div className="text-sm font-medium">
            NotebookLM 입력 자료 — <span className="text-cyan-200">{selectedNotebook.display_name}</span>
          </div>
        </div>
        <span className="text-xs text-[var(--aston-muted)]">{files.length}개</span>
      </div>
      {sourceFolderPath && (
        <div className="text-[11px] text-[var(--aston-muted)] font-mono mb-2 break-all">
          📁 소스: {sourceFolderPath}
          {exportFolderPath && (
            <>
              <br />
              📤 회수 대상: {exportFolderPath}
            </>
          )}
        </div>
      )}
      {isLoading ? (
        <div className="text-center py-4 text-[var(--aston-muted)] text-xs">로딩 중…</div>
      ) : files.length === 0 ? (
        <div className="text-center py-4 text-[var(--aston-muted)] text-xs">
          이 노트북 폴더에 소스 자료가 없습니다. 위 경로에 PDF·Docs 를 두면 NotebookLM 입력 + 페이지 인덱스 둘 다 됩니다.
        </div>
      ) : (
        <ul className="space-y-1 mt-2">
          {files.map((f) => (
            <li
              key={f.filename}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5"
            >
              <div className="min-w-0 flex-1 flex items-center gap-2">
                <span className="text-xs">{extensionEmoji(f.extension)}</span>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[var(--aston-text)] truncate">
                    {f.filename}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-[10px] text-[var(--aston-muted)]">
                <span>{formatRelativeMtime(f.mtime)}</span>
                <span>{(f.sizeBytes / 1024).toFixed(1)}KB</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function extensionEmoji(ext: string): string {
  switch (ext) {
    case ".pdf":
      return "📕";
    case ".docx":
    case ".doc":
    case ".gdoc":
      return "📘";
    case ".xlsx":
    case ".xls":
    case ".gsheet":
      return "📗";
    case ".pptx":
    case ".ppt":
    case ".gslides":
      return "📙";
    case ".md":
      return "📝";
    case ".txt":
      return "📄";
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".gif":
    case ".webp":
      return "🖼";
    default:
      return "📎";
  }
}

function formatRelativeMtime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))}분 전`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}시간 전`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}일 전`;
  return d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

function TrackBPanel({
  dataStores,
  isLoading,
  status,
}: {
  dataStores: Array<{ id: string; label: string; projects: string[]; count: number }>;
  isLoading: boolean;
  status?: { configured: boolean; projectId: string | null; location: string; authMode: string };
}) {
  const configured = status?.configured ?? false;
  return (
    <div className="mt-6">
      <div
        className={`rounded-xl border p-4 mb-6 ${
          configured
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-amber-500/30 bg-amber-500/5"
        }`}
      >
        <div
          className={`flex items-center gap-2 text-sm font-medium mb-2 ${
            configured ? "text-emerald-200" : "text-amber-200"
          }`}
        >
          <Cpu className="h-4 w-4" />
          Track B — 내부 GCP Discovery Engine RAG{" "}
          {configured ? "(Phase 2 활성)" : "(Phase 2 — 환경변수 미설정)"}
        </div>
        {configured ? (
          <p className="text-xs text-emerald-200/80 leading-relaxed">
            🟢 GCP 프로젝트 <code className="bg-emerald-500/15 px-1 rounded">{status?.projectId}</code>{" "}
            연결 완료 (location: {status?.location}, 인증: {status?.authMode}).{" "}
            데이터 스토어 9개 매핑이 준비되어 있고,{" "}
            <code className="bg-emerald-500/15 px-1 rounded">rag.queryDataStore</code> 호출이 가능합니다.{" "}
            실제 createDataStore / importDocument 트리거는 Phase 3 (저장 파이프라인) 진행 시 자동화됩니다.
          </p>
        ) : (
          <p className="text-xs text-amber-200/80 leading-relaxed">
            <code className="bg-amber-500/15 px-1 rounded">VERTEX_SEARCH_PROJECT_ID</code>{" "}
            환경변수가 비어 있습니다. .env 에 채우고 서버를 재시작한 뒤,{" "}
            <code className="bg-amber-500/15 px-1 rounded">gcloud auth application-default login</code>{" "}
            (ADC) 인증을 1회 수행하면 즉시 활성화됩니다.
          </p>
        )}
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
