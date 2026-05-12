import { describe, it, expect, beforeEach } from "vitest";
import { ApprovalQueue } from "../trading/approvalQueue.ts";

describe("ApprovalQueue.enqueue", () => {
  let queue: ApprovalQueue;
  beforeEach(() => {
    queue = new ApprovalQueue();
  });

  it("매수 요청 등록 시 상태가 pending 으로 시작한다", () => {
    const req = queue.enqueue({ market: "KRW-BTC", side: "bid", amountKrw: 50_000, reason: "테스트" });
    expect(req.status).toBe("pending");
    expect(req.market).toBe("KRW-BTC");
    expect(req.amountKrw).toBe(50_000);
    expect(req.id).toBeTruthy();
  });

  it("매도 요청은 volume 이 필수다", () => {
    expect(() => queue.enqueue({ market: "KRW-BTC", side: "ask", reason: "x" } as any))
      .toThrow(/volume/);
  });

  it("매수 요청은 amountKrw 가 필수다", () => {
    expect(() => queue.enqueue({ market: "KRW-BTC", side: "bid", reason: "x" } as any))
      .toThrow(/amountKrw/);
  });

  it("market 형식이 잘못되면 거절한다", () => {
    expect(() => queue.enqueue({ market: "BTC", side: "bid", amountKrw: 50_000, reason: "x" }))
      .toThrow(/market 형식/);
  });

  it("id 로 조회할 수 있다", () => {
    const req = queue.enqueue({ market: "KRW-BTC", side: "bid", amountKrw: 50_000, reason: "x" });
    expect(queue.get(req.id)?.market).toBe("KRW-BTC");
    expect(queue.get("nonexistent")).toBeUndefined();
  });
});

describe("ApprovalQueue.setStatus", () => {
  let queue: ApprovalQueue;
  beforeEach(() => {
    queue = new ApprovalQueue();
  });

  it("상태를 변경하면 decidedAt 이 채워진다", () => {
    const req = queue.enqueue({ market: "KRW-BTC", side: "bid", amountKrw: 50_000, reason: "x" });
    expect(req.decidedAt).toBeUndefined();
    queue.setStatus(req.id, "approved");
    expect(queue.get(req.id)!.decidedAt).toBeGreaterThan(0);
    expect(queue.get(req.id)!.status).toBe("approved");
  });

  it("execute 결과를 보존한다", () => {
    const req = queue.enqueue({ market: "KRW-BTC", side: "bid", amountKrw: 50_000, reason: "x" });
    queue.setStatus(req.id, "executed", {
      result: { uuid: "abc", avgPrice: 80_000_000, executedVolume: 0.000625, paid: 50_000 },
    });
    expect(queue.get(req.id)!.result?.uuid).toBe("abc");
    expect(queue.get(req.id)!.result?.paid).toBe(50_000);
  });

  it("존재하지 않는 id 는 에러", () => {
    expect(() => queue.setStatus("missing", "approved")).toThrow(/찾을 수 없습니다/);
  });
});

describe("ApprovalQueue.expireOld", () => {
  let queue: ApprovalQueue;
  beforeEach(() => {
    queue = new ApprovalQueue();
  });

  it("ttl 경과한 pending 만 expired 로 전이한다", () => {
    const req = queue.enqueue({
      market: "KRW-BTC",
      side: "bid",
      amountKrw: 50_000,
      reason: "x",
      ttlMs: 1, // 1ms 만료
    });
    // 강제로 시간 초과 시뮬레이션
    const future = Date.now() + 60_000;
    const expired = queue.expireOld(future);
    expect(expired).toHaveLength(1);
    expect(expired[0].id).toBe(req.id);
    expect(queue.get(req.id)!.status).toBe("expired");
  });

  it("이미 결정된 항목은 만료 처리하지 않는다", () => {
    const req = queue.enqueue({
      market: "KRW-BTC",
      side: "bid",
      amountKrw: 50_000,
      reason: "x",
      ttlMs: 1,
    });
    queue.setStatus(req.id, "approved");
    const expired = queue.expireOld(Date.now() + 60_000);
    expect(expired).toHaveLength(0);
    expect(queue.get(req.id)!.status).toBe("approved");
  });
});

describe("ApprovalQueue.countExecutedToday", () => {
  let queue: ApprovalQueue;
  beforeEach(() => {
    queue = new ApprovalQueue();
  });

  it("오늘 체결된 건수만 센다", () => {
    const r1 = queue.enqueue({ market: "KRW-BTC", side: "bid", amountKrw: 50_000, reason: "x" });
    const r2 = queue.enqueue({ market: "KRW-ETH", side: "bid", amountKrw: 50_000, reason: "x" });
    const r3 = queue.enqueue({ market: "KRW-XRP", side: "bid", amountKrw: 50_000, reason: "x" });
    queue.setStatus(r1.id, "executed");
    queue.setStatus(r2.id, "executed");
    queue.setStatus(r3.id, "rejected");
    expect(queue.countExecutedToday()).toBe(2);
  });

  it("어제 체결된 건은 제외된다", () => {
    const req = queue.enqueue({ market: "KRW-BTC", side: "bid", amountKrw: 50_000, reason: "x" });
    queue.setStatus(req.id, "executed");
    // decidedAt 을 어제로 강제 설정
    const r = queue.get(req.id)!;
    r.decidedAt = Date.now() - 36 * 60 * 60 * 1000; // 36시간 전 → 명백히 어제 KST
    expect(queue.countExecutedToday()).toBe(0);
  });
});

describe("ApprovalQueue.list", () => {
  it("최근 생성순으로 정렬된 배열을 반환한다", async () => {
    const queue = new ApprovalQueue();
    const r1 = queue.enqueue({ market: "KRW-BTC", side: "bid", amountKrw: 50_000, reason: "x" });
    await new Promise((r) => setTimeout(r, 5));
    const r2 = queue.enqueue({ market: "KRW-ETH", side: "bid", amountKrw: 50_000, reason: "y" });
    const list = queue.list();
    expect(list[0].id).toBe(r2.id);
    expect(list[1].id).toBe(r1.id);
  });
});
