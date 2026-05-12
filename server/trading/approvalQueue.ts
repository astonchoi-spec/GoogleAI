/**
 * 승인 대기 큐 — 매매 신호 1탭 승인 플로우
 *
 * 동시 승인 처리: in-memory Map. 동시 다건 허용(병렬). 실제 다중 신호가 빠르게
 * 발생하는 시나리오는 흔치 않으므로 FIFO 큐 강제 대신 자유 ID 기반 lookup을 사용한다.
 *
 * 타임아웃: 기본 5분. 만료 시 상태를 expired 로 전이하고 메시지 편집을 호출자가 책임진다.
 * 5분은 회장님이 휴대폰을 보지 못하는 짧은 회의 정도는 견디면서, 너무 오래된 신호로
 * 실수 체결되는 것을 막는 절충점이다.
 */

import crypto from "crypto";

export type ApprovalSide = "bid" | "ask";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "executed"
  | "failed";

export type ApprovalRequest = {
  id: string;
  market: string; // 예: KRW-BTC
  side: ApprovalSide; // bid=매수, ask=매도
  amountKrw?: number; // 시장가 매수 — KRW 금액
  volume?: number; // 시장가 매도 — 코인 수량
  reason: string; // 신호 요약
  createdAt: number;
  expiresAt: number;
  status: ApprovalStatus;
  chatId?: number; // 텔레그램 chat id (메시지 편집용)
  messageId?: number; // 텔레그램 message id
  result?: {
    uuid: string;
    avgPrice: number | null;
    executedVolume: number | null;
    paid: number | null;
  };
  errorMessage?: string;
  decidedAt?: number;
};

export type EnqueueInput = {
  market: string;
  side: ApprovalSide;
  amountKrw?: number;
  volume?: number;
  reason: string;
  chatId?: number;
  ttlMs?: number;
};

const DEFAULT_TTL_MS = (() => {
  const env = Number(process.env.APPROVAL_TIMEOUT_MS);
  return Number.isFinite(env) && env > 0 ? env : 5 * 60_000;
})();

export class ApprovalQueue {
  private requests = new Map<string, ApprovalRequest>();

  /** 신규 승인 요청 등록. 반환값의 id 를 callback_data 에 인코딩해서 사용한다. */
  enqueue(input: EnqueueInput): ApprovalRequest {
    if (!input.market || !input.market.includes("-")) {
      throw new Error("승인 요청 등록 실패: market 형식이 올바르지 않습니다 (예: KRW-BTC)");
    }
    if (input.side !== "bid" && input.side !== "ask") {
      throw new Error("승인 요청 등록 실패: side 는 bid 또는 ask 만 허용됩니다");
    }
    if (input.side === "bid" && (!input.amountKrw || input.amountKrw <= 0)) {
      throw new Error("승인 요청 등록 실패: 매수 요청은 amountKrw 가 필요합니다");
    }
    if (input.side === "ask" && (!input.volume || input.volume <= 0)) {
      throw new Error("승인 요청 등록 실패: 매도 요청은 volume 이 필요합니다");
    }

    const now = Date.now();
    const ttl = input.ttlMs && input.ttlMs > 0 ? input.ttlMs : DEFAULT_TTL_MS;
    const request: ApprovalRequest = {
      id: crypto.randomUUID(),
      market: input.market,
      side: input.side,
      amountKrw: input.amountKrw,
      volume: input.volume,
      reason: input.reason,
      createdAt: now,
      expiresAt: now + ttl,
      status: "pending",
      chatId: input.chatId,
    };
    this.requests.set(request.id, request);
    return request;
  }

  get(id: string): ApprovalRequest | undefined {
    return this.requests.get(id);
  }

  setStatus(
    id: string,
    status: ApprovalStatus,
    extra?: Partial<Pick<ApprovalRequest, "result" | "errorMessage" | "messageId">>
  ): ApprovalRequest {
    const req = this.requests.get(id);
    if (!req) {
      throw new Error(`승인 요청을 찾을 수 없습니다: ${id}`);
    }
    req.status = status;
    if (status !== "pending") req.decidedAt = Date.now();
    if (extra?.result) req.result = extra.result;
    if (extra?.errorMessage) req.errorMessage = extra.errorMessage;
    if (extra?.messageId !== undefined) req.messageId = extra.messageId;
    return req;
  }

  /** 만료된 pending 항목을 expired 로 전이. 반환값은 만료된 항목 배열. */
  expireOld(now: number = Date.now()): ApprovalRequest[] {
    const expired: ApprovalRequest[] = [];
    for (const req of this.requests.values()) {
      if (req.status === "pending" && req.expiresAt <= now) {
        req.status = "expired";
        req.decidedAt = now;
        expired.push(req);
      }
    }
    return expired;
  }

  /** 오늘(KST 자정 기준) 체결 완료된 승인 건수. 일일 한도 검사용. */
  countExecutedToday(now: Date = new Date()): number {
    const kstOffsetMs = 9 * 60 * 60_000;
    const kstNow = new Date(now.getTime() + kstOffsetMs);
    const startOfDayKstUtc = Date.UTC(
      kstNow.getUTCFullYear(),
      kstNow.getUTCMonth(),
      kstNow.getUTCDate()
    ) - kstOffsetMs;
    let count = 0;
    for (const req of this.requests.values()) {
      if (req.status === "executed" && req.decidedAt && req.decidedAt >= startOfDayKstUtc) {
        count += 1;
      }
    }
    return count;
  }

  list(): ApprovalRequest[] {
    return Array.from(this.requests.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /** 테스트용 — 큐를 비운다 */
  clear(): void {
    this.requests.clear();
  }
}

export const approvalQueue = new ApprovalQueue();
