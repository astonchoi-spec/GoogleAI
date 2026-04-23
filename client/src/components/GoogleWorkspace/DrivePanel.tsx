import { useState, useRef } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  HardDrive, Search, Loader2, Trash2, Share2, RefreshCw,
  ExternalLink, Upload, FolderPlus, ChevronRight, Home, X, FolderOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

interface BreadcrumbItem { id: string; name: string; }

const FOLDER_MIME = "application/vnd.google-apps.folder";

function mimeIcon(mimeType: string) {
  if (mimeType === FOLDER_MIME) return "📁";
  if (mimeType === "application/vnd.google-apps.document") return "📝";
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "📊";
  if (mimeType === "application/vnd.google-apps.presentation") return "📑";
  if (mimeType === "application/vnd.google-apps.form") return "📋";
  if (mimeType === "application/pdf") return "📄";
  if (mimeType.startsWith("image/")) return "🖼️";
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
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: "root", name: "내 드라이브" }]);
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
      setNewFolderName(""); setShowFolderInput(false); refetch();
    },
    onError: (err) => toast.error(`폴더 생성 실패: ${err.message}`),
  });

  const enterFolder = (id: string, name: string) => {
    setBreadcrumbs(prev => [...prev, { id, name }]);
    setSearchMode(false);
  };

  const goToBreadcrumb = (index: number) => {
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    setSearchMode(false);
  };

  const handleSearch = () => {
    if (!searchInput.trim()) { setSearchMode(false); return; }
    setSearchQuery(searchInput.trim());
    setSearchMode(true);
  };

  const clearSearch = () => {
    setSearchInput(""); setSearchQuery(""); setSearchMode(false);
  };

  const handleShare = (fileId: string, fileName: string) => {
    const email = window.prompt(`"${fileName}" 을 공유할 이메일:`);
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-cyan-400" />
          Google Drive
        </h3>
        <div className="flex flex-wrap gap-1">
          <Button onClick={() => refetch()} variant="ghost" size="sm" className="text-slate-400 hover:text-slate-300 px-2">
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button
            onClick={() => setShowFolderInput(v => !v)}
            variant="ghost" size="sm"
            className="text-slate-400 hover:text-slate-300 px-2"
            title="새 폴더"
          >
            <FolderPlus className="w-4 h-4" />
          </Button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            size="sm"
          className="w-full sm:w-auto bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            {uploadMutation.isPending
              ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
              : <Upload className="w-3 h-3 mr-1" />}
            업로드
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Input
            placeholder="Drive 전체 검색..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="bg-slate-700 border-slate-600 text-white placeholder-slate-500 pr-7"
          />
          {searchMode && (
            <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <Button onClick={handleSearch} size="sm" className="w-full sm:w-auto bg-cyan-600 hover:bg-cyan-700 text-white shrink-0">
          <Search className="w-4 h-4" />
        </Button>
      </div>

      {/* New folder input */}
      <AnimatePresence>
        {showFolderInput && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="새 폴더 이름"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newFolderName.trim() && createFolderMutation.mutate({
                  folderName: newFolderName.trim(),
                  parentFolderId: currentFolder.id === "root" ? undefined : currentFolder.id,
                })}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-500"
                autoFocus
              />
              <Button
                onClick={() => newFolderName.trim() && createFolderMutation.mutate({
                  folderName: newFolderName.trim(),
                  parentFolderId: currentFolder.id === "root" ? undefined : currentFolder.id,
                })}
                disabled={createFolderMutation.isPending || !newFolderName.trim()}
                size="sm" className="w-full sm:w-auto bg-cyan-600 hover:bg-cyan-700 text-white shrink-0"
              >
                {createFolderMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "생성"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Breadcrumbs */}
      {!searchMode && (
        <div className="flex items-center gap-1 text-xs flex-wrap">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3 text-slate-600" />}
              <button
                onClick={() => goToBreadcrumb(i)}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  i === breadcrumbs.length - 1
                    ? "text-white font-medium"
                    : "text-slate-400 hover:text-cyan-400"
                }`}
              >
                {i === 0 ? <span className="flex items-center gap-1"><Home className="w-3 h-3" />{crumb.name}</span> : crumb.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {searchMode && (
        <p className="text-xs text-slate-400">
          "<span className="text-cyan-400">{searchQuery}</span>" 검색 결과
        </p>
      )}

      {/* File list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      ) : !files.length ? (
        <p className="text-slate-500 text-sm text-center py-8">
          {searchMode ? "검색 결과가 없습니다." : "이 폴더는 비어있습니다."}
        </p>
      ) : (
        <div className="space-y-0.5">
          <p className="text-xs text-slate-500 mb-1">{files.length}개 항목</p>
          {(files as any[]).map((file) => {
            const isFolder = file.mimeType === FOLDER_MIME;
            return (
              <motion.div key={file.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div
                  className={`flex items-center gap-2 px-2 py-2 rounded-lg transition-colors group ${
                    isFolder ? "hover:bg-slate-700 cursor-pointer" : "hover:bg-slate-800/80"
                  }`}
                  onClick={() => isFolder && enterFolder(file.id, file.name)}
                >
                  <span className="text-lg shrink-0">{mimeIcon(file.mimeType)}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${isFolder ? "text-white font-medium" : "text-slate-200"}`}>
                      {file.name}
                    </p>
                    {!isFolder && (
                      <p className="text-xs text-slate-500">
                        {formatSize(file.size)}{file.size ? " · " : ""}{new Date(file.modifiedTime).toLocaleDateString("ko-KR")}
                      </p>
                    )}
                    {isFolder && (
                      <p className="text-xs text-slate-500">{new Date(file.modifiedTime).toLocaleDateString("ko-KR")}</p>
                    )}
                  </div>

                  {/* Action buttons - visible on hover */}
                  <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    {file.webViewLink && (
                      <button
                        onClick={() => window.open(file.webViewLink, "_blank")}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-600 transition-colors"
                        title="열기"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!isFolder && (
                      <button
                        onClick={() => handleShare(file.id, file.name)}
                        className="p-1.5 rounded text-slate-400 hover:text-cyan-400 hover:bg-cyan-950/30 transition-colors"
                        title="공유"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (window.confirm(`"${file.name}"을 삭제하시겠습니까?`)) {
                          deleteMutation.mutate({ fileId: file.id });
                        }
                      }}
                      className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {isFolder && <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
