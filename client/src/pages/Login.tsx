import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Shield, Sparkles } from "lucide-react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      const returnTo = new URLSearchParams(window.location.search).get("from") || "/";
      window.location.href = returnTo;
    },
    onError: (err) => {
      setError(err.message || "로그인에 실패했습니다.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ username, password });
  };

  return (
    // MODIFIED: align the access-control screen with the Aston command-center visual system.
    <div className="min-h-screen bg-[var(--aston-bg)] px-4 py-6 text-[var(--aston-text)]">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-[var(--aston-border)] bg-[var(--aston-panel)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.28)] sm:p-8">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                  <Shield className="h-6 w-6" />
                </div>
                <div>
                  <Badge className="border-cyan-500/20 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/10">
                    Access Control
                  </Badge>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--aston-text)]">
                    에스턴 워크스테이션
                  </h1>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm leading-6 text-[var(--aston-muted)] sm:text-base">
                  회장님 전용 실행형 커맨드센터에 로그인합니다.
                  <br />
                  Google Workspace, Telegram, AI 채팅, 트레이딩, 부동산 PF를 한 화면에서 운영합니다.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-[var(--aston-border)] bg-[var(--aston-panel-soft)] p-4">
                    <div className="text-xs text-[var(--aston-muted)]">보안</div>
                    <div className="mt-1 text-sm font-medium">세션 분리</div>
                  </div>
                  <div className="rounded-xl border border-[var(--aston-border)] bg-[var(--aston-panel-soft)] p-4">
                    <div className="text-xs text-[var(--aston-muted)]">연동</div>
                    <div className="mt-1 text-sm font-medium">Google / Telegram</div>
                  </div>
                  <div className="rounded-xl border border-[var(--aston-border)] bg-[var(--aston-panel-soft)] p-4">
                    <div className="text-xs text-[var(--aston-muted)]">운영</div>
                    <div className="mt-1 text-sm font-medium">AI 실행 본부</div>
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
              <h2 className="text-2xl font-semibold text-[var(--aston-text)]">로그인</h2>
              <p className="mt-2 text-sm text-[var(--aston-muted)]">
                관리자 계정으로 워크스테이션에 접속합니다.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--aston-text)]">아이디</label>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  className="h-11 border-[var(--aston-border)] bg-black/20 text-[var(--aston-text)] placeholder:text-[var(--aston-muted)] focus-visible:border-cyan-500/40 focus-visible:ring-cyan-500/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--aston-text)]">비밀번호</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="admin123"
                  autoComplete="current-password"
                  className="h-11 border-[var(--aston-border)] bg-black/20 text-[var(--aston-text)] placeholder:text-[var(--aston-muted)] focus-visible:border-cyan-500/40 focus-visible:ring-cyan-500/20"
                />
              </div>

              {error && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="h-11 w-full rounded-lg bg-cyan-500 font-semibold text-slate-950 hover:bg-cyan-400"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "로그인 중..." : "로그인"}
              </Button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
