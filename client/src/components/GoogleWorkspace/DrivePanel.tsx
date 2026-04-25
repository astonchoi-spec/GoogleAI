import { useState, useRef } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  HardDrive, Search, Loader2, Trash2, Share2, RefreshCw,
  ExternalLink, Upload, FolderPlus, ChevronRight, Home, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

interface BreadcrumbItem { id: string; name: string; }

const FOLDER_MIME = "application/vnd.google-apps.folder";

function mimeIcon(mimeType: string) {
  if (mimeType === FOLDER_MIME) return "📁";
  if (mimeType === "application/vnd.google-apps.document") return "📄";
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "📊";
  if (mimeType === "application/vnd.google-apps.presentation") return "📽️";
  if (mimeType === "application/vnd.google-apps.form") return "📝";
  if (mimeType === "application/pdf") return "📕";
  if (mimeType.startsWith("image/")) return "🖼";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("audio/")) return "🎵";
  return "📄";
}

function formatSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function DrivePanel() {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: "root", name: "Google Drive" }]);
  const [searchMode, setSearchMode] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [showFolderInput, setShowFolderInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFolder = breadcrumbs[breadcrumbs.length - 1];

  const { data: folderData, isLoading: folderLoading, refetch } = trpc.googleWorkspace.drive.listFolder.useQuery(
    { folderId: currentFolder.id, maxResults: 100 },
    { enabled: !searchMode, retry: false }
  );

  const { data: searchData, isLoading: searchLoading } = trpc.googleWorkspace.drive.searchFiles.useQuery(
    { query: `name contains '${searchQuery}' and trashed = false`, maxResults: 50 },
    { enabled: searchMode && searchQuery.length > 0, retry: false }
  );

  const files = searchMode ? (searchData?.files ?? []) : (folderData?.files ?? []);
  const isLoading = searchMode ? searchLoading : folderLoading;

  const deleteMutation = trpc.googleWorkspace.drive.deleteFile.useMutation({
    onSuccess: () => { toast.success("삭제되었습니다."); refetch(); },
    onError: (err) => toast.error(`삭제 실패: ${err.message}`),
  });

  const shareMutation = trpc.googleWorkspace.drive.shareFile.useMutation({
    onSuccess: () => toast.success("공유 링크가 전송되었습니다."),
    onError: (err) => toast.error(`공유 실패: ${err.message}`),
  });

  const uploadMutation = trpc.googleWorkspace.drive.uploadFile.useMutation({
    onSuccess: () => { toast.success("업로드 완료!"); refetch(); },
    onError: (err) => toast.error(`업로드 실패: ${err.message}`),
  });

  const createFolderMutation = trpc.googleWorkspace.drive.createFolder.useMutation({
    onSuccess: () => {
      toast.success(`"${newFolderName}" 폴더 생성 완료`);
      setNewFolderName("");
      setShowFolderInput(false);
      refetch();
    },
    onError: (err) => toast.error(`폴더 생성 실패: ${err.message}`),
  });

  const enterFolder = (id: string, name: string) => {
    setBreadcrumbs((prev) => [...prev, { id, name }]);
    setSearchMode(false);
  };

  const goToBreadcrumb = (index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setSearchMode(false);
  };

  const handleSearch = () => {
    if (!searchInput.trim()) { setSearchMode(false); return; }
    setSearchQuery(searchInput.trim());
    setSearchMode(true);
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    setSearchMode(false);
  };

  const handleShare = (fileId: string, fileName: string) => {
    const email = window.prompt(`"${fileName}"을 공유할 이메일`);
    if (!email) return;
    shareMutation.mutate({ fileId, email, role: "reader" });
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        base64Content: base64,
        parentFolderId: currentFolder.id === "root" ? undefined : currentFolder.id,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-[var(--aston-text)]">
          <HardDrive className="h-4 w-4 text-cyan-400" />
          Google Drive
        </h3>
        <div className="flex gap-1">
          <Button onClick={() => refetch()} variant="ghost" size="sm" className="px-2 text-[var(--aston-muted)] hover:text-[var(--aston-text)]">
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button
            onClick={() => setShowFolderInput((v) => !v)}
            variant="ghost"
            size="sm"
            className="px-2 text-[var(--aston-muted)] hover:text-[var(--aston-text)]"
            title="새 폴더"
          >
            <FolderPlus className="h-4 w-4" />
          </Button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            size="sm"
            className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
          >
            {uploadMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
            업로드
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            placeholder="Drive 검색..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pr-7 border-white/10 bg-black/20 text-[var(--aston-text)] placeholder:text-[var(--aston-muted)]"
          />
          {searchMode && (
            <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--aston-muted)] hover:text-[var(--aston-text)]">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <Button onClick={handleSearch} size="sm" className="shrink-0 bg-cyan-500 text-slate-950 hover:bg-cyan-400">
          <Search className="h-4 w-4" />
        </Button>
      </div>

      <AnimatePresence>
        {showFolderInput && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <div className="flex gap-2">
              <Input
                placeholder="새 폴더 이름"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newFolderName.trim() && createFolderMutation.mutate({
                  folderName: newFolderName.trim(),
                  parentFolderId: currentFolder.id === "root" ? undefined : currentFolder.id,
                })}
                className="border-white/10 bg-black/20 text-[var(--aston-text)] placeholder:text-[var(--aston-muted)]"
                autoFocus
              />
              <Button
                onClick={() => newFolderName.trim() && createFolderMutation.mutate({
                  folderName: newFolderName.trim(),
                  parentFolderId: currentFolder.id === "root" ? undefined : currentFolder.id,
                })}
                disabled={createFolderMutation.isPending || !newFolderName.trim()}
                size="sm"
                className="shrink-0 bg-cyan-500 text-slate-950 hover:bg-cyan-400"
              >
                {createFolderMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "생성"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!searchMode && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-[var(--aston-muted)]" />}
              <button
                onClick={() => goToBreadcrumb(i)}
                className={`rounded px-1.5 py-0.5 transition-colors ${i === breadcrumbs.length - 1 ? "font-medium text-[var(--aston-text)]" : "text-[var(--aston-muted)] hover:text-cyan-300"}`}
              >
                {i === 0 ? <span className="flex items-center gap-1"><Home className="h-3 w-3" />{crumb.name}</span> : crumb.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {searchMode && (
        <p className="text-xs text-[var(--aston-muted)]">
          "<span className="text-cyan-400">{searchQuery}</span>" 검색 결과
        </p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
        </div>
      ) : !files.length ? (
        <p className="py-8 text-center text-sm text-[var(--aston-muted)]">
          {searchMode ? "검색 결과가 없습니다." : "현재 폴더가 비어있습니다."}
        </p>
      ) : (
        <div className="space-y-0.5">
          <p className="mb-1 text-xs text-[var(--aston-muted)]">{files.length}개 항목</p>
          {(files as any[]).map((file) => {
            const isFolder = file.mimeType === FOLDER_MIME;
            return (
              <motion.div key={file.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div
                  className={`group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors ${isFolder ? "cursor-pointer hover:bg-white/5" : "hover:bg-white/5"}`}
                  onClick={() => isFolder && enterFolder(file.id, file.name)}
                >
                  <span className="shrink-0 text-lg">{mimeIcon(file.mimeType)}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${isFolder ? "font-medium text-[var(--aston-text)]" : "text-[var(--aston-text)]"}`}>
                      {file.name}
                    </p>
                    {!isFolder && (
                      <p className="mt-0.5 text-xs text-[var(--aston-muted)]">
                        {formatSize(file.size)}{file.size ? " · " : ""}{new Date(file.modifiedTime).toLocaleDateString("ko-KR")}
                      </p>
                    )}
                    {isFolder && (
                      <p className="text-xs text-[var(--aston-muted)]">{new Date(file.modifiedTime).toLocaleDateString("ko-KR")}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                    {file.webViewLink && (
                      <button onClick={() => window.open(file.webViewLink, "_blank")} className="rounded p-1.5 text-[var(--aston-muted)] transition-colors hover:bg-white/5 hover:text-[var(--aston-text)]" title="열기">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {!isFolder && (
                      <button onClick={() => handleShare(file.id, file.name)} className="rounded p-1.5 text-[var(--aston-muted)] transition-colors hover:bg-cyan-500/10 hover:text-cyan-300" title="공유">
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (window.confirm(`"${file.name}"를 삭제하시겠습니까?`)) {
                          deleteMutation.mutate({ fileId: file.id });
                        }
                      }}
                      className="rounded p-1.5 text-[var(--aston-muted)] transition-colors hover:bg-red-500/10 hover:text-red-400"
                      title="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {isFolder && <ChevronRight className="shrink-0 text-[var(--aston-muted)]" />}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
