import { toast } from "sonner";
import { motion } from "framer-motion";
import { LogIn, LogOut, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { watchPopupClose } from "@/lib/popupMonitor";
import { trpc } from "@/lib/trpc";

export default function GoogleAuthCard() {
  const { data: authStatus, isLoading, refetch } = trpc.googleWorkspace.isAuthenticated.useQuery();
  const { data: authUrlData } = trpc.googleWorkspace.getAuthUrl.useQuery();
  const revokeMutation = trpc.googleWorkspace.revokeAuth.useMutation({
    onSuccess: () => {
      toast.success("Google 연결이 해제되었습니다.");
      refetch();
    },
    onError: (err) => toast.error(`연결 해제 실패: ${err.message}`),
  });

  const isConfigured = !!authUrlData?.authUrl;
  const isAuthenticated = authStatus?.authenticated;

  const handleConnect = () => {
    if (!authUrlData?.authUrl) return;
    const popup = window.open(authUrlData.authUrl, "_blank", "width=500,height=600");
    watchPopupClose(popup, () => {
      refetch();
      toast.success("Google 연결이 완료되었습니다.");
    });
  };

  const handleDisconnect = () => revokeMutation.mutate();

  if (isLoading) {
    return (
      <Card className="flex items-center gap-3 border-white/10 bg-[var(--aston-panel)] p-4">
        <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
        <span className="text-sm text-[var(--aston-muted)]">Google 연결 상태 확인 중...</span>
      </Card>
    );
  }

  if (!isConfigured) {
    return (
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-amber-500/20 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-300">Google OAuth 설정 필요</p>
              <p className="mt-1 text-xs text-amber-300/70">
                .env 파일에 아래 항목을 추가하세요.
              </p>
              <pre className="mt-2 rounded bg-black/15 p-2 font-mono text-xs text-amber-300">
{`GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/webhooks/google/callback`}
              </pre>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-cyan-400 underline hover:text-cyan-300"
              >
                Google Cloud Console에서 OAuth 클라이언트 만들기
              </a>
            </div>
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
      {/* MODIFIED: allow the auth row to wrap on narrow screens instead of clipping actions. */}
      <Card className="flex flex-col gap-4 border-white/10 bg-[var(--aston-panel)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {isAuthenticated ? (
            <CheckCircle2 className="h-5 w-5 text-green-400" />
          ) : (
            <div className="h-5 w-5 rounded-full border-2 border-slate-500" />
          )}
          <div>
            <p className="text-sm font-medium text-[var(--aston-text)]">
              {isAuthenticated ? "Google 계정 연결됨" : "Google 계정 미연결"}
            </p>
            <p className="text-xs text-[var(--aston-muted)]">
              {isAuthenticated
                ? "Gmail, Calendar, Drive, Sheets 사용 가능"
                : "연결하면 Google Workspace 서비스를 사용할 수 있습니다"}
            </p>
          </div>
        </div>
        {isAuthenticated ? (
          <Button
            onClick={handleDisconnect}
            disabled={revokeMutation.isPending}
            variant="outline"
            size="sm"
            className="border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20"
          >
            {revokeMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <LogOut className="mr-1 h-3 w-3" />
                연결 해제
              </>
            )}
          </Button>
        ) : (
          <Button
            onClick={handleConnect}
            size="sm"
            className="self-start bg-cyan-500 text-slate-950 hover:bg-cyan-400 sm:self-auto"
          >
            <LogIn className="mr-1 h-3 w-3" />
            Google 연결
          </Button>
        )}
      </Card>
    </motion.div>
  );
}
