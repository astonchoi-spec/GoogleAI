import { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  AlertCircle,
  RefreshCw,
  LogIn,
  ChevronDown,
  ChevronUp,
  Mail,
  Calendar,
  HardDrive,
  Table2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceStatus =
  | "normal"
  | "disconnected"
  | "permission_required"
  | "api_disabled"
  | "config_required"
  | "error";

type ServiceKey = "gmail" | "calendar" | "drive" | "sheets";

interface ServiceDiag {
  status: ServiceStatus;
  message: string;
  lastChecked: string;
}

// ─── Static config ────────────────────────────────────────────────────────────

const SERVICE_ORDER: ServiceKey[] = ["gmail", "calendar", "drive", "sheets"];

const SERVICE_INFO: Record<ServiceKey, { label: string; apiPath: string; Icon: React.ElementType }> = {
  gmail: { label: "Gmail", apiPath: "gmail.googleapis.com", Icon: Mail },
  calendar: { label: "Calendar", apiPath: "calendar-json.googleapis.com", Icon: Calendar },
  drive: { label: "Drive", apiPath: "drive.googleapis.com", Icon: HardDrive },
  sheets: { label: "Sheets", apiPath: "sheets.googleapis.com", Icon: Table2 },
};

const STATUS_CONFIG: Record<
  ServiceStatus,
  { label: string; textClass: string; bgClass: string; dotClass: string; Icon: React.ElementType }
> = {
  normal: {
    label: "정상",
    textClass: "text-green-400",
    bgClass: "border-green-500/20 bg-green-500/10",
    dotClass: "bg-green-400",
    Icon: CheckCircle2,
  },
  disconnected: {
    label: "미연결",
    textClass: "text-slate-400",
    bgClass: "border-slate-500/20 bg-slate-500/10",
    dotClass: "bg-slate-400",
    Icon: XCircle,
  },
  permission_required: {
    label: "권한 필요",
    textClass: "text-amber-400",
    bgClass: "border-amber-500/20 bg-amber-500/10",
    dotClass: "bg-amber-400",
    Icon: AlertTriangle,
  },
  api_disabled: {
    label: "API 비활성",
    textClass: "text-red-400",
    bgClass: "border-red-500/20 bg-red-500/10",
    dotClass: "bg-red-400",
    Icon: XCircle,
  },
  config_required: {
    label: "설정 필요",
    textClass: "text-amber-400",
    bgClass: "border-amber-500/20 bg-amber-500/10",
    dotClass: "bg-amber-400",
    Icon: AlertCircle,
  },
  error: {
    label: "오류",
    textClass: "text-red-400",
    bgClass: "border-red-500/20 bg-red-500/10",
    dotClass: "bg-red-400",
    Icon: AlertTriangle,
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function apiConsoleUrl(apiPath: string, projectNumber: string): string {
  const base = `https://console.cloud.google.com/apis/library/${apiPath}`;
  return projectNumber ? `${base}?project=${projectNumber}` : base;
}

function overallStatus(
  services: Record<ServiceKey, ServiceDiag> | undefined
): "all_ok" | "has_issues" | "loading" {
  if (!services) return "loading";
  const hasIssue = SERVICE_ORDER.some((k) => services[k].status !== "normal");
  return hasIssue ? "has_issues" : "all_ok";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ServiceStatus }) {
  const cfg = STATUS_CONFIG[status];
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${cfg.dotClass}`} />;
}

function StatusBadge({ serviceKey, diag }: { serviceKey: ServiceKey; diag: ServiceDiag }) {
  const cfg = STATUS_CONFIG[diag.status];
  const { label: svcLabel, Icon: SvcIcon } = SERVICE_INFO[serviceKey];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.bgClass} ${cfg.textClass}`}
    >
      <SvcIcon className="h-3 w-3" />
      {svcLabel}
      <StatusDot status={diag.status} />
      <span className="opacity-70">{cfg.label}</span>
    </span>
  );
}

function ServiceDetailRow({
  serviceKey,
  diag,
  authUrl,
  projectNumber,
  onRefetch,
}: {
  serviceKey: ServiceKey;
  diag: ServiceDiag;
  authUrl: string | undefined;
  projectNumber: string;
  onRefetch: () => void;
}) {
  const cfg = STATUS_CONFIG[diag.status];
  const { label, apiPath, Icon: SvcIcon } = SERVICE_INFO[serviceKey];
  const StatusIcon = cfg.Icon;
  const showReconnect =
    diag.status === "disconnected" ||
    diag.status === "permission_required";
  const showApiLink = diag.status === "api_disabled";

  const handleReconnect = () => {
    if (!authUrl) return;
    const popup = window.open(authUrl, "_blank", "width=520,height=620");
    const timer = setInterval(() => {
      if (popup?.closed) {
        clearInterval(timer);
        onRefetch();
      }
    }, 800);
  };

  return (
    <div className={`rounded-xl border p-3 ${cfg.bgClass}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: service name + message */}
        <div className="flex min-w-0 items-start gap-2.5">
          <StatusIcon className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.textClass}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <SvcIcon className={`h-3.5 w-3.5 ${cfg.textClass}`} />
              <span className={`text-sm font-semibold ${cfg.textClass}`}>{label}</span>
              <span
                className={`rounded-full border px-1.5 py-0 text-[10px] font-medium ${cfg.bgClass} ${cfg.textClass}`}
              >
                {cfg.label}
              </span>
            </div>
            <p className="mt-0.5 break-words text-xs text-[var(--aston-muted)]">{diag.message}</p>
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex shrink-0 flex-wrap gap-1.5 sm:ml-3">
          {showReconnect && authUrl && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-cyan-500/30 bg-cyan-500/10 px-2 text-xs text-cyan-300 hover:bg-cyan-500/20"
              onClick={handleReconnect}
            >
              <LogIn className="mr-1 h-3 w-3" />
              Google 재연결
            </Button>
          )}
          {showApiLink && (
            <a
              href={apiConsoleUrl(apiPath, projectNumber)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 text-xs text-red-300 transition hover:bg-red-500/20"
            >
              <ExternalLink className="h-3 w-3" />
              {label} API 열기
            </a>
          )}
          {diag.status === "config_required" && (
            <span className="inline-flex h-7 items-center rounded-md border border-amber-500/20 bg-amber-500/5 px-2 text-[10px] text-amber-400/80">
              .env WORKSPACE_SPREADSHEET_ID 확인
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WorkspaceDiagnosticPanel() {
  const [expanded, setExpanded] = useState(false);

  // MODIFIED: getDiagnostics endpoint not yet implemented; use placeholder data.
  const now = new Date().toLocaleString("ko-KR");
  const data = {
    services: {
      gmail: { status: "disconnected" as ServiceStatus, message: "확인 대기 중", lastChecked: now },
      calendar: { status: "disconnected" as ServiceStatus, message: "확인 대기 중", lastChecked: now },
      drive: { status: "disconnected" as ServiceStatus, message: "확인 대기 중", lastChecked: now },
      sheets: { status: "disconnected" as ServiceStatus, message: "확인 대기 중", lastChecked: now },
    } as Record<ServiceKey, ServiceDiag>,
    projectNumber: "",
  };
  const isLoading = false;
  const isFetching = false;
  const refetch = () => {};
  const authUrlData = { authUrl: "" };

  const services = data?.services as Record<ServiceKey, ServiceDiag> | undefined;
  const projectNumber = data?.projectNumber ?? "";
  const overall = overallStatus(services);

  const handleRefetch = () => {
    refetch();
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] overflow-hidden">
      {/* ── Summary row (always visible) ── */}
      <div
        className="flex cursor-pointer flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* Overall indicator */}
          {isLoading || isFetching ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--aston-muted)]">
              <RefreshCw className="h-3 w-3 animate-spin" />
              점검 중…
            </span>
          ) : overall === "all_ok" ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              모든 서비스 정상
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              일부 서비스 점검 필요
            </span>
          )}

          {/* Per-service status badges */}
          {services &&
            SERVICE_ORDER.map((key) => (
              <StatusBadge key={key} serviceKey={key} diag={services[key]} />
            ))}
        </div>

        {/* Right: recheck + toggle */}
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-white/10 px-2 text-xs text-[var(--aston-muted)] hover:border-cyan-500/30 hover:text-cyan-300"
            onClick={(e) => {
              e.stopPropagation();
              handleRefetch();
            }}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            다시 점검
          </Button>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-[var(--aston-muted)]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--aston-muted)]" />
          )}
        </div>
      </div>

      {/* ── Expanded detail rows ── */}
      {expanded && services && (
        <div className="border-t border-white/10 p-4 space-y-2">
          <p className="mb-3 text-xs text-[var(--aston-muted)]">
            각 서비스 상태 및 조치 안내 — 점검 시각:{" "}
            {new Date(services.gmail.lastChecked).toLocaleTimeString("ko-KR")}
          </p>

          {SERVICE_ORDER.map((key) => (
            <ServiceDetailRow
              key={key}
              serviceKey={key}
              diag={services[key]}
              authUrl={authUrlData?.authUrl}
              projectNumber={projectNumber}
              onRefetch={handleRefetch}
            />
          ))}

          {/* Global reconnect shortcut if multiple services are disconnected */}
          {SERVICE_ORDER.filter((k) =>
            ["disconnected", "permission_required"].includes(services[k].status)
          ).length > 1 && authUrlData?.authUrl && (
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                onClick={() => {
                  const popup = window.open(
                    authUrlData.authUrl,
                    "_blank",
                    "width=520,height=620"
                  );
                  const timer = setInterval(() => {
                    if (popup?.closed) {
                      clearInterval(timer);
                      handleRefetch();
                    }
                  }, 800);
                }}
              >
                <LogIn className="mr-1.5 h-3.5 w-3.5" />
                전체 Google 재연결
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
