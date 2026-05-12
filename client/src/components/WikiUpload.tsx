// Step 1.5 — /wiki 페이지 업로드 모달.
// drag-drop + 파일 선택 → project 드롭다운 + 옵션 → POST /api/wiki/upload (base64 JSON).
// 업로드 성공 시 Drive Watcher 가 5초 내 자동 회수 → RAG 인용 가능.

import { useState, useCallback, useEffect, type ChangeEvent, type DragEvent } from "react";
import { Upload, X, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".md", ".txt", ".png", ".jpg", ".jpeg"];
const MAX_DECODED_BYTES = 35 * 1024 * 1024;

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "success"; message: string; savedPath: string }
  | { kind: "error"; message: string };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader 결과가 string 이 아님"));
        return;
      }
      // data URL prefix 제거 — 서버도 prefix 허용하지만 페이로드 절약.
      resolve(result.replace(/^data:[^;]+;base64,/, ""));
    };
    reader.onerror = () => reject(reader.error ?? new Error("파일 읽기 실패"));
    reader.readAsDataURL(file);
  });
}

function getExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i < 0 ? "" : filename.slice(i).toLowerCase();
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function WikiUpload() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [project, setProject] = useState<string>("");
  const [tags, setTags] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const projectsQuery = trpc.rag.listUploadProjects.useQuery(undefined, {
    enabled: open,
  });

  // 모달 열릴 때 첫 yaml project 기본 선택.
  useEffect(() => {
    if (open && !project && projectsQuery.data?.projects.length) {
      setProject(projectsQuery.data.projects[0].project);
    }
  }, [open, project, projectsQuery.data]);

  const handleFile = useCallback((f: File | null) => {
    setStatus({ kind: "idle" });
    if (!f) {
      setFile(null);
      return;
    }
    const ext = getExtension(f.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setStatus({
        kind: "error",
        message: `허용되지 않은 확장자: ${ext || "(없음)"} (허용: ${ALLOWED_EXTENSIONS.join(", ")})`,
      });
      setFile(null);
      return;
    }
    if (f.size > MAX_DECODED_BYTES) {
      setStatus({
        kind: "error",
        message: `파일 크기 초과: ${formatBytes(f.size)} (최대 ${formatBytes(MAX_DECODED_BYTES)})`,
      });
      setFile(null);
      return;
    }
    setFile(f);
  }, []);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    handleFile(f);
  };

  const reset = () => {
    setFile(null);
    setTags("");
    setStatus({ kind: "idle" });
  };

  const handleUpload = async () => {
    if (!file || !project) return;
    setStatus({ kind: "uploading", progress: 0 });
    try {
      const base64 = await fileToBase64(file);
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      // XMLHttpRequest 로 업로드 진행률 추적 (fetch 는 진행률 미지원).
      const result = await new Promise<{ ok: boolean; savedPath?: string; error?: string; message?: string; filename?: string }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/wiki/upload");
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) {
              setStatus({ kind: "uploading", progress: Math.round((ev.loaded / ev.total) * 100) });
            }
          };
          xhr.onload = () => {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data);
            } catch (e) {
              reject(new Error("서버 응답 파싱 실패"));
            }
          };
          xhr.onerror = () => reject(new Error("네트워크 오류"));
          xhr.send(
            JSON.stringify({
              project,
              filename: file.name,
              base64,
              contentType: file.type,
              tags: tagList,
            }),
          );
        },
      );

      if (!result.ok) {
        setStatus({ kind: "error", message: result.error ?? "업로드 실패" });
        return;
      }
      setStatus({
        kind: "success",
        message: result.message ?? "업로드 완료",
        savedPath: result.savedPath ?? "",
      });
      setFile(null);
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 hover:border-cyan-400/50 hover:bg-cyan-500/15 transition"
      >
        <Upload className="h-3.5 w-3.5" />
        Wiki 자료 업로드
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            setOpen(false);
            reset();
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-[var(--aston-bg)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--aston-text)]">Wiki 자료 업로드</h2>
                <p className="mt-1 text-xs text-[var(--aston-muted)]">
                  PDF / DOCX / MD / TXT / 이미지 — Drive Watcher 가 5초 내 자동 회수
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="rounded-lg p-1 text-[var(--aston-muted)] hover:bg-white/5 hover:text-[var(--aston-text)] transition"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mb-3 block text-xs text-[var(--aston-muted)]">
              프로젝트
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
                disabled={projectsQuery.isLoading}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-[var(--aston-text)] focus:border-cyan-500/40 focus:outline-none"
              >
                {projectsQuery.data?.projects.map((p) => (
                  <option key={p.project} value={p.project} className="bg-[var(--aston-bg)]">
                    {p.displayName} {p.isSpecial ? "" : `· ${p.project}`}
                  </option>
                ))}
              </select>
            </label>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`mb-3 rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
                dragOver
                  ? "border-cyan-400/60 bg-cyan-500/5"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm text-[var(--aston-text)]">
                  <FileText className="h-4 w-4 text-cyan-300" />
                  <span className="truncate max-w-xs">{file.name}</span>
                  <span className="text-xs text-[var(--aston-muted)]">({formatBytes(file.size)})</span>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="ml-2 rounded p-0.5 text-[var(--aston-muted)] hover:bg-white/5 hover:text-rose-300"
                    aria-label="파일 제거"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="mx-auto mb-2 h-6 w-6 text-[var(--aston-muted)]" />
                  <p className="text-xs text-[var(--aston-muted)]">
                    드래그&드롭 또는{" "}
                    <label className="cursor-pointer text-cyan-300 hover:text-cyan-200 underline">
                      파일 선택
                      <input
                        type="file"
                        accept={ALLOWED_EXTENSIONS.join(",")}
                        onChange={handleFileInput}
                        className="hidden"
                      />
                    </label>
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--aston-muted)]">
                    최대 {formatBytes(MAX_DECODED_BYTES)} · {ALLOWED_EXTENSIONS.join(" / ")}
                  </p>
                </>
              )}
            </div>

            <label className="mb-3 block text-xs text-[var(--aston-muted)]">
              태그 (선택, 쉼표 구분)
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="예: 한남, 사업수지, 2026Q2"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-[var(--aston-text)] placeholder:text-[var(--aston-muted)] focus:border-cyan-500/40 focus:outline-none"
              />
            </label>

            {status.kind === "error" && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{status.message}</span>
              </div>
            )}

            {status.kind === "success" && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div>{status.message}</div>
                  {status.savedPath && (
                    <div className="mt-0.5 font-mono text-[10px] text-[var(--aston-muted)] break-all">
                      {status.savedPath}
                    </div>
                  )}
                </div>
              </div>
            )}

            {status.kind === "uploading" && (
              <div className="mb-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full bg-cyan-400 transition-all"
                    style={{ width: `${status.progress}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-[var(--aston-muted)]">업로드 중... {status.progress}%</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-[var(--aston-muted)] hover:bg-white/5 transition"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || !project || status.kind === "uploading"}
                className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-300 hover:border-cyan-400/50 hover:bg-cyan-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {status.kind === "uploading" ? "업로드 중..." : "업로드"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
