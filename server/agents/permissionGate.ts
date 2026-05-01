export type PermissionLevel = 1 | 2 | 3;
export type AgentAction = "list" | "read" | "execute" | "cancel";

export type PermissionDecision = {
  allowed: boolean;
  requiresApproval?: boolean;
  reason?: string;
};

function parseLevel(): PermissionLevel {
  const raw = process.env.AGENT_PERMISSION_LEVEL?.trim();
  const n = Number(raw);
  if (n === 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  return 2;
}

export function getPermissionLevel(): PermissionLevel {
  return parseLevel();
}

export function checkAgentAction(action: AgentAction): PermissionDecision {
  const level = getPermissionLevel();
  if (action === "list" || action === "read") {
    return { allowed: true };
  }
  if (action === "execute") {
    if (level === 2) return { allowed: true, requiresApproval: true };
    if (level >= 3) return { allowed: true };
    return { allowed: false, reason: "권한 1단계(읽기 전용)에서는 작업을 실행할 수 없습니다. 시뮬레이션 모드로만 동작합니다." };
  }
  if (action === "cancel") {
    if (level >= 2) return { allowed: true };
    return { allowed: true };
  }
  return { allowed: false, reason: "알 수 없는 작업입니다." };
}

export function describeLevel(level: PermissionLevel = getPermissionLevel()): string {
  if (level === 1) return "1단계 — 읽기 전용 (시뮬레이션 모드)";
  if (level === 2) return "2단계 — 실행 (회장 승인 필요)";
  return "3단계 — 자동 실행";
}

export function getAgentApprovalTimeoutMs(): number {
  const min = Number(process.env.AGENT_APPROVAL_TIMEOUT_MIN);
  if (Number.isFinite(min) && min > 0) return min * 60 * 1000;
  return 5 * 60 * 1000;
}
