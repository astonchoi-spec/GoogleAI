import { describe, it, expect } from "vitest";
import { dispatchIntent } from "../intent/pipeline/dispatchIntent.ts";
import type { ParsedIntent } from "../intent/intentSchemas.ts";
import type { IntentAction, IntentDomain, RouteIntentOptions } from "../intent/types.ts";

function buildIntent(overrides: Partial<ParsedIntent> = {}): ParsedIntent {
  return {
    domain: "chat",
    action: "chat",
    type: "query",
    confidence: 0.9,
    params: {},
    ...overrides,
  };
}

function buildOptions(
  overrides: Partial<RouteIntentOptions> = {},
): RouteIntentOptions {
  return {
    userId: "test-user",
    message: "테스트 메시지",
    ...overrides,
  };
}

describe("dispatchIntent — Phase 4 단위 테스트", () => {
  it("execute 인텐트는 allowExecute=false 일 때 승인 게이트로 차단된다", async () => {
    const intent = buildIntent({
      domain: "trading" as IntentDomain,
      action: "trading_balance" as IntentAction,
      type: "execute",
      params: { exchange: "binance" },
    });

    const result = await dispatchIntent(
      intent,
      buildOptions({ allowExecute: false }),
    );

    expect(result.handled).toBe(false);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.response).toContain("확인 단계가 필요합니다");
    expect(result.confirmation).toEqual({
      action: "trading_balance",
      domain: "trading",
      params: { exchange: "binance" },
    });
  });

  it("execute 인텐트라도 allowExecute=true 면 승인 게이트를 통과한다", async () => {
    // 핸들러가 등록되지 않은 액션을 사용해 게이트만 통과하고 fallback에 도달함을 확인.
    const intent = buildIntent({
      domain: "chat",
      action: "__phase4_unknown_execute__" as IntentAction,
      type: "execute",
      params: {},
    });

    const result = await dispatchIntent(
      intent,
      buildOptions({ allowExecute: true }),
    );

    expect(result.requiresConfirmation).toBe(false);
    expect(result.handled).toBe(false);
    expect(result.response).toBe("Gemini 일반 대화로 처리합니다.");
  });

  it("execute_placeholder 액션은 단계적 연결 중 메시지를 반환한다", async () => {
    const intent = buildIntent({
      action: "execute_placeholder" as IntentAction,
      type: "query",
    });

    const result = await dispatchIntent(intent, buildOptions());

    expect(result.handled).toBe(false);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.response).toContain("단계적으로 연결");
  });

  it("핸들러가 등록되지 않은 액션은 Gemini 일반 대화 fallback 메시지를 반환한다", async () => {
    const intent = buildIntent({
      action: "__phase4_unknown_action__" as IntentAction,
      type: "query",
    });

    const result = await dispatchIntent(intent, buildOptions());

    expect(result.handled).toBe(false);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.response).toBe("Gemini 일반 대화로 처리합니다.");
  });

  it("query 인텐트의 confirmation 게이트는 작동하지 않는다", async () => {
    // 핸들러 미등록 + type=query 조합은 곧바로 fallback 경로로 진입.
    const intent = buildIntent({
      action: "__phase4_query_only__" as IntentAction,
      type: "query",
    });

    const result = await dispatchIntent(
      intent,
      buildOptions({ allowExecute: false }),
    );

    expect(result.requiresConfirmation).toBe(false);
  });

  it("DispatchResult 의 intent 필드는 입력 인텐트 그대로 전달된다", async () => {
    const intent = buildIntent({
      action: "__phase4_passthrough_check__" as IntentAction,
      type: "query",
      params: { foo: "bar", n: 42 },
      confidence: 0.77,
    });

    const result = await dispatchIntent(intent, buildOptions());

    expect(result.intent).toEqual(intent);
  });
});
