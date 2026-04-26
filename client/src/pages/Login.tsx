import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Chrome, Shield, Sparkles } from "lucide-react";

export default function Login() {
  const { data: authUrlData, isLoading } = trpc.googleWorkspace.getAuthUrl.useQuery(); // MODIFIED: use the Google OAuth entrypoint instead of the old admin/password login.

  const handleGoogleLogin = () => {
    if (!authUrlData?.authUrl) {
      window.location.href = "/google"; // MODIFIED: keep the user in the Google Workspace area when OAuth is not configured.
      return;
    }

    window.open(authUrlData.authUrl, "_blank", "width=520,height=680"); // MODIFIED: launch the Google OAuth flow directly from the login page.
  };

  return (
    <div className="min-h-screen bg-[var(--aston-bg)] px-4 py-6 text-[var(--aston-text)]">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-2xl border border-[var(--aston-border)] bg-[var(--aston-panel)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.28)] sm:p-8">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                  <Shield className="h-6 w-6" />
                </div>
                <div>
                  <Badge className="border-cyan-500/20 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/10">
                    Google 로그인
                  </Badge>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--aston-text)]">
                    에스턴 워크스테이션
                  </h1>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm leading-6 text-[var(--aston-muted)] sm:text-base">
                  Google 계정으로 로그인해 Gmail, Calendar, Drive, Sheets를 연결합니다.
                  <br />
                  앱 세션은 현재 Google Workspace 연결 상태와 함께 동작합니다.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-[var(--aston-border)] bg-[var(--aston-panel-soft)] p-4">
                    <div className="text-xs text-[var(--aston-muted)]">인증</div>
                    <div className="mt-1 text-sm font-medium">Google OAuth</div>
                  </div>
                  <div className="rounded-xl border border-[var(--aston-border)] bg-[var(--aston-panel-soft)] p-4">
                    <div className="text-xs text-[var(--aston-muted)]">연동</div>
                    <div className="mt-1 text-sm font-medium">Workspace 연결</div>
                  </div>
                  <div className="rounded-xl border border-[var(--aston-border)] bg-[var(--aston-panel-soft)] p-4">
                    <div className="text-xs text-[var(--aston-muted)]">실행</div>
                    <div className="mt-1 text-sm font-medium">Chat / API / Telegram</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--aston-border)] bg-[var(--aston-panel)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.28)] sm:p-8">
            <div className="mb-6 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--aston-muted)]">
                Secure Entry
              </span>
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-[var(--aston-text)]">Google로 로그인</h2>
              <p className="mt-2 text-sm text-[var(--aston-muted)]">
                관리자 아이디/비밀번호 대신 Google 계정 연결을 사용합니다.
              </p>
            </div>

            <Card className="border-white/10 bg-black/10 p-5">
              <div className="flex items-start gap-3">
                <Chrome className="mt-0.5 h-5 w-5 text-cyan-300" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--aston-text)]">Google OAuth 연결</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--aston-muted)]">
                    버튼을 누르면 Google 계정 로그인 창이 열립니다. 연결이 끝나면 워크스페이스 기능을 사용할 수 있습니다.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="mt-5 h-11 w-full rounded-lg bg-cyan-500 font-semibold text-slate-950 hover:bg-cyan-400"
              >
                {isLoading ? "Google 로그인 준비 중..." : "Google 로그인"}
              </Button>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
