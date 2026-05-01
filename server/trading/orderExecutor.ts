/**
 * Upbit 주문 실행기 — JWT 서명 REST API 직접 호출
 *
 * ccxt 미사용 (CLAUDE.md §7: 공개 API는 fetch 직접). 시장가 매수/매도만 1차 지원.
 * - 매수: side=bid, ord_type=price, price=KRW (시장가, 금액 기준)
 * - 매도: side=ask, ord_type=market, volume=코인수량 (시장가)
 *
 * 보안:
 * - API 키 / secret 은 .env 에서만 읽고, 본 모듈 외부로 노출하지 않는다
 * - JWT 는 HS256, secret 으로 서명. nonce 는 UUID
 * - query_hash 는 SHA512(form-encoded body, 키 알파벳 정렬)
 */

import crypto from "crypto";

const UPBIT_API_BASE = "https://api.upbit.com";

export type OrderResult = {
  uuid: string;
  market: string;
  side: "bid" | "ask";
  state: string;
  ordType: string;
  avgPrice: number | null;
  executedVolume: number | null;
  paidFee: number | null;
  paid: number | null;
};

export type ExecutorDeps = {
  fetch?: typeof fetch;
  now?: () => number;
  getCredentials?: () => { accessKey: string; secret: string };
  realOrdersEnabled?: () => boolean;
};

export const REVIEW_MODE_MESSAGE = "🔒 검토 모드: 실주문 비활성화 상태입니다.";

export function isRealOrdersEnabled(): boolean {
  return process.env.ENABLE_REAL_ORDERS === "true";
}

function defaultGetCredentials(): { accessKey: string; secret: string } {
  const accessKey = process.env.UPBIT_API_KEY?.trim();
  const secret = process.env.UPBIT_SECRET?.trim();
  if (!accessKey || !secret) {
    throw new Error("Upbit API 키가 설정되지 않았습니다. .env 의 UPBIT_API_KEY/UPBIT_SECRET 를 확인하세요.");
  }
  return { accessKey, secret };
}

/** HS256 서명 JWT 생성 — Upbit 표준 페이로드 */
function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const data = `${enc(header)}.${enc(payload)}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

/** 폼 본문을 정렬하여 SHA512 해시 — Upbit query_hash 규약 */
function buildQueryHash(params: Record<string, string>): string {
  const query = Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");
  return crypto.createHash("sha512").update(query).digest("hex");
}

export class OrderExecutor {
  constructor(private deps: ExecutorDeps = {}) {}

  private getFetch(): typeof fetch {
    return this.deps.fetch ?? globalThis.fetch;
  }

  private getCredentials() {
    return (this.deps.getCredentials ?? defaultGetCredentials)();
  }

  private assertRealOrdersEnabled(): void {
    const enabled = (this.deps.realOrdersEnabled ?? isRealOrdersEnabled)();
    if (!enabled) {
      throw new Error(REVIEW_MODE_MESSAGE);
    }
    console.warn("[orderExecutor] ENABLE_REAL_ORDERS=true — real Upbit orders are enabled.");
  }

  async placeMarketBuy(input: { market: string; amountKrw: number }): Promise<OrderResult> {
    if (!input.market || !input.market.startsWith("KRW-")) {
      throw new Error("시장가 매수 실패: KRW 마켓만 지원합니다 (예: KRW-BTC)");
    }
    if (!Number.isFinite(input.amountKrw) || input.amountKrw <= 0) {
      throw new Error("시장가 매수 실패: amountKrw 는 양수여야 합니다");
    }

    this.assertRealOrdersEnabled();
    return this.postOrder({
      market: input.market,
      side: "bid",
      ord_type: "price",
      price: input.amountKrw.toString(),
    });
  }

  async placeMarketSell(input: { market: string; volume: number }): Promise<OrderResult> {
    if (!input.market || !input.market.startsWith("KRW-")) {
      throw new Error("시장가 매도 실패: KRW 마켓만 지원합니다 (예: KRW-BTC)");
    }
    if (!Number.isFinite(input.volume) || input.volume <= 0) {
      throw new Error("시장가 매도 실패: volume 은 양수여야 합니다");
    }

    this.assertRealOrdersEnabled();
    return this.postOrder({
      market: input.market,
      side: "ask",
      ord_type: "market",
      volume: input.volume.toString(),
    });
  }

  /** 미체결 포함 주문 단건 조회 — 시장가 체결 후 평균가 확인용 */
  async getOrder(uuid: string): Promise<OrderResult> {
    const params = { uuid };
    const queryHash = buildQueryHash(params);
    const { accessKey, secret } = this.getCredentials();
    const jwt = signJwt(
      {
        access_key: accessKey,
        nonce: crypto.randomUUID(),
        query_hash: queryHash,
        query_hash_alg: "SHA512",
      },
      secret
    );
    const url = `${UPBIT_API_BASE}/v1/order?${new URLSearchParams(params).toString()}`;

    const fetchImpl = this.getFetch();
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${jwt}` },
      });
    } catch (err) {
      console.error("[orderExecutor] getOrder fetch error:", err);
      throw new Error(`Upbit 주문 조회 실패: 네트워크 오류 (${err instanceof Error ? err.message : String(err)})`);
    }

    return this.parseOrderResponse(response, "주문 조회");
  }

  private async postOrder(params: Record<string, string>): Promise<OrderResult> {
    const queryHash = buildQueryHash(params);
    const { accessKey, secret } = this.getCredentials();
    const jwt = signJwt(
      {
        access_key: accessKey,
        nonce: crypto.randomUUID(),
        query_hash: queryHash,
        query_hash_alg: "SHA512",
      },
      secret
    );

    const fetchImpl = this.getFetch();
    let response: Response;
    try {
      response = await fetchImpl(`${UPBIT_API_BASE}/v1/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });
    } catch (err) {
      console.error("[orderExecutor] postOrder fetch error:", err);
      throw new Error(`Upbit 주문 실행 실패: 네트워크 오류 (${err instanceof Error ? err.message : String(err)})`);
    }

    return this.parseOrderResponse(response, params.side === "bid" ? "매수" : "매도");
  }

  private async parseOrderResponse(response: Response, label: string): Promise<OrderResult> {
    let body: any = null;
    try {
      body = await response.json();
    } catch {
      // JSON 파싱 실패 — 비정상 응답
    }

    if (!response.ok) {
      const errCode = body?.error?.name ?? body?.error?.message ?? `HTTP ${response.status}`;
      const errMsg = translateUpbitError(errCode);
      throw new Error(`Upbit ${label} 실패: ${errMsg}`);
    }

    if (!body || typeof body !== "object" || !body.uuid) {
      throw new Error(`Upbit ${label} 실패: 응답이 비어있거나 형식이 올바르지 않습니다`);
    }

    return {
      uuid: String(body.uuid),
      market: String(body.market ?? ""),
      side: body.side === "ask" ? "ask" : "bid",
      state: String(body.state ?? ""),
      ordType: String(body.ord_type ?? ""),
      avgPrice: parseNullableNumber(body.avg_price ?? body.price),
      executedVolume: parseNullableNumber(body.executed_volume),
      paidFee: parseNullableNumber(body.paid_fee),
      paid: parseNullableNumber(body.paid_fee != null && body.executed_volume != null && body.avg_price != null
        ? Number(body.executed_volume) * Number(body.avg_price)
        : body.locked),
    };
  }
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Upbit 에러 코드 → 한국어 메시지. 알 수 없는 코드는 원문 유지. */
function translateUpbitError(code: string): string {
  const map: Record<string, string> = {
    create_ask_error: "매도 주문을 만들 수 없습니다",
    create_bid_error: "매수 주문을 만들 수 없습니다",
    insufficient_funds_ask: "매도 가능한 잔고가 부족합니다",
    insufficient_funds_bid: "매수 가능한 KRW 잔고가 부족합니다",
    under_min_total_ask: "최소 매도 금액 미만입니다",
    under_min_total_bid: "최소 매수 금액 미만입니다 (Upbit 최소 5,000원)",
    invalid_query_payload: "요청 파라미터가 올바르지 않습니다",
    jwt_verification: "Upbit API 인증에 실패했습니다 (JWT 서명 오류)",
    invalid_access_key: "Upbit API 키가 올바르지 않거나 사용 불가입니다",
  };
  return map[code] ?? code;
}

export const orderExecutor = new OrderExecutor();
