import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarDays,
  LayoutGrid,
  Mail,
  MessageCircle,
  ShieldAlert,
  Sparkles,
  Smartphone,
  TrendingUp,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import WorkspaceWidgets from "@/components/home/WorkspaceWidgets";
import { buildQuickCommandPath, HOME_QUICK_COMMANDS } from "@/chat/quickCommand";
import { trpc } from "@/lib/trpc";

type KPIConfig = {
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  key: "trading" | "alert" | "telegram" | "gmail" | "calendar" | "pf";
};

const modules = [
  {
    href: "/chat",
    label: "AI 채팅",
    description: "자연어 지시, Telegram 연동, 작업 실행",
    icon: MessageCircle,
  },
  {
    href: "/trading",
    label: "트레이딩",
    description: "포지션, 알림, 시장 흐름 확인",
    icon: TrendingUp,
  },
  {
    href: "/real-estate-pf",
    label: "부동산 PF",
    description: "딜 파이프라인과 사업성 분석",
    icon: Building2,
  },
  {
    href: "/google",
    label: "Google Workspace",
    description: "Gmail, Calendar, Drive, Sheets",
    icon: LayoutGrid,
  },
  {
    href: "/monitoring",
    label: "모니터링",
    description: "상태, 사용량, 시스템 알림",
    icon: Activity,
  },
  {
    href: "/settings",
    label: "설정",
    description: "테마, 알림, 개인정보 보호",
    icon: Sparkles,
  },
];

function formatRelativeTime(timestamp: number | string | Date): string {
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 0) return "방금 전";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

function KPICard({ config, navigate }: { config: KPIConfig & { value: string }; navigate: (path: string) => void }) {
  const Icon = config.icon;
  const isLoading = config.value === "...";
  const isError = config.value === "연결 실패" || config.value === "연결 필요";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      onClick={() => navigate(config.href)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate(config.href);
        }
      }}
      className={`cursor-pointer rounded-2xl border p-4 transition hover:bg-white/5 ${
        isError
          ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50"
          : "border-white/10 bg-[var(--aston-panel)] hover:border-cyan-500/30"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-[var(--aston-muted)]">{config.label}</div>
          <div className={`mt-2 text-3xl font-semibold tracking-tight ${
            isLoading ? "animate-pulse text-[var(--aston-muted)]"
            : isError ? "text-amber-400"
            : "text-[var(--aston-text)]"
          }`}>
            {config.value}
          </div>
          <div className="mt-1 text-xs text-[var(--aston-muted)]">{config.hint}</div>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl border bg-white/5 ${
          isError ? "border-amber-500/20 text-amber-400" : "border-white/10 text-cyan-300"
        }`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  );
}

export default function Home() {
  const [, navigate] = useLocation();
  const [command, setCommand] = useState("");

  const trimmedCommand = useMemo(() => command.trim(), [command]);

  // Trading: Upbit KRW balance
  const { data: upbitBalance, isLoading: loadingUpbit, isError: errorUpbit } = trpc.trading.getBalance.useQuery(
    { exchange: "upbit" },
    { retry: 1 }
  );

  // Alerts: TradingView webhook history (today count)
  const { data: alerts, isLoading: loadingAlerts, isError: errorAlerts } = trpc.alerts.tvWebhookHistory.useQuery(
    { limit: 100 },
    { retry: 1 }
  );

  // Telegram status
  const { data: telegramStatus, isLoading: loadingTelegram, isError: errorTelegram } = trpc.telegram.getStatus.useQuery(undefined, {
    retry: 1,
  });

  // Gmail: Today's emails (newer_than:1d filter)
  const { data: gmailData, isLoading: loadingGmail, isError: errorGmail } = trpc.googleWorkspace.gmail.getEmails.useQuery(
    { maxResults: 100, query: "newer_than:1d" },
    { retry: 1 }
  );

  // Calendar: Today's events (KST 00:00 ~ 24:00)
  const { data: calendarData, isLoading: loadingCalendar, isError: errorCalendar } = trpc.googleWorkspace.calendar.getTodayEvents.useQuery(
    undefined,
    { retry: 1 }
  );

  // Real Estate: Get deals
  const { data: dealsData, isLoading: loadingDeals, isError: errorDeals } = trpc.realestate.getDeals.useQuery(undefined, {
    retry: 1,
  });

  // Compute KPI values
  const tradingValue = useMemo(() => {
    if (loadingUpbit) return "...";
    if (errorUpbit) return "연결 필요";

    try {
      const krw = upbitBalance?.total?.KRW ?? 0;
      if (krw === 0) return "₩0";
      if (krw < 10000) return `₩${Math.floor(krw).toLocaleString("ko-KR")}`;
      if (krw < 100000000) return `₩${(krw / 10000).toFixed(1)}만`;
      return `₩${(krw / 100000000).toFixed(2)}억`;
    } catch {
      return "연결 실패";
    }
  }, [upbitBalance, loadingUpbit, errorUpbit]);

  const alertValue = useMemo(() => {
    if (loadingAlerts) return "...";
    if (errorAlerts) return "연결 실패";

    try {
      if (!alerts || !Array.isArray(alerts)) return "0";

      const today = new Date().toDateString();
      const todayAlerts = alerts.filter((a: any) => {
        if (!a.timestamp) return false;
        const alertDate = new Date(a.timestamp).toDateString();
        return alertDate === today;
      });

      return todayAlerts.length.toString();
    } catch {
      return "연결 실패";
    }
  }, [alerts, loadingAlerts, errorAlerts]);

  const telegramValue = useMemo(() => {
    if (loadingTelegram) return "...";
    if (errorTelegram) return "연결 필요";

    try {
      if (!telegramStatus) return "오프";
      if (telegramStatus.status === "no_token") return "토큰 없음";
      if (telegramStatus.status === "token_set") return "초기화 중";
      if (telegramStatus.status === "active") return "활성";
      return "오프";
    } catch {
      return "연결 실패";
    }
  }, [telegramStatus, loadingTelegram, errorTelegram]);

  const telegramHint = useMemo(() => {
    if (!telegramStatus || telegramStatus.status !== "active") return "Telegram";
    const mode = telegramStatus.mode;
    if (mode === "webhook") return "webhook 모드";
    if (mode === "polling") return "polling 모드";
    return "Telegram";
  }, [telegramStatus]);

  const gmailValue = useMemo(() => {
    if (loadingGmail) return "...";
    if (errorGmail) return "연결 실패";

    try {
      if (!gmailData?.emails || !Array.isArray(gmailData.emails)) return "0";
      return gmailData.emails.length.toString();
    } catch {
      return "연결 실패";
    }
  }, [gmailData, loadingGmail, errorGmail]);

  const calendarValue = useMemo(() => {
    if (loadingCalendar) return "...";
    if (errorCalendar) return "연결 실패";

    try {
      if (!calendarData?.events || !Array.isArray(calendarData.events)) return "0";
      return calendarData.events.length.toString();
    } catch {
      return "연결 실패";
    }
  }, [calendarData, loadingCalendar, errorCalendar]);

  const pfValue = useMemo(() => {
    if (loadingDeals) return "...";
    // TODO: Implement deal pipeline when Google Sheets integration is ready
    if (errorDeals) return "0";

    try {
      if (!Array.isArray(dealsData)) return "0";
      return dealsData.length.toString();
    } catch {
      return "0";
    }
  }, [dealsData, loadingDeals, errorDeals]);

  const kpiConfigs: KPIConfig[] = [
    { label: "오늘 일정", hint: "Calendar", icon: CalendarDays, href: "/google?tab=calendar", key: "calendar" },
    { label: "받은 메일", hint: "Gmail", icon: Mail, href: "/google?tab=gmail", key: "gmail" },
    { label: "Telegram 상태", hint: telegramHint, icon: Smartphone, href: "/chat?source=telegram", key: "telegram" },
    { label: "총 자산 (Upbit)", hint: "Trading", icon: TrendingUp, href: "/trading", key: "trading" },
    { label: "PF 딜", hint: "Real Estate", icon: Building2, href: "/real-estate-pf", key: "pf" },
    { label: "오늘 알림", hint: "Monitoring", icon: ShieldAlert, href: "/monitoring", key: "alert" },
  ];

  const kpis = useMemo(() => {
    return kpiConfigs.map((config) => {
      let value = "...";

      switch (config.key) {
        case "trading":
          value = tradingValue;
          break;
        case "alert":
          value = alertValue;
          break;
        case "telegram":
          value = telegramValue;
          break;
        case "gmail":
          value = gmailValue;
          break;
        case "calendar":
          value = calendarValue;
          break;
        case "pf":
          value = pfValue;
          break;
      }

      return { ...config, value };
    });
  }, [tradingValue, alertValue, telegramValue, gmailValue, calendarValue, pfValue]);

  // 실제 데이터 기반 최근 활동 — KPI에 이미 로드된 query 결과를 재사용
  const activities = useMemo(() => {
    const items: Array<{ label: string; detail: string; time: string; href: string; sortKey: number }> = [];

    // 오늘 일정 — 가장 가까운 미래 일정
    if (Array.isArray(calendarData?.events) && calendarData.events.length > 0) {
      const sorted = [...calendarData.events].sort((a: any, b: any) => {
        const ta = new Date(a.startTime || a.start?.dateTime || a.start?.date || 0).getTime();
        const tb = new Date(b.startTime || b.start?.dateTime || b.start?.date || 0).getTime();
        return ta - tb;
      });
      const next = sorted[0] as any;
      const startMs = new Date(next.startTime || next.start?.dateTime || next.start?.date || 0).getTime();
      items.push({
        label: "Google 일정",
        detail: `다음 일정: ${next.title || next.summary || "(제목 없음)"}`,
        time: formatRelativeTime(startMs),
        href: "/google?tab=calendar",
        sortKey: startMs || Date.now(),
      });
    }

    // 받은 메일 — 가장 최근 메일
    if (Array.isArray(gmailData?.emails) && gmailData.emails.length > 0) {
      const recent = gmailData.emails[0] as any;
      const ts = recent.date ? new Date(recent.date).getTime() : Date.now();
      items.push({
        label: "Gmail 수신",
        detail: `${recent.subject || "(제목 없음)"} — ${recent.from || ""}`.slice(0, 80),
        time: formatRelativeTime(ts),
        href: "/google?tab=gmail",
        sortKey: ts,
      });
    }

    // 트레이딩 알림 — 가장 최근 webhook
    if (Array.isArray(alerts) && alerts.length > 0) {
      const latest = alerts[0] as any;
      const ts = latest.timestamp ? new Date(latest.timestamp).getTime() : Date.now();
      items.push({
        label: "트레이딩 알림",
        detail: latest.symbol ? `${latest.symbol} ${latest.action || ""} 신호` : "TradingView 알림 수신",
        time: formatRelativeTime(ts),
        href: "/trading",
        sortKey: ts,
      });
    }

    // PF 딜 — 가장 최근 변경된 딜
    if (Array.isArray(dealsData) && dealsData.length > 0) {
      const sorted = [...(dealsData as any[])].sort((a, b) => {
        const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return tb - ta;
      });
      const latest = sorted[0];
      const ts = new Date(latest.updatedAt || latest.createdAt || 0).getTime() || Date.now();
      items.push({
        label: "PF 딜 변경",
        detail: `${latest.name || "딜"} 갱신`,
        time: formatRelativeTime(ts),
        href: "/real-estate-pf",
        sortKey: ts,
      });
    }

    // Telegram 상태
    if (telegramStatus) {
      items.push({
        label: "Telegram",
        detail: telegramStatus.status === "active" ? "봇 활성 상태" : "봇 오프라인",
        time: "현재",
        href: "/chat?source=telegram",
        sortKey: Date.now() - 1, // 항상 하단에 가까이 배치
      });
    }

    // 폴백: 데이터가 하나도 없을 때
    if (items.length === 0) {
      return [{ label: "시스템 상태", detail: "최근 활동을 불러오는 중입니다.", time: "현재", href: "/monitoring", sortKey: 0 }];
    }

    // 시간 역순 정렬, 최대 6건
    return items.sort((a, b) => b.sortKey - a.sortKey).slice(0, 6);
  }, [calendarData, gmailData, alerts, dealsData, telegramStatus]);

  const submitCommand = () => {
    if (!trimmedCommand) return;
    navigate(`/chat?command=${encodeURIComponent(trimmedCommand)}`);
  };

  const handleQuickCommandClick = (commandText: string) => {
    navigate(buildQuickCommandPath(commandText, Date.now()));
  };

  return (
    <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <motion.section
        className="overflow-hidden rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] sm:p-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
              <Sparkles className="h-3.5 w-3.5" />
              Executive Command Center
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--aston-text)] sm:text-4xl">
                에스턴 워크스테이션
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[var(--aston-muted)] sm:text-base">
                회장님을 위한 AI 업무 지휘본부입니다. 채팅, 트레이딩, 부동산 PF, Google Workspace, Telegram을 한 화면에서 실행합니다.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/chat">
              <a className="inline-flex h-10 items-center justify-center rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
                AI 채팅 열기
              </a>
            </Link>
            <Link href="/google">
              <a className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-[var(--aston-text)] transition hover:bg-white/10">
                Google Workspace
              </a>
            </Link>
            <Link href="/trading">
              <a className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-[var(--aston-text)] transition hover:bg-white/10">
                트레이딩
              </a>
            </Link>
          </div>
        </div>
      </motion.section>

      <section className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex-1">
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--aston-muted)]">
              AI 명령 입력
            </label>
            <div className="flex gap-2">
              <Input
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="AI에게 업무를 지시하세요..."
                className="h-11 border-white/10 bg-black/20 text-[var(--aston-text)] placeholder:text-[var(--aston-muted)] focus-visible:border-cyan-500/40 focus-visible:ring-cyan-500/20"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitCommand();
                  }
                }}
              />
              <Button
                type="button"
                onClick={submitCommand}
                disabled={!trimmedCommand}
                className="h-11 rounded-lg bg-cyan-500 px-5 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
              >
                실행
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {HOME_QUICK_COMMANDS.map((label) => (
              <Button
                key={label}
                type="button"
                variant="outline"
                onClick={() => handleQuickCommandClick(label)}
                className="rounded-full border-white/10 bg-white/5 px-4 text-xs text-[var(--aston-text)] hover:bg-white/10"
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((item) => (
          <KPICard key={item.key} config={item} navigate={navigate} />
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--aston-text)]">주요 모듈</h2>
            <p className="mt-1 text-sm text-[var(--aston-muted)]">실행형 화면으로 바로 이동합니다.</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map(({ href, label, description, icon: Icon }) => (
            <Link key={href} href={href}>
              <a className="group rounded-2xl border border-white/10 bg-black/15 p-4 transition hover:border-cyan-500/30 hover:bg-white/5">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300 transition group-hover:bg-cyan-500/20">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-[var(--aston-text)]">{label}</div>
                    <div className="mt-1 text-sm text-[var(--aston-muted)]">{description}</div>
                  </div>
                </div>
              </a>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[var(--aston-text)]">최근 활동</h2>
            <p className="mt-1 text-sm text-[var(--aston-muted)]">최근 지시와 시스템 흐름을 요약합니다.</p>
          </div>

          <div className="space-y-3">
            {activities.map((item) => (
              <button
                type="button"
                key={`${item.label}-${item.time}`}
                onClick={() => navigate(item.href)} // MODIFIED: recent activity entries now drill into the relevant module.
                className="flex w-full items-start justify-between gap-4 rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-left transition hover:border-cyan-500/30 hover:bg-white/5"
              >
                <div>
                  <div className="text-sm font-medium text-[var(--aston-text)]">{item.label}</div>
                  <div className="mt-1 text-sm text-[var(--aston-muted)]">{item.detail}</div>
                </div>
                <div className="shrink-0 text-xs text-[var(--aston-muted)]">{item.time}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[var(--aston-text)]">운영 메모</h2>
            <p className="mt-1 text-sm text-[var(--aston-muted)]">에스턴 워크스테이션의 현재 우선순위입니다.</p>
          </div>

          <div className="space-y-3 text-sm text-[var(--aston-muted)]">
            <div className="rounded-xl border border-white/10 bg-black/15 p-4">
              <div className="font-medium text-[var(--aston-text)]">1. 지시 실행</div>
              <div className="mt-1">AI 채팅을 통해 Gmail, Calendar, Telegram, PF 업무를 연결합니다.</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/15 p-4">
              <div className="font-medium text-[var(--aston-text)]">2. 실행 상태 확인</div>
              <div className="mt-1">트레이딩, 부동산 PF, 모니터링, Workspace 상태를 빠르게 확인합니다.</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/15 p-4">
              <div className="font-medium text-[var(--aston-text)]">3. 보조 문서</div>
              <div className="mt-1">개요, 아키텍처, API 참조, 보안, 로드맵은 사이드바 하단에서 확인합니다.</div>
            </div>
          </div>
        </div>
      </section>

      <WorkspaceWidgets />
    </div>
  );
}
