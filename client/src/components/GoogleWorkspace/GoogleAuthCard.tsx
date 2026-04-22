import { toast } from "sonner";
import { motion } from "framer-motion";
import { LogIn, LogOut, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    const timer = setInterval(() => {
      if (popup?.closed) {
        clearInterval(timer);
        refetch();
        toast.success("Google 연결이 완료되었습니다.");
      }
    }, 1000);
  };

  const handleDisconnect = () => revokeMutation.mutate();

  if (isLoading) {
    return (
      <Card className="bg-slate-800 border-slate-700 p-4 flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
        <span className="text-slate-400 text-sm">Google 연결 상태 확인 중...</span>
      </Card>
    );
  }

  if (!isConfigured) {
    return (
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="bg-amber-950/30 border-amber-700/50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-amber-300 font-medium text-sm">Google OAuth 설정 필요</p>
              <p className="text-amber-400/70 text-xs mt-1">
                .env 파일에 다음 항목을 추가하세요:
              </p>
              <pre className="mt-2 text-xs bg-slate-900/60 rounded p-2 text-amber-300 font-mono">
{`GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/webhooks/google/callback`}
              </pre>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-cyan-400 hover:text-cyan-300 underline mt-2 inline-block"
              >
                Google Cloud Console에서 OAuth 앱 만들기 →
              </a>
            </div>
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="bg-slate-800 border-slate-700 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-slate-500" />
          )}
          <div>
            <p className="text-white text-sm font-medium">
              {isAuthenticated ? "Google 계정 연결됨" : "Google 계정 미연결"}
            </p>
            <p className="text-slate-400 text-xs">
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
            className="bg-red-950/30 border-red-700/50 text-red-300 hover:bg-red-900/40"
          >
            {revokeMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <>
                <LogOut className="w-3 h-3 mr-1" />
                연결 해제
              </>
            )}
          </Button>
        ) : (
          <Button
            onClick={handleConnect}
            size="sm"
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            <LogIn className="w-3 h-3 mr-1" />
            Google 연결
          </Button>
        )}
      </Card>
    </motion.div>
  );
}
