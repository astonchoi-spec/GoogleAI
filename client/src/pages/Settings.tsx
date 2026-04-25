import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Bell, Moon, Sun, MessageSquare, ShieldCheck, UserCircle2, RefreshCcw } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { useAppPreferences } from "@/hooks/useAppPreferences";

function SettingsRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-black/15 p-4">
      <div>
        <p className="font-medium text-[var(--aston-text)]">{title}</p>
        <p className="mt-1 text-sm text-[var(--aston-muted)]">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export default function Settings() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { preferences, updatePreferences, resetPreferences } = useAppPreferences();

  const profileInitials = useMemo(() => {
    const source = user?.name || user?.email || "User";
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }, [user]);

  const maskedName = preferences.privacyMode ? "Private User" : user?.name || "Unnamed User";
  const maskedEmail = preferences.privacyMode
    ? user?.email
      ? user.email.replace(/(.{2}).+(@.+)/, "$1***$2")
      : "Hidden"
    : user?.email || "No email linked";

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        {/* MODIFIED: stack the page header on small screens to avoid clipping the badge. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/chat">
            <a className="inline-flex items-center gap-2 text-sm text-[var(--aston-muted)] transition hover:text-[var(--aston-text)]">
              <ArrowLeft className="h-4 w-4" />
              채팅으로 돌아가기
            </a>
          </Link>
          <Badge className="self-start border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
            User Profile & Settings
          </Badge>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]"
        >
          <Card className="border-white/10 bg-[var(--aston-panel)] text-[var(--aston-text)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCircle2 className="h-5 w-5 text-cyan-300" />
                프로필
              </CardTitle>
              <CardDescription className="text-[var(--aston-muted)]">
                현재 로그인 사용자와 계정 상태를 확인합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/15 p-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/15 text-xl font-bold text-cyan-300">
                  {profileInitials || "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-[var(--aston-text)]">{maskedName}</p>
                  <p className="truncate text-sm text-[var(--aston-muted)]">{maskedEmail}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-white/10 text-[var(--aston-muted)]">
                      {user?.role || "user"}
                    </Badge>
                    <Badge variant={isAuthenticated ? "default" : "secondary"}>
                      {isAuthenticated ? "Authenticated" : "Guest"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/15 p-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--aston-muted)]">Login method</p>
                  <p className="mt-1 text-sm text-[var(--aston-text)]">{user?.loginMethod || "password"}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/15 p-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--aston-muted)]">Status</p>
                  <p className="mt-1 text-sm text-[var(--aston-text)]">{loading ? "Loading..." : "Ready"}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={toggleTheme}
                  className="border-white/10 bg-white/5 text-[var(--aston-text)] hover:bg-white/10"
                >
                  {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                  {theme === "dark" ? "라이트 모드" : "다크 모드"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void logout()}
                  className="border-white/10 bg-white/5 text-[var(--aston-text)] hover:bg-white/10"
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  로그아웃
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[var(--aston-panel)] text-[var(--aston-text)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-amber-300" />
                알림 설정
              </CardTitle>
              <CardDescription className="text-[var(--aston-muted)]">
                시스템 알림, 채팅 표시 방식, 개인 정보 보호를 제어합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingsRow
                title="새 메시지 알림"
                description="Telegram/Web 새 메시지를 즉시 표시합니다."
                checked={preferences.notifyNewMessages}
                onCheckedChange={(checked) => updatePreferences({ notifyNewMessages: checked })}
              />
              <SettingsRow
                title="에러 알림"
                description="API 오류나 작업 실패를 즉시 표시합니다."
                checked={preferences.notifyErrors}
                onCheckedChange={(checked) => updatePreferences({ notifyErrors: checked })}
              />
              <SettingsRow
                title="사운드 알림"
                description="알림 발생 시 소리를 재생합니다."
                checked={preferences.notifySounds}
                onCheckedChange={(checked) => updatePreferences({ notifySounds: checked })}
              />
              <SettingsRow
                title="컴팩트 채팅"
                description="채팅 영역을 더 촘촘하게 보여줍니다."
                checked={preferences.compactChat}
                onCheckedChange={(checked) => updatePreferences({ compactChat: checked })}
              />
              <SettingsRow
                title="개인정보 보호"
                description="이름과 이메일을 마스킹해서 표시합니다."
                checked={preferences.privacyMode}
                onCheckedChange={(checked) => updatePreferences({ privacyMode: checked })}
              />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="grid gap-5 lg:grid-cols-2"
        >
          <Card className="border-white/10 bg-[var(--aston-panel)] text-[var(--aston-text)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-cyan-300" />
                채팅 동작
              </CardTitle>
              <CardDescription className="text-[var(--aston-muted)]">
                대화 화면의 표시 및 반응 방식을 제어합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-[var(--aston-muted)]">
              <div className="rounded-xl border border-white/10 bg-black/15 p-4">
                <p className="font-medium text-[var(--aston-text)]">현재 설정 반영</p>
                <p className="mt-1">
                  새 메시지 알림, 에러 알림, 컴팩트 모드는 즉시 채팅 화면과 시스템 브리지에 반영됩니다.
                </p>
              </div>
              <Separator className="bg-white/10" />
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-white/10 text-[var(--aston-muted)]">
                  theme: {theme}
                </Badge>
                <Badge variant="outline" className="border-white/10 text-[var(--aston-muted)]">
                  notifications: {preferences.notifyErrors && preferences.notifyNewMessages ? "on" : "partial"}
                </Badge>
                <Badge variant="outline" className="border-white/10 text-[var(--aston-muted)]">
                  compact: {preferences.compactChat ? "enabled" : "disabled"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[var(--aston-panel)] text-[var(--aston-text)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCcw className="h-5 w-5 text-emerald-300" />
                설정 초기화
              </CardTitle>
              <CardDescription className="text-[var(--aston-muted)]">
                현재 사용자 설정만 초기값으로 되돌립니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-[var(--aston-muted)]">
                테마와 알림은 필요 시 다시 변경할 수 있습니다. 이 작업은 서버 데이터나 계정 상태를 건드리지 않습니다.
              </p>
              <Button
                variant="outline"
                onClick={resetPreferences}
                className="border-white/10 bg-white/5 text-[var(--aston-text)] hover:bg-white/10"
              >
                설정 초기화
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
