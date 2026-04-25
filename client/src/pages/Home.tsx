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

const quickCommands = [
  "오늘 메일 요약",
  "BTC 포지션 확인",
  "한남 PF 진행상황",
  "오늘 일정 브리핑",
  "Telegram 최근 메시지",
];

const kpis = [
  { label: "오늘 일정", value: "6", hint: "Calendar", icon: CalendarDays },
  { label: "받은 메일", value: "12", hint: "Gmail", icon: Mail },
  { label: "미확인 Telegram", value: "3", hint: "Telegram", icon: Smartphone },
  { label: "열린 포지션", value: "4", hint: "Trading", icon: TrendingUp },
  { label: "PF 딜", value: "8", hint: "Real Estate", icon: Building2 },
  { label: "시스템 경고", value: "1", hint: "Monitoring", icon: ShieldAlert },
];

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

const activities = [
  { label: "AI 지시", detail: "오늘 메일 요약을 정리했습니다.", time: "2분 전" },
  { label: "Telegram 수신", detail: "새 메시지 3건이 동기화되었습니다.", time: "8분 전" },
  { label: "Google 작업", detail: "Calendar 일정 초안이 생성되었습니다.", time: "17분 전" },
  { label: "트레이딩 알림", detail: "BTC 포지션 변동 알림이 도착했습니다.", time: "31분 전" },
  { label: "PF 변경 기록", detail: "한남 PF 사업성 메모가 갱신되었습니다.", time: "42분 전" },
  { label: "시스템 오류", detail: "최근 알림 없음", time: "현재" },
];

export default function Home() {
  const [, navigate] = useLocation();
  const [command, setCommand] = useState("");

  const trimmedCommand = useMemo(() => command.trim(), [command]);

  const submitCommand = () => {
    if (!trimmedCommand) return;
    navigate(`/chat?command=${encodeURIComponent(trimmedCommand)}`);
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
            {quickCommands.map((label) => (
              <Button
                key={label}
                type="button"
                variant="outline"
                onClick={() => navigate(`/chat?command=${encodeURIComponent(label)}`)}
                className="rounded-full border-white/10 bg-white/5 px-4 text-xs text-[var(--aston-text)] hover:bg-white/10"
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.04 }}
              className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[var(--aston-muted)]">{item.label}</div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight text-[var(--aston-text)]">
                    {item.value}
                  </div>
                  <div className="mt-1 text-xs text-[var(--aston-muted)]">{item.hint}</div>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-cyan-300">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </motion.div>
          );
        })}
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
              <div
                key={`${item.label}-${item.time}`}
                className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-black/15 px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-[var(--aston-text)]">{item.label}</div>
                  <div className="mt-1 text-sm text-[var(--aston-muted)]">{item.detail}</div>
                </div>
                <div className="shrink-0 text-xs text-[var(--aston-muted)]">{item.time}</div>
              </div>
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
