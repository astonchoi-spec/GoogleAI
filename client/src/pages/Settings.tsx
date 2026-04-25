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
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-700 bg-slate-950/50 p-4">
      <div>
        <p className="font-medium text-white">{title}</p>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
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
    <div className="min-h-[calc(100vh-48px)] bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link href="/chat">
            <a className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Chat으로 돌아가기
            </a>
          </Link>
          <Badge className="border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
            User Profile & Settings
          </Badge>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"
        >
          <Card className="border-slate-700 bg-slate-900/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <UserCircle2 className="h-5 w-5 text-cyan-300" />
                프로필
              </CardTitle>
              <CardDescription>현재 로그인 사용자 정보와 계정 상태를 확인합니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/15 text-xl font-bold text-cyan-300">
                  {profileInitials || "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-white">{maskedName}</p>
                  <p className="truncate text-sm text-slate-400">{maskedEmail}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-slate-700 text-slate-300">
                      {user?.role || "user"}
                    </Badge>
                    <Badge variant={isAuthenticated ? "default" : "secondary"}>
                      {isAuthenticated ? "Authenticated" : "Guest"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Login method</p>
                  <p className="mt-1 text-sm text-white">{user?.loginMethod || "password"}</p>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
                  <p className="mt-1 text-sm text-white">{loading ? "Loading..." : "Ready"}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={toggleTheme} className="border-slate-700 bg-slate-950/50 text-white hover:bg-slate-800">
                  {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void logout()}
                  className="border-slate-700 bg-slate-950/50 text-white hover:bg-slate-800"
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-700 bg-slate-900/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Bell className="h-5 w-5 text-amber-300" />
                환경설정
              </CardTitle>
              <CardDescription>토스트, 알림, 채팅 표시 방식을 조정합니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingsRow
                title="새 메시지 알림"
                description="Telegram/Web 새 메시지를 토스트로 표시합니다."
                checked={preferences.notifyNewMessages}
                onCheckedChange={(checked) => updatePreferences({ notifyNewMessages: checked })}
              />
              <SettingsRow
                title="에러 알림"
                description="API 오류와 작업 실패를 토스트로 표시합니다."
                checked={preferences.notifyErrors}
                onCheckedChange={(checked) => updatePreferences({ notifyErrors: checked })}
              />
              <SettingsRow
                title="사운드 피드백"
                description="향후 알림 사운드에 사용됩니다."
                checked={preferences.notifySounds}
                onCheckedChange={(checked) => updatePreferences({ notifySounds: checked })}
              />
              <SettingsRow
                title="컴팩트 채팅"
                description="채팅 영역 패딩을 줄여 더 많은 메시지를 한 화면에 보여줍니다."
                checked={preferences.compactChat}
                onCheckedChange={(checked) => updatePreferences({ compactChat: checked })}
              />
              <SettingsRow
                title="개인정보 보호"
                description="이름과 이메일 일부를 마스킹해 화면 노출을 줄입니다."
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
          className="grid gap-6 lg:grid-cols-2"
        >
          <Card className="border-slate-700 bg-slate-900/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <MessageSquare className="h-5 w-5 text-cyan-300" />
                채팅 동작
              </CardTitle>
              <CardDescription>대화 화면의 표시와 반응 방식을 제어합니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-300">
              <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                <p className="font-medium text-white">현재 설정 반영</p>
                <p className="mt-1 text-slate-400">
                  새 메시지 알림, 오류 토스트, 컴팩트 뷰는 즉시 채팅 화면과 토스트 브리지에 반영됩니다.
                </p>
              </div>
              <Separator className="bg-slate-700" />
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-slate-700 text-slate-300">
                  theme: {theme}
                </Badge>
                <Badge variant="outline" className="border-slate-700 text-slate-300">
                  notifications: {preferences.notifyErrors && preferences.notifyNewMessages ? "on" : "partial"}
                </Badge>
                <Badge variant="outline" className="border-slate-700 text-slate-300">
                  compact: {preferences.compactChat ? "enabled" : "disabled"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-700 bg-slate-900/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <RefreshCcw className="h-5 w-5 text-emerald-300" />
                초기화
              </CardTitle>
              <CardDescription>선호도만 초기화하고 계정 정보는 유지합니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-400">
                테마와 알림 선호도를 초기값으로 되돌립니다. 다음 로그인과 즉시 동작 반영에 사용됩니다.
              </p>
              <Button
                variant="outline"
                onClick={resetPreferences}
                className="border-slate-700 bg-slate-950/50 text-white hover:bg-slate-800"
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
