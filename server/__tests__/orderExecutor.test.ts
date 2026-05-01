import { describe, it, expect, vi } from "vitest";
import { OrderExecutor } from "../trading/orderExecutor.ts";

const fakeCreds = { accessKey: "test_key", secret: "test_secret_with_enough_length_for_hmac" };

function mockJsonResponse(body: any, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OrderExecutor.placeMarketBuy", () => {
  it("KRW 마켓 검증 — KRW- prefix 가 없으면 실패한다", async () => {
    const fetchMock = vi.fn();
    const executor = new OrderExecutor({ fetch: fetchMock as any, getCredentials: () => fakeCreds });
    await expect(executor.placeMarketBuy({ market: "BTC", amountKrw: 50_000 }))
      .rejects.toThrow(/KRW 마켓/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("amountKrw <= 0 이면 실패한다", async () => {
    const fetchMock = vi.fn();
    const executor = new OrderExecutor({ fetch: fetchMock as any, getCredentials: () => fakeCreds });
    await expect(executor.placeMarketBuy({ market: "KRW-BTC", amountKrw: 0 }))
      .rejects.toThrow(/양수/);
  });

  it("정상 응답을 OrderResult 로 파싱한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({
      uuid: "9ca023a5-851b-4fec-9f0a-48cd83c2eaae",
      side: "bid",
      ord_type: "price",
      price: "50000",
      state: "wait",
      market: "KRW-BTC",
      avg_price: "0",
      executed_volume: "0",
      paid_fee: "0",
      locked: "50000",
    }));
    const executor = new OrderExecutor({ fetch: fetchMock as any, getCredentials: () => fakeCreds });
    const result = await executor.placeMarketBuy({ market: "KRW-BTC", amountKrw: 50_000 });
    expect(result.uuid).toBe("9ca023a5-851b-4fec-9f0a-48cd83c2eaae");
    expect(result.side).toBe("bid");
    expect(result.market).toBe("KRW-BTC");

    // 호출 인자 검증
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.upbit.com/v1/orders");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers.Authorization).toMatch(/^Bearer /);
    const body = JSON.parse(init.body);
    expect(body.market).toBe("KRW-BTC");
    expect(body.side).toBe("bid");
    expect(body.ord_type).toBe("price");
    expect(body.price).toBe("50000");
  });

  it("HTTP 4xx 응답을 한국어 에러로 변환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(
      { error: { name: "insufficient_funds_bid", message: "x" } },
      { status: 400 }
    ));
    const executor = new OrderExecutor({ fetch: fetchMock as any, getCredentials: () => fakeCreds });
    await expect(executor.placeMarketBuy({ market: "KRW-BTC", amountKrw: 50_000 }))
      .rejects.toThrow(/매수 가능한 KRW 잔고가 부족합니다/);
  });

  it("under_min_total_bid 코드는 최소 매수 금액 메시지로 매핑된다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(
      { error: { name: "under_min_total_bid", message: "x" } },
      { status: 400 }
    ));
    const executor = new OrderExecutor({ fetch: fetchMock as any, getCredentials: () => fakeCreds });
    await expect(executor.placeMarketBuy({ market: "KRW-BTC", amountKrw: 100 }))
      .rejects.toThrow(/최소 매수 금액 미만/);
  });

  it("네트워크 오류는 한국어로 변환된다", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const executor = new OrderExecutor({ fetch: fetchMock as any, getCredentials: () => fakeCreds });
    await expect(executor.placeMarketBuy({ market: "KRW-BTC", amountKrw: 50_000 }))
      .rejects.toThrow(/네트워크 오류/);
  });

  it("API 키 누락 시 명확한 한국어 에러", async () => {
    const fetchMock = vi.fn();
    const executor = new OrderExecutor({
      fetch: fetchMock as any,
      getCredentials: () => { throw new Error("Upbit API 키가 설정되지 않았습니다."); },
    });
    await expect(executor.placeMarketBuy({ market: "KRW-BTC", amountKrw: 50_000 }))
      .rejects.toThrow(/Upbit API 키/);
  });
});

describe("OrderExecutor.placeMarketSell", () => {
  it("volume <= 0 이면 실패한다", async () => {
    const fetchMock = vi.fn();
    const executor = new OrderExecutor({ fetch: fetchMock as any, getCredentials: () => fakeCreds });
    await expect(executor.placeMarketSell({ market: "KRW-BTC", volume: 0 }))
      .rejects.toThrow(/양수/);
  });

  it("정상 매도 요청은 ord_type=market 으로 전송된다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({
      uuid: "abc",
      side: "ask",
      ord_type: "market",
      state: "wait",
      market: "KRW-BTC",
      avg_price: "0",
      executed_volume: "0",
      paid_fee: "0",
    }));
    const executor = new OrderExecutor({ fetch: fetchMock as any, getCredentials: () => fakeCreds });
    const result = await executor.placeMarketSell({ market: "KRW-BTC", volume: 0.001 });
    expect(result.side).toBe("ask");

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.ord_type).toBe("market");
    expect(body.volume).toBe("0.001");
    expect(body.side).toBe("ask");
  });
});

describe("OrderExecutor.getOrder", () => {
  it("uuid 를 query string 으로 GET 한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({
      uuid: "abc",
      side: "bid",
      ord_type: "price",
      state: "done",
      market: "KRW-BTC",
      avg_price: "80000000",
      executed_volume: "0.000625",
      paid_fee: "25",
    }));
    const executor = new OrderExecutor({ fetch: fetchMock as any, getCredentials: () => fakeCreds });
    const result = await executor.getOrder("abc");
    expect(result.state).toBe("done");
    expect(result.avgPrice).toBe(80_000_000);
    expect(result.executedVolume).toBe(0.000625);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/v1/order?");
    expect(url).toContain("uuid=abc");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toMatch(/^Bearer /);
  });
});
