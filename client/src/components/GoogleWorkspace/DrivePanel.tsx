import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { HardDrive, Search, Loader2, Trash2, Share2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function DrivePanel() {
  const [query, setQuery] = useState("trashed = false");
  const [searchInput, setSearchInput] = useState("");

  const { data, isLoading, refetch } = trpc.googleWorkspace.drive.searchFiles.useQuery({
    query,
    maxResults: 20,
  });

  const deleteMutation = trpc.googleWorkspace.drive.deleteFile.useMutation({
    onSuccess: () => { toast.success("파일이 삭제되었습니다."); refetch(); },
    onError: (err) => toast.error(`삭제 실패: ${err.message}`),
  });

  const shareMutation = trpc.googleWorkspace.drive.shareFile.useMutation({
    onSuccess: () => toast.success("파일이 공유되었습니다."),
    onError: (err) => toast.error(`공유 실패: ${err.message}`),
  });

  const handleSearch = () => setQuery(searchInput.trim() || "trashed = false");

  const handleShare = (fileId: string, fileName: string) => {
    const email = window.prompt(`"${fileName}" 파일을 공유할 이메일을 입력하세요:`);
    if (!email) return;
    shareMutation.mutate({ fileId, email, role: "reader" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-cyan-400" />
          Google Drive
        </h3>
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="text-slate-400 hover:text-slate-300">
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="파일 검색..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="bg-slate-700 border-slate-600 text-white placeholder-slate-500"
        />
        <Button onClick={handleSearch} size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0">
          <Search className="w-4 h-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      ) : !data?.files?.length ? (
        <p className="text-slate-500 text-sm text-center py-8">
          파일이 없거나 Google 계정이 연결되지 않았습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {data.files.map((file: any) => (
            <motion.div key={file.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
              <Card className="bg-slate-800 border-slate-700 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{file.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {file.mimeType?.split(".").pop() ?? file.mimeType}
                      {file.size ? ` · ${Math.round(Number(file.size) / 1024)}KB` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      onClick={() => handleShare(file.id, file.name)}
                      disabled={shareMutation.isPending}
                      variant="ghost"
                      size="sm"
                      className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/30"
                    >
                      <Share2 className="w-3 h-3" />
                    </Button>
                    <Button
                      onClick={() => deleteMutation.mutate({ fileId: file.id })}
                      disabled={deleteMutation.isPending}
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
