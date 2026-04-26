import { AlertCircle, AlertTriangle, Settings, WifiOff, RefreshCw, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export interface WorkspaceErrorRecoveryProps {
  error: unknown;
  onRetry?: () => void;
  serviceName?: string; // e.g. "Gmail", "Calendar", "Drive"
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error ?? "");
}

type ErrorKind = "oauth" | "api_disabled" | "config_missing" | "other";

function classifyError(message: string): ErrorKind {
  if (
    message.includes("Google OAuth 연결이 필요합니다") ||
    message.includes("please authenticate")
  ) {
    return "oauth";
  }
  if (
    message.includes("GOOGLE_WORKSPACE_API_DISABLED") ||
    message.includes("has not been used")
  ) {
    return "api_disabled";
  }
  if (message.includes("WORKSPACE_SPREADSHEET_ID")) {
    return "config_missing";
  }
  return "other";
}

export default function WorkspaceErrorRecovery({
  error,
  onRetry,
  serviceName,
}: WorkspaceErrorRecoveryProps) {
  const message = extractMessage(error);
  const kind = classifyError(message);

  const serviceLabel = serviceName ? `${serviceName} ` : "";

  // Card style tokens per error kind
  const cardStyles: Record<ErrorKind, string> = {
    oauth: "border-amber-500/30 bg-amber-500/10",
    api_disabled: "border-red-500/30 bg-red-500/10",
    config_missing: "border-amber-500/30 bg-amber-500/10",
    other: "border-red-500/30 bg-red-500/10",
  };

  const iconColor: Record<ErrorKind, string> = {
    oauth: "text-amber-400",
    api_disabled: "text-red-400",
    config_missing: "text-amber-400",
    other: "text-red-400",
  };

  const Icon =
    kind === "oauth" || kind === "config_missing"
      ? AlertTriangle
      : kind === "api_disabled"
      ? Settings
      : WifiOff;

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${cardStyles[kind]}`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${iconColor[kind]}`} />
        <span className={`text-sm font-semibold ${iconColor[kind]}`}>
          {kind === "oauth" && `${serviceLabel}Google 재연결 필요`}
          {kind === "api_disabled" && `${serviceLabel}API 활성화 필요`}
          {kind === "config_missing" && `${serviceLabel}설정 필요`}
          {kind === "other" && `${serviceLabel}오류 발생`}
        </span>
      </div>

      <div className="text-xs text-[var(--aston-muted)] space-y-1.5">
        {kind === "oauth" && (
          <>
            <p>Google 계정 인증이 만료되었거나 권한이 없습니다.</p>
            <Link
              href="/google"
              className="inline-flex items-center gap-1 text-amber-400 underline underline-offset-2 hover:text-amber-300"
            >
              Google 계정 연결하기
            </Link>
          </>
        )}

        {kind === "api_disabled" && (
          <>
            <p>Google Cloud Console에서 해당 API를 활성화하세요.</p>
            <a
              href="https://console.cloud.google.com/apis/library"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-red-400 underline underline-offset-2 hover:text-red-300"
            >
              <ExternalLink className="h-3 w-3" />
              Google Cloud Console 열기
            </a>
          </>
        )}

        {kind === "config_missing" && (
          <p>
            환경 변수 <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-amber-300">WORKSPACE_SPREADSHEET_ID</code>가 설정되지 않았습니다. <code className="rounded bg-black/30 px-1 py-0.5 font-mono">.env</code> 파일을 확인하세요.
          </p>
        )}

        {kind === "other" && (
          <p className="break-all">
            {message.slice(0, 100)}
            {message.length > 100 ? "…" : ""}
          </p>
        )}
      </div>

      {onRetry && (
        <Button
          onClick={onRetry}
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 border border-white/10 text-[var(--aston-muted)] hover:text-[var(--aston-text)]"
        >
          <RefreshCw className="h-3 w-3" />
          다시 시도
        </Button>
      )}
    </div>
  );
}
