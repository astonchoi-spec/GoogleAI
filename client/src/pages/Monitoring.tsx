import { useMemo, type ComponentType } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertCircle,
  Brain,
  Clock3,
  Database,
  RefreshCw,
  Server,
  MessagesSquare,
  Radar,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

const trendChartConfig = {
  messages: {
    label: "전체 메시지",
    color: "hsl(187 92% 52%)",
  },
  userMessages: {
    label: "사용자",
    color: "hsl(217 91% 60%)",
  },
  assistantMessages: {
    label: "어시스턴트",
    color: "hsl(262 83% 58%)",
  },
} as const;

const sourceChartConfig = {
  web: {
    label: "Web",
    color: "hsl(187 92% 52%)",
  },
  telegram: {
    label: "Telegram",
    color: "hsl(217 91% 60%)",
  },
} as const;

function formatDuration(ms: number) {
  if (ms <= 0) return "-";
  if (ms < 1000) return `${ms}ms`;

  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatBytes(mb: number) {
  return `${mb} MB`;
}

export default function Monitoring() {
  const { data, isLoading, error, refetch, isFetching } = trpc.analytics.dashboard.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const trendData = useMemo(() => data?.trend ?? [], [data]);
  const sourceData = useMemo(
    () => [
      {
        key: "web",
        label: "Web",
        value: data?.messageStats.webMessages ?? 0,
        percent: data && data.messageStats.totalMessages > 0
          ? Math.round((data.messageStats.webMessages / data.messageStats.totalMessages) * 100)
          : 0,
      },
      {
        key: "telegram",
        label: "Telegram",
        value: data?.messageStats.telegramMessages ?? 0,
        percent: data && data.messageStats.totalMessages > 0
          ? Math.round((data.messageStats.telegramMessages / data.messageStats.totalMessages) * 100)
          : 0,
      },
    ],
    [data]
  );

  const loading = isLoading && !data;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 py-4 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
        >
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
              <Activity className="h-3.5 w-3.5" />
              Analytics and monitoring
            </div>
            <h1 className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-2xl font-bold leading-tight text-transparent md:text-3xl">
              운영 대시보드
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              메시지 흐름, 응답 지연, 시스템 상태를 한 화면에서 확인합니다.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-slate-700 bg-slate-900/60 text-slate-200 hover:border-cyan-500/40 hover:text-white"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            새로고침
          </Button>
        </motion.div>

        {error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">모니터링 데이터를 불러오지 못했습니다.</p>
                <p className="mt-1 text-red-100/80">{error.message}</p>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-28 animate-pulse rounded-xl border border-slate-700 bg-slate-900/50"
                />
              ))}
            </div>
            <div className="h-80 animate-pulse rounded-2xl border border-slate-700 bg-slate-900/50" />
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="h-72 animate-pulse rounded-2xl border border-slate-700 bg-slate-900/50" />
              <div className="h-72 animate-pulse rounded-2xl border border-slate-700 bg-slate-900/50" />
            </div>
          </div>
        ) : data ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={MessagesSquare}
                label="전체 메시지"
                value={formatNumber(data.messageStats.totalMessages)}
                detail={`${formatNumber(data.messageStats.userMessages)} user · ${formatNumber(data.messageStats.assistantMessages)} assistant`}
              />
              <MetricCard
                icon={Brain}
                label="평균 응답 시간"
                value={formatDuration(data.performance.avgResponseMs)}
                detail={`${formatNumber(data.performance.responseCount)}회 응답 측정`}
              />
              <MetricCard
                icon={Radar}
                label="활성 대화"
                value={formatNumber(data.conversationStats.activeConversations)}
                detail={`${formatNumber(data.conversationStats.pinnedConversations)}개 고정됨`}
              />
              <MetricCard
                icon={Server}
                label="시스템 업타임"
                value={formatDuration(data.system.uptimeSeconds * 1000)}
                detail={`${formatNumber(data.system.sessionCount)}개 세션`}
              />
            </div>

            <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4 md:p-6">
              <div className="mb-4 flex items-center gap-2">
                <Brain className="h-4 w-4 text-cyan-400" />
                <h2 className="text-lg font-semibold text-white">API 사용량</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoPill label="총 호출 수" value={formatNumber(data.apiUsage.totalCalls)} />
                <InfoPill label="총 토큰" value={formatNumber(data.apiUsage.totalTokens)} />
                <InfoPill label="평균 지연" value={formatDuration(data.apiUsage.averageLatencyMs)} />
                <InfoPill
                  label="마지막 호출"
                  value={data.apiUsage.lastCallAt ? new Date(data.apiUsage.lastCallAt).toLocaleString("ko-KR") : "-"}
                />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <InfoPill label="성공 호출" value={formatNumber(data.apiUsage.successfulCalls)} />
                <InfoPill label="실패 호출" value={formatNumber(data.apiUsage.failedCalls)} />
                <InfoPill
                  label="마지막 엔진"
                  value={data.apiUsage.lastEngine ? `${data.apiUsage.lastEngine} / ${data.apiUsage.lastModel ?? "-"}` : "-"}
                />
              </div>
              <div className="mt-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-300">최근 활동 로그</h3>
                <div className="space-y-2">
                  {data.apiUsage.activityLogs.length > 0 ? (
                    data.apiUsage.activityLogs.map((entry) => (
                      <div
                        key={`${entry.at}-${entry.engine}-${entry.model}`}
                        className="flex flex-col gap-1 rounded-xl border border-slate-700/80 bg-slate-950/40 px-4 py-3 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <div className="text-sm font-medium text-white">
                            {entry.engine} / {entry.model}
                          </div>
                          <div className="text-xs text-slate-500">
                            {new Date(entry.at).toLocaleString("ko-KR")} · {entry.success ? "성공" : "실패"}
                          </div>
                        </div>
                        <div className="text-xs text-slate-400">
                          {formatDuration(entry.latencyMs)}{entry.tokensUsed !== null ? ` · ${formatNumber(entry.tokensUsed)} tokens` : ""}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-slate-700/80 bg-slate-950/40 px-4 py-3 text-sm text-slate-500">
                      아직 기록된 활동이 없습니다.
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
              <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4 md:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">7일 메시지 추이</h2>
                    <p className="text-sm text-slate-400">웹과 텔레그램의 메시지 분포를 비교합니다.</p>
                  </div>
                </div>

                <ChartContainer
                  config={trendChartConfig}
                  className="h-80 w-full aspect-auto"
                >
                  <LineChart
                    data={trendData}
                    margin={{ left: 8, right: 16, top: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => value.slice(5)}
                      stroke="rgba(148, 163, 184, 0.7)"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="rgba(148, 163, 184, 0.7)"
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="messages"
                      stroke="var(--color-messages)"
                      strokeWidth={3}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="userMessages"
                      stroke="var(--color-userMessages)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="assistantMessages"
                      stroke="var(--color-assistantMessages)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ChartContainer>
              </section>

              <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4 md:p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-white">메시지 소스 분포</h2>
                  <p className="text-sm text-slate-400">서버 유입 경로를 비율과 개수로 확인합니다.</p>
                </div>

                <div className="space-y-4">
                  {sourceData.map((item, index) => (
                    <div key={item.key} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-300">{item.label}</span>
                        <span className="font-medium text-white">
                          {formatNumber(item.value)} · {item.percent}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(item.percent, item.value > 0 ? 8 : 0)}%`,
                            background: index === 0
                              ? "linear-gradient(90deg, #22d3ee, #38bdf8)"
                              : "linear-gradient(90deg, #60a5fa, #8b5cf6)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <InfoPill
                    label="총 대화"
                    value={formatNumber(data.conversationStats.totalConversations)}
                  />
                  <InfoPill
                    label="고정 대화"
                    value={formatNumber(data.conversationStats.pinnedConversations)}
                  />
                  <InfoPill
                    label="웹 메시지"
                    value={formatNumber(data.messageStats.webMessages)}
                  />
                  <InfoPill
                    label="텔레그램 메시지"
                    value={formatNumber(data.messageStats.telegramMessages)}
                  />
                </div>
              </section>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4 md:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-cyan-400" />
                  <h2 className="text-lg font-semibold text-white">응답 성능</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <InfoPill label="평균 응답" value={formatDuration(data.performance.avgResponseMs)} />
                  <InfoPill label="마지막 응답" value={formatDuration(data.performance.lastResponseMs)} />
                  <InfoPill label="측정 횟수" value={formatNumber(data.performance.responseCount)} />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4 md:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Database className="h-4 w-4 text-cyan-400" />
                  <h2 className="text-lg font-semibold text-white">시스템 상태</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoPill label="RSS 메모리" value={formatBytes(data.system.memoryRssMb)} />
                  <InfoPill label="Heap 사용량" value={formatBytes(data.system.heapUsedMb)} />
                  <InfoPill label="Node" value={data.system.nodeVersion} />
                  <InfoPill label="Platform" value={data.system.platform} />
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4 md:p-5">
      <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
        <Icon className="h-4 w-4 text-cyan-400" />
        <span>{label}</span>
      </div>
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{detail}</div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-950/40 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-white break-all">{value}</div>
    </div>
  );
}
