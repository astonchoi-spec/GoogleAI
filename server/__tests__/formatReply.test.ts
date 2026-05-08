import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  containsRawObjectShape,
  formatReply,
  formatRouteResponse,
  inferKind,
  isPlainObjectReply,
  toUserVisibleText,
} from "../intent/pipeline/formatReply.ts";
import type { DispatchResult } from "../intent/intentSchemas.ts";
import type {
  IntentAction,
  IntentDomain,
  IntentRouteResponse,
} from "../intent/types.ts";

function buildResult(
  overrides: Partial<DispatchResult> = {},
): DispatchResult {
  return {
    intent: {
      domain: "chat",
      action: "chat",
      type: "query",
      confidence: 0.5,
      params: {},
    },
    handled: true,
    requiresConfirmation: false,
    response: "기본 응답",
    ...overrides,
  };
}

describe("formatReply — Phase 5 단위 테스트", () => {
  // 콘솔 경고가 raw object 차단 케이스에서 발생하므로 테스트 출력 정리.
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("text 응답: response 만 있을 때 그대로 반환", () => {
    const out = formatReply(
      buildResult({ response: "✅ 위키에 저장했습니다." }),
    );
    expect(out).toBe("✅ 위키에 저장했습니다.");
  });

  it("list 응답: data.fileList 가 있으면 response 와 두 줄 띄움으로 합친다", () => {
    const out = formatReply(
      buildResult({
        response: "📂 검색 결과",
        data: { fileList: "1. 파일A\n2. 파일B" },
      }),
    );
    expect(out).toBe("📂 검색 결과\n\n1. 파일A\n2. 파일B");
  });

  it("list 응답: data.emailList 가 있으면 동일하게 합친다", () => {
    const out = formatReply(
      buildResult({
        response: "📧 받은 메일",
        data: { emailList: "- 메일 제목 1\n- 메일 제목 2" },
      }),
    );
    expect(out).toContain("📧 받은 메일");
    expect(out).toContain("- 메일 제목 1");
    expect(out).toContain("- 메일 제목 2");
  });

  it("list 응답: data.eventList 가 있으면 동일하게 합친다", () => {
    const out = formatReply(
      buildResult({
        response: "📅 오늘 일정",
        data: { eventList: "09:00 미팅\n14:00 콜" },
      }),
    );
    expect(out).toBe("📅 오늘 일정\n\n09:00 미팅\n14:00 콜");
  });

  it("report 응답: data.briefing / report / summary 우선순위로 본문 사용", () => {
    const briefing = formatReply(
      buildResult({
        response: "🌅 모닝 브리핑",
        data: { briefing: "전체 요약..." },
      }),
    );
    const report = formatReply(
      buildResult({
        response: "📊 리포트",
        data: { report: "리포트 본문..." },
      }),
    );
    const summary = formatReply(
      buildResult({
        response: "📝 요약",
        data: { summary: "요약 본문..." },
      }),
    );
    expect(briefing).toContain("전체 요약...");
    expect(report).toContain("리포트 본문...");
    expect(summary).toContain("요약 본문...");
  });

  it("handled=false 인 경우 빈 문자열을 반환 (Gemini fallback 트리거)", () => {
    const out = formatReply(
      buildResult({
        handled: false,
        response: "Gemini 일반 대화로 처리합니다.",
      }),
    );
    expect(out).toBe("");
  });

  it("requiresConfirmation 응답: ACTION REQUIRES CONFIRMATION 헤더 + intent 정보 + next 가이드", () => {
    const out = formatReply(
      buildResult({
        handled: false,
        requiresConfirmation: true,
        response: "실행 요청으로 분류되었습니다. 안전을 위해 확인 단계가 필요합니다.",
        intent: {
          domain: "trading" as IntentDomain,
          action: "trading_balance" as IntentAction,
          type: "execute",
          confidence: 0.9,
          params: { exchange: "binance" },
        },
        confirmation: {
          action: "trading_balance" as IntentAction,
          domain: "trading" as IntentDomain,
          params: { exchange: "binance" },
        },
      }),
    );
    expect(out).toContain("ACTION REQUIRES CONFIRMATION");
    expect(out).toContain("intent=trading/trading_balance type=execute");
    expect(out).toContain("params=");
    expect(out).toContain("next=allowExecute=true 로 승인 재요청");
  });

  it("raw object 차단: data.method 가 있으면 사용자 응답에 JSON 미노출 + 한국어 안내", () => {
    const out = formatReply(
      buildResult({
        response: "토지이용규제 정보를 조회했습니다.",
        data: { method: "realestate.landUse", params: { pnu: "test" } },
      }),
    );
    expect(out).toContain("토지이용규제 정보를 조회했습니다.");
    expect(out).toContain("내부 데이터");
    expect(out).not.toContain('"method"');
    expect(out).not.toContain("{");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("raw object 차단: data.files 가 있어도 동일하게 차단", () => {
    const out = formatReply(
      buildResult({
        response: "파일 처리 결과",
        data: { files: [{ name: "a.txt" }, { name: "b.txt" }] },
      }),
    );
    expect(out).not.toContain("[object Object]");
    expect(out).not.toContain('"files"');
    expect(out).toContain("내부 데이터");
  });

  it("일반 객체 data: 사용자 응답에는 response 만 노출 (raw JSON 미노출)", () => {
    const out = formatReply(
      buildResult({
        response: "정상 응답",
        data: { someKey: "someValue", count: 42 },
      }),
    );
    // primaryBody 미매칭 + tool envelope 아님 → safeDisplayBody 가 "" 반환
    expect(out).toBe("정상 응답");
    expect(out).not.toContain("someKey");
  });

  it("문자열 data: primaryBody 미매칭이면 safeDisplayBody 로 통째 노출", () => {
    const out = formatReply(
      buildResult({
        response: "헤더",
        data: "추가 본문 텍스트",
      }),
    );
    expect(out).toBe("헤더\n\n추가 본문 텍스트");
  });

  it("formatRouteResponse 어댑터: 기존 IntentRouteResponse 도 동일하게 처리", () => {
    const routed: IntentRouteResponse = {
      intent: {
        domain: "realestate",
        action: "realestate_land_use",
        type: "query",
        confidence: 0.6,
        params: {},
      },
      handled: true,
      requiresConfirmation: false,
      response: "토지이용규제 정보를 조회했습니다.",
      data: { method: "realestate.landUse", params: { pnu: "test" } },
    };
    const text = formatRouteResponse(routed);
    expect(text).toContain("토지이용규제 정보를 조회했습니다.");
    expect(text).toContain("내부 데이터");
    expect(text).not.toContain('"method"');
  });
});

describe("formatReply — Phase 6-A HandlerResponse list 분기", () => {
  // 콘솔 경고 격리.
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("kind=list + text: handlerResponse.text 가 본문으로 사용된다 (fileList 동등)", () => {
    const fileLines = ["1. 📄 a.pdf", "2. 📄 b.pdf"];
    const out = formatReply(
      buildResult({
        response: 'Google Drive에서 "보고서" 관련 파일 2개를 찾았습니다.',
        data: { files: [{ name: "a.pdf" }, { name: "b.pdf" }], fileList: fileLines.join("\n") },
        handlerResponse: {
          kind: "list",
          text: fileLines.join("\n"),
          items: fileLines,
          meta: { totalFiles: 2 },
        },
      }),
    );
    expect(out).toBe(
      'Google Drive에서 "보고서" 관련 파일 2개를 찾았습니다.\n\n1. 📄 a.pdf\n2. 📄 b.pdf',
    );
  });

  it("kind=list 결과는 legacy fileList 만 있을 때와 byte-for-byte 동일", () => {
    const baseResponse = 'Google Drive에서 "x" 관련 파일 1개를 찾았습니다.';
    const fileList = "1. 📄 only.txt";

    const legacy = formatReply(
      buildResult({ response: baseResponse, data: { files: [{ name: "only.txt" }], fileList } }),
    );
    const migrated = formatReply(
      buildResult({
        response: baseResponse,
        data: { files: [{ name: "only.txt" }], fileList },
        handlerResponse: { kind: "list", text: fileList, items: [fileList], meta: { totalFiles: 1 } },
      }),
    );
    expect(migrated).toBe(legacy);
  });

  it("kind=list + emailList 와 동등한 출력 (\\n\\n separator 보존)", () => {
    const emailItems = [
      "1. 🔵 제목 A\n   발신: a@example.com",
      "2.  제목 B\n   발신: b@example.com",
    ];
    const emailList = emailItems.join("\n\n");
    const out = formatReply(
      buildResult({
        response: "📬 최근 이메일 2개를 조회했습니다.",
        data: { emails: [], emailList },
        handlerResponse: { kind: "list", text: emailList, items: emailItems },
      }),
    );
    expect(out).toBe(
      "📬 최근 이메일 2개를 조회했습니다.\n\n" + emailList,
    );
    // 빈 줄로 항목 구분
    expect(out).toContain("제목 A\n   발신: a@example.com\n\n2.");
  });

  it("kind=list + eventList 와 동등한 출력", () => {
    const eventItems = ["1. 📅 미팅\n   2026-05-09T09:00:00"];
    const eventList = eventItems.join("\n\n");
    const out = formatReply(
      buildResult({
        response: "📅 다가오는 일정 1개를 조회했습니다.",
        data: { events: [], eventList },
        handlerResponse: { kind: "list", text: eventList, items: eventItems },
      }),
    );
    expect(out).toBe("📅 다가오는 일정 1개를 조회했습니다.\n\n" + eventList);
  });

  it("items 가 빈 배열 + text 가 빈 문자열일 때 legacy fileList 로 fallback", () => {
    const out = formatReply(
      buildResult({
        response: "🔍 검색",
        data: { fileList: "백업 본문" },
        handlerResponse: { kind: "list", text: "", items: [] },
      }),
    );
    // handlerResponse.text 가 falsy 이므로 legacy data.fileList 가 본문에 사용됨
    expect(out).toBe("🔍 검색\n\n백업 본문");
  });

  it("handlerResponse 미설정 (미마이그레이션 핸들러) 케이스: legacy 경로로 fallback", () => {
    // Phase 7-B 시점에 모든 5개 kind(list/report/text/error/confirmation) 활성화 완료.
    // 미마이그레이션 핸들러 시뮬레이션: handlerResponse 미설정 + data.briefing 있음 → legacy data.briefing 본문 사용.
    const out = formatReply(
      buildResult({
        response: "헤더",
        data: { briefing: "리포트 본문" },
        // handlerResponse 미설정 (Phase 6 시리즈 마이그레이션 전 핸들러 시뮬레이션)
      }),
    );
    expect(out).toBe("헤더\n\n리포트 본문");
  });

  it("legacy data.fileList 만 있는 (미마이그레이션) 핸들러 결과는 그대로 동작", () => {
    const out = formatReply(
      buildResult({
        response: "리스트",
        data: { fileList: "1. 📄 legacy.pdf" },
      }),
    );
    expect(out).toBe("리스트\n\n1. 📄 legacy.pdf");
  });
});

describe("formatReply — Phase 6-B HandlerResponse report 분기", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("kind=report + text → tradingTechnicalAnalysis 패턴 출력", () => {
    const briefing = "📊 RSI: 65\n📈 MACD: 상승\n💡 추천: 관망";
    const out = formatReply(
      buildResult({
        response: "BTC/USDT 기술적 지표 분석을 완료했습니다.",
        data: { analysis: { rsi: 65 }, briefing },
        handlerResponse: {
          kind: "report",
          text: briefing,
          meta: { symbol: "BTC/USDT", timeframe: "1h" },
        },
      }),
    );
    expect(out).toBe("BTC/USDT 기술적 지표 분석을 완료했습니다.\n\n" + briefing);
  });

  it("kind=report + text 가 legacy data.briefing 와 byte-for-byte 동일", () => {
    const baseResponse = "BTC 분석 완료";
    const briefing = "📊 RSI: 70";

    const legacy = formatReply(
      buildResult({
        response: baseResponse,
        data: { briefing },
      }),
    );
    const migrated = formatReply(
      buildResult({
        response: baseResponse,
        data: { briefing },
        handlerResponse: { kind: "report", text: briefing, meta: { symbol: "BTC" } },
      }),
    );
    expect(migrated).toBe(legacy);
  });

  it("kind=report + text 가 legacy data.report 와도 byte-for-byte 동일", () => {
    const baseResponse = "분석 결과";
    const reportBody = "📈 상세 리포트 본문";

    const legacy = formatReply(
      buildResult({
        response: baseResponse,
        data: { report: reportBody },
      }),
    );
    const migrated = formatReply(
      buildResult({
        response: baseResponse,
        data: { report: reportBody },
        handlerResponse: { kind: "report", text: reportBody },
      }),
    );
    expect(migrated).toBe(legacy);
  });

  it("kind=report + text 가 legacy data.summary 와도 byte-for-byte 동일", () => {
    const baseResponse = "요약 결과";
    const summaryBody = "📝 요약 본문";

    const legacy = formatReply(
      buildResult({
        response: baseResponse,
        data: { summary: summaryBody },
      }),
    );
    const migrated = formatReply(
      buildResult({
        response: baseResponse,
        data: { summary: summaryBody },
        handlerResponse: { kind: "report", text: summaryBody },
      }),
    );
    expect(migrated).toBe(legacy);
  });

  it("kind=report + text 빈 문자열 → tradingPreCheck 패턴 (response 만 출력, 본문 중복 없음)", () => {
    // tradingPreCheck/tradingReviewReport 처럼 본문이 response 안에 통째로 들어 있고
    // data.briefing/report/summary 가 없는 경우 → handlerResponse.text 비움 + legacy fallback 모두 빈 문자열
    // → 출력은 response 한 줄. 본문 중복 절대 없음.
    const fullReport = "🔍 진입 점검 결과\n📊 RSI: ...\n💡 추천: ...";
    const out = formatReply(
      buildResult({
        response: fullReport,
        handlerResponse: {
          kind: "report",
          text: "",
          meta: { symbol: "BTC", side: "long", entryPrice: 65000 },
        },
      }),
    );
    expect(out).toBe(fullReport);
    // 본문이 두 번 나타나지 않음 (중복 방어)
    const occurrences = out.split(fullReport).length - 1;
    expect(occurrences).toBe(1);
  });

  it("kind=report + text 빈 문자열 + legacy data.briefing 있으면 legacy 로 fallback", () => {
    const out = formatReply(
      buildResult({
        response: "헤더",
        data: { briefing: "백업 본문" },
        handlerResponse: { kind: "report", text: "", meta: { symbol: "BTC" } },
      }),
    );
    expect(out).toBe("헤더\n\n백업 본문");
  });

  it("kind=report + meta 필드는 사용자 응답에 절대 노출되지 않음", () => {
    const out = formatReply(
      buildResult({
        response: "분석 완료",
        data: { briefing: "리포트 본문" },
        handlerResponse: {
          kind: "report",
          text: "리포트 본문",
          meta: {
            symbol: "BTC/USDT",
            secretKey: "DO_NOT_LEAK",
            internalToken: "abc-123",
            apiKey: "should-never-appear",
          },
        },
      }),
    );
    expect(out).not.toContain("secretKey");
    expect(out).not.toContain("DO_NOT_LEAK");
    expect(out).not.toContain("internalToken");
    expect(out).not.toContain("abc-123");
    expect(out).not.toContain("apiKey");
    expect(out).not.toContain("should-never-appear");
    expect(out).not.toContain("BTC/USDT"); // meta.symbol 도 노출 금지
    expect(out).toBe("분석 완료\n\n리포트 본문");
  });

  it("kind=list 기존 테스트 회귀 없음 (Phase 6-A list 분기 정상 동작)", () => {
    const out = formatReply(
      buildResult({
        response: "📂 검색",
        data: { fileList: "1. 📄 a.pdf" },
        handlerResponse: { kind: "list", text: "1. 📄 a.pdf", items: ["1. 📄 a.pdf"] },
      }),
    );
    expect(out).toBe("📂 검색\n\n1. 📄 a.pdf");
  });

  it("kind=report + text 없음 (undefined) → legacy fallback", () => {
    const out = formatReply(
      buildResult({
        response: "헤더",
        data: { briefing: "본문" },
        handlerResponse: { kind: "report", text: undefined as unknown as string },
      }),
    );
    expect(out).toBe("헤더\n\n본문");
  });
});

describe("formatReply — Phase 6-C HandlerResponse text 분기", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("kind=text + 비어있지 않은 text → response 와 결합 (header\\n\\nbody 패턴)", () => {
    const out = formatReply(
      buildResult({
        response: "헤더",
        handlerResponse: { kind: "text", text: "본문" },
      }),
    );
    expect(out).toBe("헤더\n\n본문");
  });

  it("kind=text + 빈 text → legacy fallback (deals_command 마이그레이션 패턴)", () => {
    // 실제 deals_command 가 사용하는 패턴: response 안에 본문이 통째로 있고
    // handlerResponse.text="" 로 마커만 남김. data 도 비어 있어 legacy fallback 도
    // 빈 문자열 → 출력은 response 한 줄만.
    const fullBody = "✅ 딜 추가 완료\n📁 한남동644\n📂 카테고리 폴더 6개 생성됨";
    const out = formatReply(
      buildResult({
        response: fullBody,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "create", dealName: "한남동644" },
        },
      }),
    );
    expect(out).toBe(fullBody);
    // 본문 중복 방어
    const occurrences = out.split(fullBody).length - 1;
    expect(occurrences).toBe(1);
  });

  it("kind=text + meta 에 secret/internalToken/apiKey 가 있어도 사용자 응답에 절대 노출되지 않음", () => {
    const out = formatReply(
      buildResult({
        response: "딜 작업 완료",
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "create",
            internalToken: "secret-token-DO-NOT-LEAK",
            apiKey: "sk-DO-NOT-EXPOSE",
            secret: "password123",
            dealMeta: { id: "internal-uuid", path: "C:\\internal\\path" },
          },
        },
      }),
    );
    expect(out).toBe("딜 작업 완료");
    expect(out).not.toContain("internalToken");
    expect(out).not.toContain("secret-token");
    expect(out).not.toContain("DO-NOT-LEAK");
    expect(out).not.toContain("apiKey");
    expect(out).not.toContain("sk-DO-NOT-EXPOSE");
    expect(out).not.toContain("password123");
    expect(out).not.toContain("dealMeta");
    expect(out).not.toContain("internal-uuid");
    expect(out).not.toContain("C:\\internal");
  });

  it("kind=text + data 안에 raw object 가 있어도 [object Object]/JSON 미노출 + 한국어 안내", () => {
    const out = formatReply(
      buildResult({
        response: "딜 자료 처리",
        data: { method: "deals.internalRpc", params: { dealId: "X-123" } },
        handlerResponse: { kind: "text", text: "", meta: { action: "create" } },
      }),
    );
    expect(out).toContain("딜 자료 처리");
    expect(out).toContain("내부 데이터");
    expect(out).not.toContain("[object Object]");
    expect(out).not.toContain('"method"');
    expect(out).not.toContain("internalRpc");
    expect(out).not.toContain("X-123");
    expect(out).not.toContain("{");
  });

  it("kind=text + text 비어있지 않음 + data 가 raw object → text 우선 사용 (raw object 잠묵)", () => {
    // text 가 truthy 면 primaryBody=text 가 채택되어 fallbackBody=text 가 됨.
    // data.method 의 raw object 는 safeDisplayBody 에 닿지 않아 한국어 안내가
    // 노출되지 않음. 단, text 자체가 사용자 응답이므로 raw object 가 사용자에게
    // 보이지는 않음을 확인.
    const out = formatReply(
      buildResult({
        response: "딜 처리",
        data: { method: "deals.internalRpc" },
        handlerResponse: { kind: "text", text: "안전한 본문 텍스트" },
      }),
    );
    expect(out).toBe("딜 처리\n\n안전한 본문 텍스트");
    expect(out).not.toContain("internalRpc");
    expect(out).not.toContain("[object Object]");
  });

  it("kind=text + text 가 string 이 아니면 (방어적 체크) legacy fallback", () => {
    // typeof === "string" 가드 — text 가 객체로 잘못 들어와도 출력에 노출되지 않음
    const out = formatReply(
      buildResult({
        response: "헤더",
        data: { briefing: "백업 본문" },
        handlerResponse: {
          kind: "text",
          text: { malformed: true } as unknown as string,
        },
      }),
    );
    expect(out).toBe("헤더\n\n백업 본문");
    expect(out).not.toContain("malformed");
    expect(out).not.toContain("[object Object]");
    expect(out).not.toContain("{");
  });

  it("kind=list 회귀 검증 (Phase 6-A 정상 동작 유지)", () => {
    const out = formatReply(
      buildResult({
        response: "📂 검색",
        data: { fileList: "1. 📄 a.pdf" },
        handlerResponse: { kind: "list", text: "1. 📄 a.pdf", items: ["1. 📄 a.pdf"] },
      }),
    );
    expect(out).toBe("📂 검색\n\n1. 📄 a.pdf");
  });

  it("kind=report 회귀 검증 (Phase 6-B 정상 동작 유지)", () => {
    const briefing = "📊 RSI: 65";
    const out = formatReply(
      buildResult({
        response: "BTC 분석 완료",
        data: { briefing },
        handlerResponse: { kind: "report", text: briefing },
      }),
    );
    expect(out).toBe("BTC 분석 완료\n\n" + briefing);
  });

  it("kind=text 마이그레이션 핸들러와 미마이그레이션 핸들러 응답이 byte-for-byte 동일", () => {
    // 미마이그레이션: response 만 있고 data 없음
    const baseResponse = "✅ 딜 마감일 등록\n📁 한남동644\n📅 2026-12-31";
    const legacy = formatReply(buildResult({ response: baseResponse }));
    const migrated = formatReply(
      buildResult({
        response: baseResponse,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "deadline_set", dealName: "한남동644" },
        },
      }),
    );
    expect(migrated).toBe(legacy);
  });
});

describe("formatReply — Phase 6-D-1 realestate 마이그레이션 회귀", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("realestate_simple_feasibility 패턴: kind=report + text=report 가 legacy data.report 와 byte-for-byte 동일", () => {
    const reportBody = "📊 사업성 분석\n수익률: 15%\nIRR: 18%\nNPV: +50억";
    const baseResponse = "간단한 사업성 분석을 완료했습니다.";

    const legacy = formatReply(
      buildResult({
        response: baseResponse,
        data: { result: { irr: 18 }, report: reportBody },
      }),
    );
    const migrated = formatReply(
      buildResult({
        response: baseResponse,
        data: { result: { irr: 18 }, report: reportBody },
        handlerResponse: {
          kind: "report",
          text: reportBody,
          meta: { action: "simple_feasibility", projectName: "신규" },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(baseResponse + "\n\n" + reportBody);
  });

  it("realestate_feasibility 패턴: kind=report + text=report 가 legacy 와 byte-for-byte 동일", () => {
    const reportBody = "🏢 부동산 PF 사업성\n총사업비: 1500억\n수익률: 12%";
    // realestate.ts 의 response 는 인코딩 깨짐이 있어 byte-for-byte 보존
    const corruptedHeader = "?ъ뾽??遺꾩꽍???꾨즺?덉뒿?덈떎.";

    const legacy = formatReply(
      buildResult({
        response: corruptedHeader,
        data: { result: {}, report: reportBody },
      }),
    );
    const migrated = formatReply(
      buildResult({
        response: corruptedHeader,
        data: { result: {}, report: reportBody },
        handlerResponse: { kind: "report", text: reportBody, meta: { action: "feasibility" } },
      }),
    );
    expect(migrated).toBe(legacy);
  });

  it("realestate_land_use 패턴: kind=text + data.method raw object → '내부 데이터' 안내 그대로", () => {
    const out = formatReply(
      buildResult({
        response: "토지이용규제 정보를 조회했습니다.",
        data: { method: "realestate.landUse", params: { pnu: "1111010100-1-0001" } },
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "land_use", pnu: "1111010100-1-0001" },
        },
      }),
    );
    expect(out).toContain("토지이용규제 정보를 조회했습니다.");
    expect(out).toContain("내부 데이터");
    expect(out).not.toContain('"method"');
    expect(out).not.toContain("realestate.landUse");
    expect(out).not.toContain("1111010100");
    expect(out).not.toContain("{");
  });

  it("realestate_land_price 패턴: data.method raw object 차단 + meta.pnu/year 미노출", () => {
    const out = formatReply(
      buildResult({
        response: "공시지가 정보를 조회했습니다.",
        data: { method: "realestate.landPrice", params: { pnu: "1111010100-1-0001", year: "2025" } },
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "land_price", pnu: "1111010100-1-0001", year: "2025" },
        },
      }),
    );
    expect(out).toContain("공시지가 정보를 조회했습니다.");
    expect(out).toContain("내부 데이터");
    expect(out).not.toContain("realestate.landPrice");
    // meta 의 pnu/year 도 노출 금지 (formatReply 가 meta 를 절대 읽지 않음)
    expect(out).not.toContain("1111010100");
    expect(out).not.toContain("2025");
  });

  it("realestate_real_transaction 패턴: data.method raw object 차단", () => {
    const out = formatReply(
      buildResult({
        response: "실거래가 정보를 조회했습니다.",
        data: { method: "realestate.realTransaction", params: { regionCode: "11110", yearMonth: "202504" } },
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "real_transaction", regionCode: "11110", yearMonth: "202504" },
        },
      }),
    );
    expect(out).toContain("실거래가 정보를 조회했습니다.");
    expect(out).toContain("내부 데이터");
    expect(out).not.toContain("realTransaction");
    expect(out).not.toContain("11110");
    expect(out).not.toContain("202504");
  });

  it("realestate_portfolio_summary 패턴: data.summary 객체는 safeDisplayBody 로 빈 문자열 → response 만 출력", () => {
    const out = formatReply(
      buildResult({
        response: "PF 포트폴리오 요약을 조회했습니다.",
        data: { summary: { totalDeals: 5, totalLoan: 1500_0000_0000, ltv: 65 } },
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "portfolio_summary" },
        },
      }),
    );
    expect(out).toBe("PF 포트폴리오 요약을 조회했습니다.");
    expect(out).not.toContain("totalDeals");
    expect(out).not.toContain("totalLoan");
    expect(out).not.toContain("[object Object]");
  });

  it("realestate_add_deal 패턴: data.deal 객체는 빈 문자열로 처리 → response 만 출력", () => {
    const out = formatReply(
      buildResult({
        response: "PF 딜이 추가되었습니다.",
        data: { deal: { id: "deal-uuid", projectName: "강남PF", lenders: ["은행A", "은행B"] } },
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "add_deal", projectName: "강남PF" },
        },
      }),
    );
    expect(out).toBe("PF 딜이 추가되었습니다.");
    expect(out).not.toContain("deal-uuid");
    expect(out).not.toContain("은행A");
    expect(out).not.toContain("[object Object]");
  });

  it("realestate kind=text + meta 에 secret/internalToken 있어도 사용자 응답 미노출", () => {
    const out = formatReply(
      buildResult({
        response: "PF 딜 단계가 변경되었습니다.",
        data: { deal: { id: "d-1" } },
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "update_deal_stage",
            id: "d-1",
            internalToken: "secret-DO-NOT-LEAK",
            apiKey: "sk-realestate",
          },
        },
      }),
    );
    expect(out).toBe("PF 딜 단계가 변경되었습니다.");
    expect(out).not.toContain("secret-DO-NOT-LEAK");
    expect(out).not.toContain("sk-realestate");
    expect(out).not.toContain("internalToken");
  });

  it("기존 dealRouting.test.ts:91 raw object 차단 시나리오 (realestate_land_use) 회귀 없음", () => {
    // 미마이그레이션 입력 (data.method 만 있고 handlerResponse 없음)
    const legacy = formatReply(
      buildResult({
        response: "토지이용규제 정보를 조회했습니다.",
        data: { method: "realestate.landUse", params: { pnu: "test" } },
      }),
    );
    // 마이그레이션 입력 (handlerResponse 추가됨)
    const migrated = formatReply(
      buildResult({
        response: "토지이용규제 정보를 조회했습니다.",
        data: { method: "realestate.landUse", params: { pnu: "test" } },
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "land_use", pnu: "test" },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toContain("토지이용규제");
    expect(migrated).toContain("내부 데이터");
    expect(migrated).not.toContain('"method"');
    expect(migrated).not.toContain("{");
  });
});

describe("formatReply — Phase 6-D-2 finance 마이그레이션 회귀", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  // finance.ts 의 인코딩 깨진 응답 헤더는 byte-for-byte 보존되어야 한다.
  const FINANCE_HEADER = "DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.";

  it("finance_dart_disclosures 패턴: data.disclosures 배열 + kind=list + text='' → response 한 줄만 출력", () => {
    const out = formatReply(
      buildResult({
        response: FINANCE_HEADER,
        data: {
          corpCode: "00126380",
          startDate: "20250408",
          endDate: "20250508",
          disclosures: [
            { rceptNo: "20250508000001", reportNm: "주요사항보고서" },
            { rceptNo: "20250507000123", reportNm: "분기보고서" },
          ],
        },
        handlerResponse: {
          kind: "list",
          text: "",
          meta: {
            action: "dart_disclosures",
            corpCode: "00126380",
            startDate: "20250408",
            endDate: "20250508",
            disclosureCount: 2,
          },
        },
      }),
    );
    expect(out).toBe(FINANCE_HEADER);
    // disclosures 배열 내부 데이터가 사용자 응답에 절대 노출되지 않음
    expect(out).not.toContain("rceptNo");
    expect(out).not.toContain("20250508000001");
    expect(out).not.toContain("주요사항보고서");
    expect(out).not.toContain("[object Object]");
    expect(out).not.toContain("{");
  });

  it("finance_dart_disclosures 패턴: 미마이그레이션 vs 마이그레이션 byte-for-byte 동일", () => {
    const data = {
      corpCode: "00126380",
      startDate: "20250408",
      endDate: "20250508",
      disclosures: [{ rceptNo: "X", reportNm: "Y" }],
    };
    const legacy = formatReply(buildResult({ response: FINANCE_HEADER, data }));
    const migrated = formatReply(
      buildResult({
        response: FINANCE_HEADER,
        data,
        handlerResponse: {
          kind: "list",
          text: "",
          meta: { action: "dart_disclosures", corpCode: "00126380", disclosureCount: 1 },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(FINANCE_HEADER);
  });

  it("finance kind=list + 비어있지 않은 text 가 있다면 response\\n\\ntext 패턴 (향후 본문 포함 마이그레이션 대비)", () => {
    // 현재 finance 핸들러는 text="" 를 사용하지만, 향후 본문 추출 시 동작 검증
    const formattedList = "1. 📋 주요사항보고서 (20250508)\n2. 📋 분기보고서 (20250507)";
    const out = formatReply(
      buildResult({
        response: FINANCE_HEADER,
        data: { disclosures: [], fileList: formattedList },
        handlerResponse: { kind: "list", text: formattedList, items: formattedList.split("\n") },
      }),
    );
    expect(out).toBe(FINANCE_HEADER + "\n\n" + formattedList);
  });

  it("finance meta 에 apiKey/secret/token 이 있어도 사용자 응답에 절대 노출되지 않음", () => {
    const out = formatReply(
      buildResult({
        response: FINANCE_HEADER,
        data: { corpCode: "00126380", disclosures: [] },
        handlerResponse: {
          kind: "list",
          text: "",
          meta: {
            action: "dart_disclosures",
            apiKey: "DART-SECRET-KEY-DO-NOT-LEAK",
            internalToken: "internal-abc-123",
            secret: "password",
            corpCode: "00126380",
          },
        },
      }),
    );
    expect(out).toBe(FINANCE_HEADER);
    expect(out).not.toContain("DART-SECRET-KEY-DO-NOT-LEAK");
    expect(out).not.toContain("apiKey");
    expect(out).not.toContain("internalToken");
    expect(out).not.toContain("internal-abc-123");
    expect(out).not.toContain("secret");
    expect(out).not.toContain("password");
  });

  it("finance data.disclosures 가 빈 배열이어도 response 한 줄만 출력", () => {
    const out = formatReply(
      buildResult({
        response: FINANCE_HEADER,
        data: { corpCode: "00126380", startDate: "20250408", endDate: "20250508", disclosures: [] },
        handlerResponse: {
          kind: "list",
          text: "",
          meta: { action: "dart_disclosures", disclosureCount: 0 },
        },
      }),
    );
    expect(out).toBe(FINANCE_HEADER);
    expect(out).not.toContain("[]");
  });

  it("기존 google kind=list 회귀 없음 (Phase 6-A 정상 동작 유지)", () => {
    const out = formatReply(
      buildResult({
        response: "📂 검색",
        data: { fileList: "1. 📄 a.pdf" },
        handlerResponse: { kind: "list", text: "1. 📄 a.pdf", items: ["1. 📄 a.pdf"] },
      }),
    );
    expect(out).toBe("📂 검색\n\n1. 📄 a.pdf");
  });

  it("기존 trading kind=report 회귀 없음 (Phase 6-B 정상 동작 유지)", () => {
    const briefing = "📊 RSI: 65";
    const out = formatReply(
      buildResult({
        response: "BTC 분석 완료",
        data: { briefing },
        handlerResponse: { kind: "report", text: briefing },
      }),
    );
    expect(out).toBe("BTC 분석 완료\n\n" + briefing);
  });

  it("기존 deals kind=text 회귀 없음 (Phase 6-C 정상 동작 유지)", () => {
    const fullBody = "✅ 딜 추가 완료\n📁 한남동644";
    const out = formatReply(
      buildResult({
        response: fullBody,
        handlerResponse: { kind: "text", text: "", meta: { action: "create" } },
      }),
    );
    expect(out).toBe(fullBody);
  });

  it("기존 realestate kind=report 회귀 없음 (Phase 6-D-1 정상 동작 유지)", () => {
    const reportBody = "📊 사업성 분석 결과";
    const out = formatReply(
      buildResult({
        response: "간단한 사업성 분석을 완료했습니다.",
        data: { result: {}, report: reportBody },
        handlerResponse: { kind: "report", text: reportBody },
      }),
    );
    expect(out).toBe("간단한 사업성 분석을 완료했습니다.\n\n" + reportBody);
  });
});

describe("formatReply — Phase 6-D-3 intelligence 마이그레이션 회귀", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("intelligence_morning_briefing 분리형: kind=report + text=briefing 가 legacy data.briefing 와 byte-for-byte 동일", () => {
    const briefingBody = "🌅 모닝 브리핑\n📈 시장: KOSPI 2650 (+0.5%)\n📋 DART: 신규 공시 3건\n🛡 RiskGuard: 정상";
    const baseResponse = "모닝 브리핑을 발송했습니다.";
    const archivePath = "/tmp/2026-05-09-briefing.md";

    const legacy = formatReply(
      buildResult({
        response: baseResponse,
        data: { briefing: briefingBody, archivePath },
      }),
    );
    const migrated = formatReply(
      buildResult({
        response: baseResponse,
        data: { briefing: briefingBody, archivePath },
        handlerResponse: {
          kind: "report",
          text: briefingBody,
          meta: {
            action: "intelligence_morning_briefing",
            trigger: "manual",
            delivered: true,
            hasArchivePath: true,
            briefingLength: briefingBody.length,
          },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(baseResponse + "\n\n" + briefingBody);
  });

  it("intelligence_morning_briefing meta 값 사용자 응답 미노출 (archivePath/briefingLength 등)", () => {
    const out = formatReply(
      buildResult({
        response: "모닝 브리핑을 발송했습니다.",
        data: { briefing: "본문", archivePath: "/tmp/secret-path.md" },
        handlerResponse: {
          kind: "report",
          text: "본문",
          meta: {
            action: "intelligence_morning_briefing",
            hasArchivePath: true,
            briefingLength: 100,
            internalToken: "leak-DO-NOT-SHOW",
          },
        },
      }),
    );
    expect(out).toBe("모닝 브리핑을 발송했습니다.\n\n본문");
    expect(out).not.toContain("archivePath");
    expect(out).not.toContain("/tmp/secret-path.md");
    expect(out).not.toContain("briefingLength");
    expect(out).not.toContain("internalToken");
    expect(out).not.toContain("leak-DO-NOT-SHOW");
  });

  it("notebooklm_query 통합형(정상): kind=report + text='' → response 한 줄 (answer + sources 통합)", () => {
    const responseBody = "📓 NotebookLM 응답\n\n사업성 요약 내용...\n\n📎 출처\n1. https://notebooklm.google.com/notebook/abc";
    const data = {
      question: "한남동644 사업성 요약",
      answer: "사업성 요약 내용...",
      sources: ["https://notebooklm.google.com/notebook/abc"],
    };

    const legacy = formatReply(buildResult({ response: responseBody, data }));
    const migrated = formatReply(
      buildResult({
        response: responseBody,
        data,
        handlerResponse: {
          kind: "report",
          text: "",
          meta: {
            action: "notebooklm_query",
            hasQuestion: true,
            sourcesCount: 1,
            answerLength: 14,
          },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(responseBody);
    // data.question/answer/sources 가 사용자 응답에 별도 JSON 으로 노출되지 않음
    expect(migrated).not.toContain('"question"');
    expect(migrated).not.toContain('"answer"');
    expect(migrated).not.toContain("[object Object]");
  });

  it("notebooklm_query 질문 없음 분기: kind=text + text='' + 짧은 안내", () => {
    const guidance = "NotebookLM에 물어볼 질문을 함께 입력해주세요. 예: \"노트북 한남동644 사업성 요약\"";
    const out = formatReply(
      buildResult({
        response: guidance,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "notebooklm_query", hasQuestion: false },
        },
      }),
    );
    expect(out).toBe(guidance);
    // 본문 중복 방어
    const occurrences = out.split(guidance).length - 1;
    expect(occurrences).toBe(1);
  });

  it("monitoring_status 통합형(정상): kind=report + text='' → response 다중 라인 그대로", () => {
    const monitoringBody = [
      "🛰️ 시스템 모니터링",
      "",
      "⏱ 가동시간: 1d 2h 3m",
      "💾 메모리: RSS 512MB / Heap 256MB",
      "👥 활성 세션: 5",
      "",
      "🤖 LLM API 사용 현황",
      "• 총 호출: 100 (성공 95, 실패 5)",
      "• 성공률: 95%",
    ].join("\n");

    const out = formatReply(
      buildResult({
        response: monitoringBody,
        data: {
          uptimeSeconds: 93780,
          memoryRssMb: 512,
          heapUsedMb: 256,
          sessionCount: 5,
          apiUsage: {
            totalCalls: 100,
            successfulCalls: 95,
            failedCalls: 5,
            totalTokens: 50000,
            lastEngine: "gemini",
          },
        },
        handlerResponse: {
          kind: "report",
          text: "",
          meta: {
            action: "monitoring_status",
            status: "ok",
            sessionCount: 5,
            totalCalls: 100,
            successRate: 95,
            lastEngine: "gemini",
          },
        },
      }),
    );
    expect(out).toBe(monitoringBody);
    // data.apiUsage 객체가 사용자 응답에 raw 노출되지 않음
    expect(out).not.toContain('"totalCalls"');
    expect(out).not.toContain('"apiUsage"');
    expect(out).not.toContain("[object Object]");
    expect(out).not.toContain("successfulCalls");
  });

  it("monitoring_status 에러 분기: kind=text + text='' + 짧은 에러 한 줄", () => {
    const errorResponse = "🛰️ 모니터링 조회 실패: redis connection refused";
    const out = formatReply(
      buildResult({
        response: errorResponse,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "monitoring_status",
            status: "error",
            errorType: "Error",
          },
        },
      }),
    );
    expect(out).toBe(errorResponse);
    expect(out).not.toContain("errorType");
  });

  it("monitoring_status: data.apiUsage raw 객체 차단 동작 보존", () => {
    // 마이그레이션 전후 byte-for-byte 동일 검증
    const monitoringBody = "🛰️ 시스템 모니터링\n• 총 호출: 50";
    const data = {
      uptimeSeconds: 1000,
      apiUsage: {
        totalCalls: 50,
        secret: "DO-NOT-LEAK",
        apiKey: "sk-internal",
      },
    };

    const legacy = formatReply(buildResult({ response: monitoringBody, data }));
    const migrated = formatReply(
      buildResult({
        response: monitoringBody,
        data,
        handlerResponse: {
          kind: "report",
          text: "",
          meta: { action: "monitoring_status", status: "ok" },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(monitoringBody);
    expect(migrated).not.toContain("DO-NOT-LEAK");
    expect(migrated).not.toContain("sk-internal");
    expect(migrated).not.toContain("secret");
    expect(migrated).not.toContain("apiKey");
  });

  it("intelligence kind=report + meta apiKey/internalToken 사용자 응답 미노출", () => {
    const out = formatReply(
      buildResult({
        response: "모닝 브리핑을 발송했습니다.",
        data: { briefing: "본문", archivePath: "/x" },
        handlerResponse: {
          kind: "report",
          text: "본문",
          meta: {
            action: "intelligence_morning_briefing",
            apiKey: "GEMINI-KEY-LEAK",
            internalToken: "internal-xyz",
            secret: "password",
          },
        },
      }),
    );
    expect(out).toBe("모닝 브리핑을 발송했습니다.\n\n본문");
    expect(out).not.toContain("GEMINI-KEY-LEAK");
    expect(out).not.toContain("apiKey");
    expect(out).not.toContain("internal-xyz");
    expect(out).not.toContain("internalToken");
    expect(out).not.toContain("password");
  });

  it("기존 google/trading/deals/realestate/finance 회귀 없음 (5개 도메인 종합)", () => {
    // google list
    expect(
      formatReply(
        buildResult({
          response: "📂 검색",
          data: { fileList: "1. 📄 a.pdf" },
          handlerResponse: { kind: "list", text: "1. 📄 a.pdf" },
        }),
      ),
    ).toBe("📂 검색\n\n1. 📄 a.pdf");

    // trading report (briefing 미러)
    expect(
      formatReply(
        buildResult({
          response: "BTC 분석 완료",
          data: { briefing: "📊 RSI" },
          handlerResponse: { kind: "report", text: "📊 RSI" },
        }),
      ),
    ).toBe("BTC 분석 완료\n\n📊 RSI");

    // deals text (text="" 패턴)
    expect(
      formatReply(
        buildResult({
          response: "✅ 딜 추가 완료\n📁 한남동644",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ 딜 추가 완료\n📁 한남동644");

    // realestate report (분리형)
    expect(
      formatReply(
        buildResult({
          response: "간단한 사업성 분석을 완료했습니다.",
          data: { report: "📊 분석" },
          handlerResponse: { kind: "report", text: "📊 분석" },
        }),
      ),
    ).toBe("간단한 사업성 분석을 완료했습니다.\n\n📊 분석");

    // finance list (text="" + raw object)
    expect(
      formatReply(
        buildResult({
          response: "DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.",
          data: { corpCode: "00126380", disclosures: [{ rceptNo: "X" }] },
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.");
  });
});

describe("formatReply — Phase 6-D-4 wiki 마이그레이션 회귀", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("wiki_save 패턴: kind=text + text='' → response 한 줄, legacy 와 byte-for-byte 동일", () => {
    const saveResponse = "✅ Wiki 저장 완료\n📁 신논현 매물\n📂 #부동산";
    const legacy = formatReply(buildResult({ response: saveResponse }));
    const migrated = formatReply(
      buildResult({
        response: saveResponse,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "wiki_save", source: "telegram" },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(saveResponse);
  });

  it("wiki_search 패턴: kind=list + text='' → response 안의 검색 결과 list 그대로 출력", () => {
    const searchResponse = [
      "🔍 위키 검색: 신논현",
      "",
      "1. 📄 신논현_매물_2026.md (#부동산)",
      "2. 📄 신논현_시장조사.md (#리서치)",
      "3. 📄 신논현_PF_검토.md (#realestate)",
    ].join("\n");

    const legacy = formatReply(buildResult({ response: searchResponse }));
    const migrated = formatReply(
      buildResult({
        response: searchResponse,
        handlerResponse: {
          kind: "list",
          text: "",
          meta: { action: "wiki_search" },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(searchResponse);
  });

  it("wiki_search 빈 검색 결과 케이스: legacy 와 byte-for-byte 동일", () => {
    const emptyResponse = "🔍 위키 검색 결과가 없습니다.";
    const legacy = formatReply(buildResult({ response: emptyResponse }));
    const migrated = formatReply(
      buildResult({
        response: emptyResponse,
        handlerResponse: {
          kind: "list",
          text: "",
          meta: { action: "wiki_search" },
        },
      }),
    );
    expect(migrated).toBe(legacy);
  });

  it("wiki_auto_classify 정상 분기: kind=text + 다중 라인 통합형, 본문 중복 없음", () => {
    const successResponse = "✅ Wiki 자동 저장 완료\n📂 #realestate #신논현 #매물\n💬 신논현 신축 매물 시세 정리";
    const legacy = formatReply(buildResult({ response: successResponse }));
    const migrated = formatReply(
      buildResult({
        response: successResponse,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "wiki_auto_classify",
            hasContent: true,
            category: "realestate",
            tagsCount: 2,
            summaryLength: 18,
            contentLength: 230,
            source: "telegram-auto",
          },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(successResponse);
    // 본문 중복 방어
    const occurrences = migrated.split(successResponse).length - 1;
    expect(occurrences).toBe(1);
  });

  it("wiki_auto_classify 빈 내용 분기: kind=text + 짧은 안내", () => {
    const emptyMsg = "❌ 저장할 내용이 없습니다.";
    const out = formatReply(
      buildResult({
        response: emptyMsg,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "wiki_auto_classify", hasContent: false },
        },
      }),
    );
    expect(out).toBe(emptyMsg);
  });

  it("wiki_auto_classify 에러 분기: kind=text (error 활성화 금지) + 짧은 에러 메시지", () => {
    const errMsg = "❌ Wiki 자동 분류 저장에 실패했습니다.";
    const out = formatReply(
      buildResult({
        response: errMsg,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "wiki_auto_classify",
            status: "error",
            errorType: "Error",
          },
        },
      }),
    );
    expect(out).toBe(errMsg);
    expect(out).not.toContain("errorType");
    expect(out).not.toContain("status");
  });

  it("wiki kind=list + 비어있지 않은 text (향후 검색 결과 분리형 마이그레이션 대비)", () => {
    // 현재 wiki_search 는 text="" 사용하지만, 향후 검색 결과를 구조화해서
    // handlerResponse.text 에 본문을 넣는 패턴으로 발전 가능. 동작 검증.
    const header = "🔍 위키 검색: 신논현";
    const listBody = "1. 📄 신논현_매물.md\n2. 📄 신논현_PF.md";
    const out = formatReply(
      buildResult({
        response: header,
        handlerResponse: {
          kind: "list",
          text: listBody,
          items: listBody.split("\n"),
          meta: { action: "wiki_search" },
        },
      }),
    );
    expect(out).toBe(header + "\n\n" + listBody);
  });

  it("wiki meta 에 사용자 입력 원문/secret/apiKey 가 있어도 사용자 응답 미노출", () => {
    const out = formatReply(
      buildResult({
        response: "✅ Wiki 자동 저장 완료\n📂 #general\n💬 메모 요약",
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "wiki_auto_classify",
            hasContent: true,
            // 잠재적 노출 위험 키
            rawContent: "회장님 비밀 메모 원문 절대 노출 금지",
            apiKey: "GEMINI-LEAK",
            internalToken: "internal-xyz",
            secret: "password",
            uuid: "internal-uuid-001",
            path: "C:\\internal\\wiki\\path.md",
          },
        },
      }),
    );
    expect(out).toBe("✅ Wiki 자동 저장 완료\n📂 #general\n💬 메모 요약");
    expect(out).not.toContain("rawContent");
    expect(out).not.toContain("회장님 비밀 메모 원문");
    expect(out).not.toContain("GEMINI-LEAK");
    expect(out).not.toContain("apiKey");
    expect(out).not.toContain("internalToken");
    expect(out).not.toContain("internal-xyz");
    expect(out).not.toContain("uuid");
    expect(out).not.toContain("internal-uuid-001");
    expect(out).not.toContain("path");
    expect(out).not.toContain("C:\\internal");
  });

  it("기존 google/trading/deals/realestate/finance/intelligence 회귀 없음 (6개 도메인 종합)", () => {
    // google list
    expect(
      formatReply(
        buildResult({
          response: "📂 검색",
          data: { fileList: "1. 📄 a.pdf" },
          handlerResponse: { kind: "list", text: "1. 📄 a.pdf" },
        }),
      ),
    ).toBe("📂 검색\n\n1. 📄 a.pdf");

    // trading report
    expect(
      formatReply(
        buildResult({
          response: "BTC 분석 완료",
          data: { briefing: "📊 RSI" },
          handlerResponse: { kind: "report", text: "📊 RSI" },
        }),
      ),
    ).toBe("BTC 분석 완료\n\n📊 RSI");

    // deals text
    expect(
      formatReply(
        buildResult({
          response: "✅ 딜 추가 완료\n📁 한남동644",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ 딜 추가 완료\n📁 한남동644");

    // realestate report
    expect(
      formatReply(
        buildResult({
          response: "간단한 사업성 분석을 완료했습니다.",
          data: { report: "📊 분석" },
          handlerResponse: { kind: "report", text: "📊 분석" },
        }),
      ),
    ).toBe("간단한 사업성 분석을 완료했습니다.\n\n📊 분석");

    // finance list
    expect(
      formatReply(
        buildResult({
          response: "DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.",
          data: { disclosures: [{ rceptNo: "X" }] },
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.");

    // intelligence morning_briefing report (분리형)
    expect(
      formatReply(
        buildResult({
          response: "모닝 브리핑을 발송했습니다.",
          data: { briefing: "🌅 본문" },
          handlerResponse: { kind: "report", text: "🌅 본문" },
        }),
      ),
    ).toBe("모닝 브리핑을 발송했습니다.\n\n🌅 본문");
  });
});

describe("formatReply — Phase 6-D-5 chat 마이그레이션 회귀", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("chat_telegram_recent 정상 분기: kind=list + text='' + data.messages 객체 배열 raw 차단 → response 다중 라인 그대로", () => {
    const responseBody = [
      "💬 최근 Telegram 메시지 3건",
      "",
      "1. 05/09 09:30 👤 안녕하세요",
      "2. 05/09 09:31 🤖 무엇을 도와드릴까요?",
      "3. 05/09 09:32 👤 시장 브리핑 보여줘",
    ].join("\n");
    const data = {
      conversationId: 12345,
      messages: [
        { id: 1, role: "user", content: "안녕하세요", createdAt: new Date("2026-05-09T00:30:00Z") },
        { id: 2, role: "assistant", content: "무엇을 도와드릴까요?", createdAt: new Date("2026-05-09T00:31:00Z") },
        { id: 3, role: "user", content: "시장 브리핑 보여줘", createdAt: new Date("2026-05-09T00:32:00Z") },
      ],
    };

    const legacy = formatReply(buildResult({ response: responseBody, data }));
    const migrated = formatReply(
      buildResult({
        response: responseBody,
        data,
        handlerResponse: {
          kind: "list",
          text: "",
          meta: {
            action: "chat_telegram_recent",
            status: "ok",
            messageCount: 3,
            isEmpty: false,
            limit: 10,
            source: "telegram",
          },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(responseBody);
    // raw message 객체 필드 미노출 (내부 DB id, raw Date, conversationId)
    expect(migrated).not.toContain('"id"');
    expect(migrated).not.toContain('"role"');
    expect(migrated).not.toContain('"createdAt"');
    expect(migrated).not.toContain('"content"');
    expect(migrated).not.toContain("conversationId");
    expect(migrated).not.toContain("12345");
    expect(migrated).not.toContain("[object Object]");
    expect(migrated).not.toContain("{");
  });

  it("chat_telegram_recent 빈 메시지 분기: kind=list + text='' + data.messages=[] → response 한 줄", () => {
    const emptyMsg = "💬 동기화된 Telegram 메시지가 없습니다.";
    const legacy = formatReply(
      buildResult({
        response: emptyMsg,
        data: { messages: [] },
      }),
    );
    const migrated = formatReply(
      buildResult({
        response: emptyMsg,
        data: { messages: [] },
        handlerResponse: {
          kind: "list",
          text: "",
          meta: {
            action: "chat_telegram_recent",
            status: "ok",
            messageCount: 0,
            isEmpty: true,
            limit: 10,
          },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(emptyMsg);
    expect(migrated).not.toContain("[]");
  });

  it("chat_telegram_recent userId 미식별 분기: kind=text + 짧은 안내", () => {
    const guidance = "💬 사용자 식별이 안 되어 Telegram 메시지를 가져올 수 없습니다.";
    const out = formatReply(
      buildResult({
        response: guidance,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "chat_telegram_recent",
            status: "no_user_id",
            userIdValid: false,
          },
        },
      }),
    );
    expect(out).toBe(guidance);
  });

  it("chat_telegram_recent 에러 분기: kind=text (error 활성화 금지) + 짧은 에러 한 줄", () => {
    const errorResponse = "💬 Telegram 메시지 조회 실패: SQLITE_BUSY";
    const out = formatReply(
      buildResult({
        response: errorResponse,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "chat_telegram_recent",
            status: "error",
            errorType: "Error",
          },
        },
      }),
    );
    expect(out).toBe(errorResponse);
    expect(out).not.toContain("errorType");
    expect(out).not.toContain("status");
  });

  it("chat data.messages 안의 텔레그램 raw 필드(from.id/chat.id)가 있어도 사용자 응답 미노출", () => {
    // 가상의 케이스 — 향후 핸들러가 data 에 텔레그램 원본 객체를 통째로 넣더라도
    // formatReply 의 safeDisplayBody 가 차단하는지 검증
    const responseBody = "💬 최근 Telegram 메시지 1건\n\n1. 05/09 09:30 👤 메시지 본문";
    const out = formatReply(
      buildResult({
        response: responseBody,
        data: {
          messages: [
            {
              id: 999,
              from: { id: 12345678, username: "ceo_aston", first_name: "회장" },
              chat: { id: -1001234567890, type: "private" },
              text: "메시지 본문",
              date: 1715240400,
              message_id: 42,
            },
          ],
        },
        handlerResponse: {
          kind: "list",
          text: "",
          meta: { action: "chat_telegram_recent", status: "ok", messageCount: 1 },
        },
      }),
    );
    expect(out).toBe(responseBody);
    expect(out).not.toContain("from");
    expect(out).not.toContain("ceo_aston");
    expect(out).not.toContain("12345678");
    expect(out).not.toContain("-1001234567890");
    expect(out).not.toContain("message_id");
    expect(out).not.toContain("[object Object]");
  });

  it("chat meta 에 apiKey/secret/token/internalSession 이 있어도 사용자 응답 미노출", () => {
    const out = formatReply(
      buildResult({
        response: "💬 동기화된 Telegram 메시지가 없습니다.",
        data: { messages: [] },
        handlerResponse: {
          kind: "list",
          text: "",
          meta: {
            action: "chat_telegram_recent",
            apiKey: "TG-BOT-TOKEN-DO-NOT-LEAK",
            botToken: "1234567890:AAA-secret-bot-token",
            internalSession: "session-uuid-internal",
            sessionId: "sess-xyz-789",
            secret: "password",
            internal: { dbId: 12345, hash: "hash-leak" },
          },
        },
      }),
    );
    expect(out).toBe("💬 동기화된 Telegram 메시지가 없습니다.");
    expect(out).not.toContain("TG-BOT-TOKEN-DO-NOT-LEAK");
    expect(out).not.toContain("apiKey");
    expect(out).not.toContain("botToken");
    expect(out).not.toContain("AAA-secret-bot-token");
    expect(out).not.toContain("internalSession");
    expect(out).not.toContain("session-uuid-internal");
    expect(out).not.toContain("sessionId");
    expect(out).not.toContain("sess-xyz-789");
    expect(out).not.toContain("hash-leak");
    expect(out).not.toContain("dbId");
  });

  it("chat 정상 응답 lines 본문은 사용자에게 정상 노출 (response 안에 통합되어 있음)", () => {
    // raw 객체 차단은 data.messages 만이고, response 안의 사용자용 텍스트는
    // 정상적으로 사용자에게 노출되어야 함을 명시 검증
    const responseBody = "💬 최근 Telegram 메시지 2건\n\n1. 05/09 09:30 👤 시장 브리핑 보여줘\n2. 05/09 09:31 🤖 BTC 65000 상승";
    const out = formatReply(
      buildResult({
        response: responseBody,
        data: { conversationId: 1, messages: [{ id: 1, role: "user", content: "...", createdAt: new Date() }] },
        handlerResponse: {
          kind: "list",
          text: "",
          meta: { action: "chat_telegram_recent", status: "ok", messageCount: 2 },
        },
      }),
    );
    expect(out).toContain("시장 브리핑 보여줘");
    expect(out).toContain("BTC 65000 상승");
    expect(out).toContain("👤");
    expect(out).toContain("🤖");
    // 단, raw 메시지 객체 필드(id, role, content, createdAt 키 자체)는 미노출
    expect(out).not.toContain('"id":');
    expect(out).not.toContain('"createdAt":');
  });

  it("기존 google/trading/deals/realestate/finance/intelligence/wiki 회귀 없음 (7개 도메인 종합)", () => {
    // google list
    expect(
      formatReply(
        buildResult({
          response: "📂 검색",
          data: { fileList: "1. 📄 a.pdf" },
          handlerResponse: { kind: "list", text: "1. 📄 a.pdf" },
        }),
      ),
    ).toBe("📂 검색\n\n1. 📄 a.pdf");

    // trading report
    expect(
      formatReply(
        buildResult({
          response: "BTC 분석 완료",
          data: { briefing: "📊 RSI" },
          handlerResponse: { kind: "report", text: "📊 RSI" },
        }),
      ),
    ).toBe("BTC 분석 완료\n\n📊 RSI");

    // deals text
    expect(
      formatReply(
        buildResult({
          response: "✅ 딜 추가 완료\n📁 한남동644",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ 딜 추가 완료\n📁 한남동644");

    // realestate report
    expect(
      formatReply(
        buildResult({
          response: "간단한 사업성 분석을 완료했습니다.",
          data: { report: "📊 분석" },
          handlerResponse: { kind: "report", text: "📊 분석" },
        }),
      ),
    ).toBe("간단한 사업성 분석을 완료했습니다.\n\n📊 분석");

    // finance list
    expect(
      formatReply(
        buildResult({
          response: "DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.",
          data: { disclosures: [{ rceptNo: "X" }] },
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.");

    // intelligence morning_briefing report
    expect(
      formatReply(
        buildResult({
          response: "모닝 브리핑을 발송했습니다.",
          data: { briefing: "🌅 본문" },
          handlerResponse: { kind: "report", text: "🌅 본문" },
        }),
      ),
    ).toBe("모닝 브리핑을 발송했습니다.\n\n🌅 본문");

    // wiki text (text="")
    expect(
      formatReply(
        buildResult({
          response: "✅ Wiki 저장 완료\n📁 신논현 매물",
          handlerResponse: { kind: "text", text: "", meta: { action: "wiki_save" } },
        }),
      ),
    ).toBe("✅ Wiki 저장 완료\n📁 신논현 매물");
  });
});

describe("formatReply — Phase 6-D-6 agents 마이그레이션 회귀", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("agent_command 목록 sub-command: kind=list + text='' → response 통합형 그대로", () => {
    const listResponse = [
      "🤖 에이전트 상태",
      "🟢 OpenClaw: 실제 연동",
      "🧠 Gemini API: Aston 앱에 설정됨",
      "🛡 권한: 자동 실행 허용",
      "",
      "OpenClaw를 실행하면 자동 재탐지됩니다.",
      "",
      "📚 에이전트 템플릿",
      "- notebook-query: 노트북 질의",
      "  NotebookLM 노트북에 질문",
      "",
      "사용법: 에이전트 실행 <templateId> <대상>",
    ].join("\n");

    const legacy = formatReply(buildResult({ response: listResponse }));
    const migrated = formatReply(
      buildResult({
        response: listResponse,
        handlerResponse: {
          kind: "list",
          text: "",
          meta: { action: "agent_command", subCommand: "list" },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(listResponse);
  });

  it("agent_command 상태 sub-command: kind=list + 진행 중/최근 결과 list", () => {
    const statusResponse = [
      "🤖 에이전트 상태",
      "🟢 OpenClaw: 실제 연동",
      "",
      "## 진행 중",
      "- 🏃 진행 중 [task-001] 노트북 질의 · 한남동644",
      "",
      "## 최근 결과",
      "- ✅ 완료 [task-000] 시장 분석 · BTC",
    ].join("\n");

    const out = formatReply(
      buildResult({
        response: statusResponse,
        handlerResponse: {
          kind: "list",
          text: "",
          meta: { action: "agent_command", subCommand: "status" },
        },
      }),
    );
    expect(out).toBe(statusResponse);
  });

  it("agent_command 결과 sub-command (found): kind=text + 단일 작업 결과", () => {
    const resultResponse = [
      "🤖 노트북 질의",
      "🆔 task-001",
      "상태: ✅ 완료",
      "🎯 한남동644",
      "⏱ 12.3초",
      "🗂 /wiki/agents/task-001.md",
      "",
      "미리보기",
      "한남동644 PF 사업성 분석 결과...",
    ].join("\n");

    const out = formatReply(
      buildResult({
        response: resultResponse,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "agent_command",
            subCommand: "result",
            taskId: "task-001",
            status: "found",
          },
        },
      }),
    );
    expect(out).toBe(resultResponse);
  });

  it("agent_command 결과 sub-command (not_found): kind=text + 짧은 안내", () => {
    const notFoundMsg = "🚫 작업을 찾지 못했습니다: task-999";
    const out = formatReply(
      buildResult({
        response: notFoundMsg,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "agent_command",
            subCommand: "result",
            taskId: "task-999",
            status: "not_found",
          },
        },
      }),
    );
    expect(out).toBe(notFoundMsg);
  });

  it("agent_command 실행 등록 성공: kind=text + 헤더 + 결과 안내 통합형", () => {
    const enqueueResponse = [
      "🤖 에이전트 작업 등록",
      "📋 노트북 질의",
      "🆔 task-002",
      "🎯 강남PF",
      "",
      "🤖 에이전트 상태",
      "🟢 OpenClaw: 실제 연동",
      "",
      "OpenClaw를 실행하면 자동 재탐지됩니다.",
      "",
      "결과 확인: 에이전트 결과 task-002",
    ].join("\n");

    const out = formatReply(
      buildResult({
        response: enqueueResponse,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "agent_command",
            subCommand: "execute",
            taskId: "task-002",
            templateId: "notebook-query",
            status: "queued",
          },
        },
      }),
    );
    expect(out).toBe(enqueueResponse);
  });

  it("agent_command 실행 실패: kind=text (error 활성화 금지) + meta.status='error'", () => {
    const errorResponse = "🚫 작업 등록 실패: queue full";
    const out = formatReply(
      buildResult({
        response: errorResponse,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "agent_command",
            subCommand: "execute",
            status: "error",
            errorType: "Error",
          },
        },
      }),
    );
    expect(out).toBe(errorResponse);
    expect(out).not.toContain("errorType");
    expect(out).not.toContain("status");
  });

  it("agent_command help fallthrough: kind=text + 사용법 다중 라인", () => {
    const helpResponse = "⚠️ 사용법\n- 에이전트 목록\n- 에이전트 실행 <templateId> <대상>\n- 에이전트 상태\n- 에이전트 결과 <task_id>\n- 에이전트 취소 <task_id>";
    const out = formatReply(
      buildResult({
        response: helpResponse,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "agent_command", subCommand: "help" },
        },
      }),
    );
    expect(out).toBe(helpResponse);
  });

  it("agent meta 에 jobId/sessionId/apiKey/secret/internal 노출 위험 키 다수 → 사용자 응답 미노출", () => {
    const out = formatReply(
      buildResult({
        response: "🤖 에이전트 작업 등록\n📋 노트북 질의\n🆔 task-003",
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "agent_command",
            subCommand: "execute",
            taskId: "task-003",
            // 노출 위험 키 다수
            jobId: "openclaw-job-internal-001",
            sessionId: "session-DO-NOT-LEAK",
            apiKey: "OPENCLAW-API-KEY-LEAK",
            openclawToken: "Bearer secret-token-xyz",
            internalState: { phase: "running", workerId: "worker-internal" },
            secret: "password",
          },
        },
      }),
    );
    expect(out).toBe("🤖 에이전트 작업 등록\n📋 노트북 질의\n🆔 task-003");
    expect(out).not.toContain("jobId");
    expect(out).not.toContain("openclaw-job-internal-001");
    expect(out).not.toContain("sessionId");
    expect(out).not.toContain("session-DO-NOT-LEAK");
    expect(out).not.toContain("apiKey");
    expect(out).not.toContain("OPENCLAW-API-KEY-LEAK");
    expect(out).not.toContain("openclawToken");
    expect(out).not.toContain("Bearer secret-token-xyz");
    expect(out).not.toContain("internalState");
    expect(out).not.toContain("workerId");
    expect(out).not.toContain("worker-internal");
    expect(out).not.toContain("phase");
  });

  it("agent execution result raw 객체가 향후 data 에 들어가도 차단 (방어 시나리오)", () => {
    // 현재 핸들러는 data 미설정이지만, 향후 핸들러가 OpenClaw 응답 객체를 data 에
    // 그대로 넣을 가능성 대비 단위 테스트로 차단 동작 검증
    const out = formatReply(
      buildResult({
        response: "🤖 에이전트 작업 등록\n📋 노트북 질의",
        data: {
          execution: {
            jobId: "openclaw-internal-job-001",
            agent: { sessionId: "sess-abc", token: "leak-token" },
            state: { phase: "running" },
            result: "raw OpenClaw output",
          },
        },
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "agent_command", subCommand: "execute" },
        },
      }),
    );
    expect(out).toBe("🤖 에이전트 작업 등록\n📋 노트북 질의");
    expect(out).not.toContain("execution");
    expect(out).not.toContain("openclaw-internal-job-001");
    expect(out).not.toContain("sess-abc");
    expect(out).not.toContain("leak-token");
    expect(out).not.toContain("raw OpenClaw output");
    expect(out).not.toContain("[object Object]");
  });

  it("기존 google/trading/deals/realestate/finance/intelligence/wiki/chat 회귀 없음 (8개 도메인 종합)", () => {
    // google list
    expect(
      formatReply(
        buildResult({
          response: "📂 검색",
          data: { fileList: "1. 📄 a.pdf" },
          handlerResponse: { kind: "list", text: "1. 📄 a.pdf" },
        }),
      ),
    ).toBe("📂 검색\n\n1. 📄 a.pdf");

    // trading report
    expect(
      formatReply(
        buildResult({
          response: "BTC 분석 완료",
          data: { briefing: "📊 RSI" },
          handlerResponse: { kind: "report", text: "📊 RSI" },
        }),
      ),
    ).toBe("BTC 분석 완료\n\n📊 RSI");

    // deals text
    expect(
      formatReply(
        buildResult({
          response: "✅ 딜 추가 완료\n📁 한남동644",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ 딜 추가 완료\n📁 한남동644");

    // realestate report
    expect(
      formatReply(
        buildResult({
          response: "간단한 사업성 분석을 완료했습니다.",
          data: { report: "📊 분석" },
          handlerResponse: { kind: "report", text: "📊 분석" },
        }),
      ),
    ).toBe("간단한 사업성 분석을 완료했습니다.\n\n📊 분석");

    // finance list
    expect(
      formatReply(
        buildResult({
          response: "DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.",
          data: { disclosures: [{ rceptNo: "X" }] },
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.");

    // intelligence morning_briefing report
    expect(
      formatReply(
        buildResult({
          response: "모닝 브리핑을 발송했습니다.",
          data: { briefing: "🌅 본문" },
          handlerResponse: { kind: "report", text: "🌅 본문" },
        }),
      ),
    ).toBe("모닝 브리핑을 발송했습니다.\n\n🌅 본문");

    // wiki text
    expect(
      formatReply(
        buildResult({
          response: "✅ Wiki 저장 완료\n📁 신논현 매물",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ Wiki 저장 완료\n📁 신논현 매물");

    // chat list (정상 분기)
    expect(
      formatReply(
        buildResult({
          response: "💬 최근 Telegram 메시지 1건\n\n1. 05/09 09:30 👤 메시지",
          data: { conversationId: 1, messages: [{ id: 1, role: "user", content: "메시지", createdAt: new Date() }] },
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("💬 최근 Telegram 메시지 1건\n\n1. 05/09 09:30 👤 메시지");
  });
});

describe("formatReply — Phase 6-D-7 approval 마이그레이션 회귀", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("trading_approval_list 빈 큐: kind=list + text='' → 안내 한 줄", () => {
    const emptyMsg = "📋 승인 큐가 비어있습니다.";
    const legacy = formatReply(buildResult({ response: emptyMsg }));
    const migrated = formatReply(
      buildResult({
        response: emptyMsg,
        handlerResponse: {
          kind: "list",
          text: "",
          meta: {
            action: "trading_approval_list",
            queueLength: 0,
            isEmpty: true,
          },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(emptyMsg);
  });

  it("trading_approval_list 항목 있음: kind=list + 본문 통합, byte-for-byte 동일", () => {
    const listResponse = [
      "📋 승인 큐 (최근 10건)",
      "━━━━━━━━━━━━",
      "• abc12345 KRW-BTC 매수 50,000원 → pending",
      "• def67890 KRW-ETH 매도 0.001 코인 → expired",
    ].join("\n");

    const legacy = formatReply(buildResult({ response: listResponse }));
    const migrated = formatReply(
      buildResult({
        response: listResponse,
        handlerResponse: {
          kind: "list",
          text: "",
          meta: {
            action: "trading_approval_list",
            queueLength: 2,
            isEmpty: false,
          },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(listResponse);
  });

  it("trading_buy_signal 한도 초과 (kind=text + meta.status='limit_exceeded')", () => {
    const limitMsg = "🚫 단일 주문 한도(500,000원)를 초과합니다. 요청: 1,000,000원";
    const out = formatReply(
      buildResult({
        response: limitMsg,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "trading_buy_signal",
            status: "limit_exceeded",
            market: "KRW-BTC",
            requestedKrw: 1000000,
            maxOrderKrw: 500000,
          },
        },
      }),
    );
    expect(out).toBe(limitMsg);
    expect(out).not.toContain("limit_exceeded");
    expect(out).not.toContain("requestedKrw");
  });

  it("trading_buy_signal 검토 모드 (kind=report + 긴 리뷰 리포트 + text=''): byte-for-byte 동일", () => {
    const reviewBody = [
      "🔍 매매 검토 리포트",
      "📊 BTC 롱 포지션",
      "💰 50,000원",
      "📈 시장 분석: 단기 상승 추세",
      "⚠️ Risk Guard: 정상",
      "",
      "현재 검토 모드입니다. 실주문은 실행되지 않습니다.",
    ].join("\n");

    const legacy = formatReply(buildResult({ response: reviewBody }));
    const migrated = formatReply(
      buildResult({
        response: reviewBody,
        handlerResponse: {
          kind: "report",
          text: "",
          meta: {
            action: "trading_buy_signal",
            status: "review_mode",
            market: "KRW-BTC",
            amountKrw: 50000,
          },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(reviewBody);
  });

  it("trading_buy_signal 발송 성공 (kind=text + 안내)", () => {
    const dispatchedMsg = "📡 매수 신호 발송 — 텔레그램에서 승인 버튼을 눌러주세요.\n종목: KRW-BTC / 금액: 50,000원";
    const out = formatReply(
      buildResult({
        response: dispatchedMsg,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "trading_buy_signal",
            status: "dispatched",
            market: "KRW-BTC",
            amountKrw: 50000,
            approvalIdPrefix: "abc12345",
            hasMessageId: true,
          },
        },
      }),
    );
    expect(out).toBe(dispatchedMsg);
    // approvalIdPrefix 는 response 안에도 표시되지 않음 (이 분기 response 형식 기준)
    expect(out).not.toContain("approvalIdPrefix");
    expect(out).not.toContain("dispatched");
  });

  it("trading_buy_signal 발송 실패 (kind=text + meta.status='dispatch_warning')", () => {
    const warningMsg = "📡 매수 신호 큐 등록 (id=abc12345)\n⚠️ Telegram 봇이 초기화되지 않아 알림을 발송하지 못했습니다.";
    const out = formatReply(
      buildResult({
        response: warningMsg,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "trading_buy_signal",
            status: "dispatch_warning",
            market: "KRW-BTC",
            amountKrw: 50000,
            approvalIdPrefix: "abc12345",
            hasMessageId: false,
          },
        },
      }),
    );
    expect(out).toBe(warningMsg);
    expect(out).not.toContain("dispatch_warning");
  });

  it("trading_sell_signal 수량 부정확 (kind=text + meta.status='invalid_volume')", () => {
    const invalidMsg = "🚫 매도 수량이 올바르지 않습니다.";
    const out = formatReply(
      buildResult({
        response: invalidMsg,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "trading_sell_signal",
            status: "invalid_volume",
            market: "KRW-BTC",
            volume: 0,
          },
        },
      }),
    );
    expect(out).toBe(invalidMsg);
  });

  it("approval queue raw object 가 향후 data 에 들어가도 차단 (방어 시나리오)", () => {
    // 현재 핸들러는 data 미설정이지만, 향후 핸들러가 ApprovalRequest 객체 배열을
    // data 에 그대로 넣을 가능성 대비 차단 동작 검증
    const out = formatReply(
      buildResult({
        response: "📋 승인 큐 (최근 10건)\n━━━━━━━━━━━━\n• abc12345 KRW-BTC 매수 50,000원 → pending",
        data: {
          approvals: [
            {
              id: "abc12345-full-uuid-internal-DO-NOT-LEAK",
              market: "KRW-BTC",
              side: "bid",
              amountKrw: 50000,
              reason: "수동 트리거",
              status: "pending",
              createdAt: 1715240400,
              expiresAt: 1715241000,
              requesterId: 12345678,
              messageId: 999,
            },
          ],
        },
        handlerResponse: {
          kind: "list",
          text: "",
          meta: {
            action: "trading_approval_list",
            queueLength: 1,
            isEmpty: false,
          },
        },
      }),
    );
    expect(out).toBe("📋 승인 큐 (최근 10건)\n━━━━━━━━━━━━\n• abc12345 KRW-BTC 매수 50,000원 → pending");
    expect(out).not.toContain("abc12345-full-uuid-internal-DO-NOT-LEAK");
    expect(out).not.toContain("requesterId");
    expect(out).not.toContain("12345678");
    expect(out).not.toContain("messageId");
    expect(out).not.toContain("expiresAt");
    expect(out).not.toContain("[object Object]");
  });

  it("approval meta 에 apiKey/secret/sessionId/internal/requesterId 노출 위험 키 → 사용자 응답 미노출", () => {
    const out = formatReply(
      buildResult({
        response: "📡 매수 신호 발송 — 텔레그램에서 승인 버튼을 눌러주세요.\n종목: KRW-BTC / 금액: 50,000원",
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "trading_buy_signal",
            status: "dispatched",
            market: "KRW-BTC",
            // 노출 위험 키 다수
            apiKey: "UPBIT-API-KEY-LEAK",
            secret: "UPBIT-SECRET-DO-NOT-LEAK",
            sessionId: "session-internal-001",
            requesterId: 12345678,
            internalUuid: "approval-full-uuid-DO-NOT-LEAK",
            botToken: "1234567890:AAA-bot-token-secret",
            internal: { workerId: "worker-int-1", queueDepth: 5 },
          },
        },
      }),
    );
    expect(out).toBe("📡 매수 신호 발송 — 텔레그램에서 승인 버튼을 눌러주세요.\n종목: KRW-BTC / 금액: 50,000원");
    expect(out).not.toContain("UPBIT-API-KEY-LEAK");
    expect(out).not.toContain("apiKey");
    expect(out).not.toContain("UPBIT-SECRET");
    expect(out).not.toContain("secret");
    expect(out).not.toContain("sessionId");
    expect(out).not.toContain("session-internal-001");
    expect(out).not.toContain("requesterId");
    expect(out).not.toContain("12345678");
    expect(out).not.toContain("internalUuid");
    expect(out).not.toContain("approval-full-uuid");
    expect(out).not.toContain("botToken");
    expect(out).not.toContain("AAA-bot-token");
    expect(out).not.toContain("workerId");
    expect(out).not.toContain("queueDepth");
  });

  it("기존 9개 도메인 회귀 없음 (google/trading/deals/realestate/finance/intelligence/wiki/chat/agents)", () => {
    // google list
    expect(
      formatReply(
        buildResult({
          response: "📂 검색",
          data: { fileList: "1. 📄 a.pdf" },
          handlerResponse: { kind: "list", text: "1. 📄 a.pdf" },
        }),
      ),
    ).toBe("📂 검색\n\n1. 📄 a.pdf");

    // trading report
    expect(
      formatReply(
        buildResult({
          response: "BTC 분석 완료",
          data: { briefing: "📊 RSI" },
          handlerResponse: { kind: "report", text: "📊 RSI" },
        }),
      ),
    ).toBe("BTC 분석 완료\n\n📊 RSI");

    // deals text
    expect(
      formatReply(
        buildResult({
          response: "✅ 딜 추가 완료\n📁 한남동644",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ 딜 추가 완료\n📁 한남동644");

    // realestate report
    expect(
      formatReply(
        buildResult({
          response: "간단한 사업성 분석을 완료했습니다.",
          data: { report: "📊 분석" },
          handlerResponse: { kind: "report", text: "📊 분석" },
        }),
      ),
    ).toBe("간단한 사업성 분석을 완료했습니다.\n\n📊 분석");

    // finance list
    expect(
      formatReply(
        buildResult({
          response: "DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.",
          data: { disclosures: [{ rceptNo: "X" }] },
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.");

    // intelligence morning_briefing report
    expect(
      formatReply(
        buildResult({
          response: "모닝 브리핑을 발송했습니다.",
          data: { briefing: "🌅 본문" },
          handlerResponse: { kind: "report", text: "🌅 본문" },
        }),
      ),
    ).toBe("모닝 브리핑을 발송했습니다.\n\n🌅 본문");

    // wiki text
    expect(
      formatReply(
        buildResult({
          response: "✅ Wiki 저장 완료\n📁 신논현 매물",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ Wiki 저장 완료\n📁 신논현 매물");

    // chat list
    expect(
      formatReply(
        buildResult({
          response: "💬 최근 Telegram 메시지 1건\n\n1. 05/09 09:30 👤 메시지",
          data: { conversationId: 1, messages: [{ id: 1, role: "user", content: "메시지", createdAt: new Date() }] },
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("💬 최근 Telegram 메시지 1건\n\n1. 05/09 09:30 👤 메시지");

    // agents list (목록 sub-command)
    expect(
      formatReply(
        buildResult({
          response: "🤖 에이전트 상태\n\n📚 에이전트 템플릿\n- notebook-query: 노트북 질의",
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("🤖 에이전트 상태\n\n📚 에이전트 템플릿\n- notebook-query: 노트북 질의");
  });
});

describe("formatReply — Phase 6-D-8 knowledgePipeline 마이그레이션 회귀", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("tg_pipeline_capture 저장 성공: kind=text + text='' + data 객체 raw 차단 → response 통합형 그대로", () => {
    const successResponse = "✅ Wiki 저장 완료\n📂 #hannam-644\n💬 인허가 5/15 신청\n📁 projects/hannam-644/notes/2026-05-09T01-00-00Z.md";
    const data = {
      saved_path: "projects/hannam-644/notes/2026-05-09T01-00-00Z.md",
      was_skipped: false,
      quality: "complete",
      step_failures: [],
    };

    const legacy = formatReply(buildResult({ response: successResponse, data }));
    const migrated = formatReply(
      buildResult({
        response: successResponse,
        data,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "tg_pipeline_capture",
            status: "saved",
            wasSkipped: false,
            quality: "complete",
            routingMode: "project",
            hasTitle: true,
            stepFailureCount: 0,
          },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(successResponse);
    // saved_path 는 response 안에 이미 노출되어 있고 그 외 data 키는 미노출
    expect(migrated).not.toContain('"was_skipped"');
    expect(migrated).not.toContain('"quality"');
    expect(migrated).not.toContain('"step_failures"');
    expect(migrated).not.toContain("[object Object]");
  });

  it("tg_pipeline_capture skip 케이스: kind=text + skipNote 통합형", () => {
    const skipResponse = "✅ Wiki 저장 완료 (이미 저장된 동일 메모 — skip)\n📂 #hannam-644\n💬 동일 메모\n📁 projects/hannam-644/notes/dup.md";
    const out = formatReply(
      buildResult({
        response: skipResponse,
        data: { saved_path: "projects/hannam-644/notes/dup.md", was_skipped: true, quality: "complete", step_failures: [] },
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "tg_pipeline_capture",
            status: "saved",
            wasSkipped: true,
            quality: "complete",
            routingMode: "project",
            hasTitle: true,
            stepFailureCount: 0,
          },
        },
      }),
    );
    expect(out).toBe(skipResponse);
  });

  it("tg_pipeline_capture suggested 라우팅: kind=text + 안내 통합형", () => {
    const suggestedResponse = [
      "✅ Wiki 저장 완료",
      "📂 inbox/_suggested/#hannam-644",
      "💡 /tg #hannam-644 를 붙이면 projects/hannam-644/notes/에 직접 저장됩니다",
      "💬 한남동 인허가",
      "📁 inbox/_suggested/hannam-644/2026-05-09T01-00-00Z.md",
    ].join("\n");
    const out = formatReply(
      buildResult({
        response: suggestedResponse,
        data: { saved_path: "inbox/_suggested/hannam-644/2026-05-09T01-00-00Z.md", was_skipped: false, quality: "partial", step_failures: ["category"] },
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "tg_pipeline_capture",
            status: "saved",
            wasSkipped: false,
            quality: "partial",
            routingMode: "suggested",
            hasTitle: true,
            stepFailureCount: 1,
          },
        },
      }),
    );
    expect(out).toBe(suggestedResponse);
  });

  it("tg_pipeline_capture 저장 실패 (pending 큐): kind=text (error 활성화 금지) + meta.status='error'", () => {
    const failResponse = "⚠️ Wiki 저장 실패 — pending 큐에 보관됨 (pending/2026-05-09T01-00-00Z.json)";
    const out = formatReply(
      buildResult({
        response: failResponse,
        data: { pending_path: "pending/2026-05-09T01-00-00Z.json" },
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "tg_pipeline_capture",
            status: "error",
            stage: "pipeline_run",
          },
        },
      }),
    );
    expect(out).toBe(failResponse);
    expect(out).not.toContain("stage");
    expect(out).not.toContain('"pending_path"');
  });

  it("tg_pipeline_capture 빈 본문: kind=text + meta.status='empty_text'", () => {
    const emptyMsg = "❌ /tg 본문이 비어 있습니다.";
    const out = formatReply(
      buildResult({
        response: emptyMsg,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "tg_pipeline_capture", status: "empty_text" },
        },
      }),
    );
    expect(out).toBe(emptyMsg);
  });

  it("tg_pipeline_capture 명령만 있는 경우: kind=text + meta.status='missing_body'", () => {
    const missingMsg = "❌ /tg 명령에 본문이 없습니다. 예: /tg #hannam-644 인허가 5/15 신청";
    const out = formatReply(
      buildResult({
        response: missingMsg,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "tg_pipeline_capture", status: "missing_body" },
        },
      }),
    );
    expect(out).toBe(missingMsg);
  });

  it("knowledge raw 텔레그램 메시지 객체가 향후 data 에 들어가도 차단 (방어 시나리오)", () => {
    // 현재 핸들러는 chat_id/message_id/from 같은 텔레그램 원본 객체를 data 에
    // 넣지 않지만, 향후 추가될 가능성 대비 차단 동작 검증
    const out = formatReply(
      buildResult({
        response: "✅ Wiki 저장 완료\n📂 #hannam-644\n📁 projects/hannam-644/notes/x.md",
        data: {
          saved_path: "projects/hannam-644/notes/x.md",
          was_skipped: false,
          // 가상의 raw 텔레그램 정보
          telegram: {
            chat_id: -1001234567890,
            message_id: 42,
            from: { id: 12345678, username: "ceo_aston", first_name: "회장" },
            date: 1715240400,
          },
        },
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "tg_pipeline_capture", status: "saved" },
        },
      }),
    );
    expect(out).toBe("✅ Wiki 저장 완료\n📂 #hannam-644\n📁 projects/hannam-644/notes/x.md");
    expect(out).not.toContain("chat_id");
    expect(out).not.toContain("-1001234567890");
    expect(out).not.toContain("ceo_aston");
    expect(out).not.toContain("12345678");
    expect(out).not.toContain("message_id");
    expect(out).not.toContain("[object Object]");
  });

  it("knowledge wiki frontmatter/uuid/rawMarkdown 가 향후 data 에 들어가도 차단", () => {
    // wikiStore 내부 구조가 data 로 노출되지 않는지 방어 시나리오
    const out = formatReply(
      buildResult({
        response: "✅ Wiki 저장 완료\n📂 #hannam-644\n📁 projects/hannam-644/notes/x.md",
        data: {
          saved_path: "projects/hannam-644/notes/x.md",
          // 가상의 wiki 내부 구조
          frontmatter: {
            uuid: "internal-uuid-abc-123",
            categories: ["realestate", "hannam-644"],
            absolutePath: "C:\\Users\\internal\\path.md",
          },
          rawMarkdown: "# 제목\n\n# 내부 마크다운 raw\n## 절대 노출 금지",
        },
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "tg_pipeline_capture", status: "saved" },
        },
      }),
    );
    expect(out).toBe("✅ Wiki 저장 완료\n📂 #hannam-644\n📁 projects/hannam-644/notes/x.md");
    expect(out).not.toContain("frontmatter");
    expect(out).not.toContain("internal-uuid-abc-123");
    expect(out).not.toContain("absolutePath");
    expect(out).not.toContain("C:\\Users\\internal");
    expect(out).not.toContain("rawMarkdown");
    expect(out).not.toContain("내부 마크다운 raw");
    expect(out).not.toContain("절대 노출 금지");
  });

  it("knowledge meta 에 apiKey/secret/botToken/sessionId/internal 노출 위험 키 → 사용자 응답 미노출", () => {
    const out = formatReply(
      buildResult({
        response: "✅ Wiki 저장 완료\n📂 #hannam-644\n📁 projects/hannam-644/notes/x.md",
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "tg_pipeline_capture",
            status: "saved",
            // 노출 위험 키 다수
            apiKey: "GEMINI-API-KEY-LEAK",
            secret: "wiki-secret-DO-NOT-LEAK",
            botToken: "1234567890:AAA-bot-token-secret",
            sessionId: "session-internal-xyz",
            internalUserId: 12345678,
            internalPath: "C:\\Users\\internal\\wiki-store",
            sourceRefRaw: "tg:user:1:hash:abc123def456",
          },
        },
      }),
    );
    expect(out).toBe("✅ Wiki 저장 완료\n📂 #hannam-644\n📁 projects/hannam-644/notes/x.md");
    expect(out).not.toContain("GEMINI-API-KEY-LEAK");
    expect(out).not.toContain("apiKey");
    expect(out).not.toContain("wiki-secret");
    expect(out).not.toContain("secret");
    expect(out).not.toContain("botToken");
    expect(out).not.toContain("AAA-bot-token");
    expect(out).not.toContain("sessionId");
    expect(out).not.toContain("session-internal-xyz");
    expect(out).not.toContain("internalUserId");
    expect(out).not.toContain("12345678");
    expect(out).not.toContain("internalPath");
    expect(out).not.toContain("C:\\Users\\internal");
    expect(out).not.toContain("sourceRefRaw");
    expect(out).not.toContain("hash:abc123def456");
  });

  it("기존 10개 도메인 회귀 없음 (google/trading/deals/realestate/finance/intelligence/wiki/chat/agents/approval)", () => {
    // google list
    expect(
      formatReply(
        buildResult({
          response: "📂 검색",
          data: { fileList: "1. 📄 a.pdf" },
          handlerResponse: { kind: "list", text: "1. 📄 a.pdf" },
        }),
      ),
    ).toBe("📂 검색\n\n1. 📄 a.pdf");

    // trading report
    expect(
      formatReply(
        buildResult({
          response: "BTC 분석 완료",
          data: { briefing: "📊 RSI" },
          handlerResponse: { kind: "report", text: "📊 RSI" },
        }),
      ),
    ).toBe("BTC 분석 완료\n\n📊 RSI");

    // deals text
    expect(
      formatReply(
        buildResult({
          response: "✅ 딜 추가 완료\n📁 한남동644",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ 딜 추가 완료\n📁 한남동644");

    // realestate report
    expect(
      formatReply(
        buildResult({
          response: "간단한 사업성 분석을 완료했습니다.",
          data: { report: "📊 분석" },
          handlerResponse: { kind: "report", text: "📊 분석" },
        }),
      ),
    ).toBe("간단한 사업성 분석을 완료했습니다.\n\n📊 분석");

    // finance list
    expect(
      formatReply(
        buildResult({
          response: "DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.",
          data: { disclosures: [{ rceptNo: "X" }] },
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.");

    // intelligence morning_briefing report
    expect(
      formatReply(
        buildResult({
          response: "모닝 브리핑을 발송했습니다.",
          data: { briefing: "🌅 본문" },
          handlerResponse: { kind: "report", text: "🌅 본문" },
        }),
      ),
    ).toBe("모닝 브리핑을 발송했습니다.\n\n🌅 본문");

    // wiki text
    expect(
      formatReply(
        buildResult({
          response: "✅ Wiki 저장 완료\n📁 신논현 매물",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ Wiki 저장 완료\n📁 신논현 매물");

    // chat list
    expect(
      formatReply(
        buildResult({
          response: "💬 최근 Telegram 메시지 1건\n\n1. 05/09 09:30 👤 메시지",
          data: { conversationId: 1, messages: [{ id: 1, role: "user", content: "메시지", createdAt: new Date() }] },
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("💬 최근 Telegram 메시지 1건\n\n1. 05/09 09:30 👤 메시지");

    // agents list
    expect(
      formatReply(
        buildResult({
          response: "🤖 에이전트 상태\n\n📚 에이전트 템플릿\n- notebook-query: 노트북 질의",
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("🤖 에이전트 상태\n\n📚 에이전트 템플릿\n- notebook-query: 노트북 질의");

    // approval list (빈 큐)
    expect(
      formatReply(
        buildResult({
          response: "📋 승인 큐가 비어있습니다.",
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("📋 승인 큐가 비어있습니다.");
  });
});

describe("formatReply — Phase 6-D-9 notebooklm 마이그레이션 회귀", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("nb_command 정상: kind=text + text='' (handleNbCommand 결과 통합형)", () => {
    const responseBody = [
      "📓 NotebookLM 매핑 (28건)",
      "",
      "• `hannam-644` — 한남동 644 PF",
      "• `gangnam-pf` — 강남 PF",
      "• `mongolia-mining` — 몽골 광산",
    ].join("\n");

    const legacy = formatReply(buildResult({ response: responseBody }));
    const migrated = formatReply(
      buildResult({
        response: responseBody,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "nb_command", rawLength: 8 },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(responseBody);
  });

  it("nb_save 저장 성공: kind=text + data 객체 raw 차단 → byte-for-byte 동일", () => {
    const successResponse = [
      "✅ NotebookLM 회수 완료",
      "📓 한남동 644 PF",
      "💬 사업성 분석 요약",
      "📁 projects/hannam-644/notebooklm/2026-05-09T01-00-00Z.md",
    ].join("\n");
    const data = {
      saved_path: "projects/hannam-644/notebooklm/2026-05-09T01-00-00Z.md",
      was_skipped: false,
      quality: "complete",
    };

    const legacy = formatReply(buildResult({ response: successResponse, data }));
    const migrated = formatReply(
      buildResult({
        response: successResponse,
        data,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "nb_save",
            status: "saved",
            project: "hannam-644",
            wasSkipped: false,
            quality: "complete",
            hasTitle: true,
            bodyLength: 250,
          },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(successResponse);
    expect(migrated).not.toContain('"was_skipped"');
    expect(migrated).not.toContain('"quality"');
    expect(migrated).not.toContain("[object Object]");
  });

  it("nb_save 형식 오류: kind=text + meta.status='invalid_format'", () => {
    const errorResponse = [
      "❌ 형식 오류. 올바른 형식:",
      "```",
      "/nb save {project-id}",
      "NotebookLM 답변 본문...",
      "```",
      "project-id 목록: `/nb list`",
    ].join("\n");
    const out = formatReply(
      buildResult({
        response: errorResponse,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "nb_save", status: "invalid_format", rawLength: 0 },
        },
      }),
    );
    expect(out).toBe(errorResponse);
    expect(out).not.toContain("invalid_format");
    expect(out).not.toContain("rawLength");
  });

  it("nb_save project 없음: kind=text + meta.status='project_not_found' + suggestionCount", () => {
    const notFoundResponse = [
      "❌ project `hannam` 없음.",
      "유사 항목:",
      "• `hannam-644` — 한남동 644 PF",
      "• `hannam-545` — 한남동 545 매물",
    ].join("\n");
    const out = formatReply(
      buildResult({
        response: notFoundResponse,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "nb_save",
            status: "project_not_found",
            requestedProject: "hannam",
            suggestionCount: 2,
          },
        },
      }),
    );
    expect(out).toBe(notFoundResponse);
    expect(out).not.toContain("project_not_found");
    expect(out).not.toContain("suggestionCount");
    expect(out).not.toContain("requestedProject");
  });

  it("nb_save 저장 실패 (pending 큐): kind=text (error 활성화 금지) + meta.status='error'", () => {
    const failResponse = "⚠️ Wiki 저장 실패 — pending 큐에 보관됨\n📁 pending/2026-05-09T01-00-00Z.json";
    const out = formatReply(
      buildResult({
        response: failResponse,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "nb_save",
            status: "error",
            stage: "pipeline_run",
            project: "hannam-644",
          },
        },
      }),
    );
    expect(out).toBe(failResponse);
    expect(out).not.toContain("stage");
    expect(out).not.toContain("status");
  });

  it("meet_save 저장 성공 (참석자 포함): kind=text + 다중 라인 통합형", () => {
    const meetResponse = [
      "✅ 회의록 저장 완료",
      "📂 한남동 644 PF",
      "👥 참석자: 회장, 김부장, 이대리",
      "💬 인허가 진행 회의",
      "📁 projects/hannam-644/meetings/2026-05-09T01-00-00Z.md",
    ].join("\n");
    const data = {
      saved_path: "projects/hannam-644/meetings/2026-05-09T01-00-00Z.md",
      was_skipped: false,
      quality: "complete",
    };

    const legacy = formatReply(buildResult({ response: meetResponse, data }));
    const migrated = formatReply(
      buildResult({
        response: meetResponse,
        data,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "meet_save",
            status: "saved",
            project: "hannam-644",
            wasSkipped: false,
            quality: "complete",
            hasTitle: true,
            attendeesCount: 3,
            bodyLength: 500,
          },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(meetResponse);
    // 참석자 이름은 response 안에 의도적으로 노출되어 있어 사용자 가치 있음
    expect(migrated).toContain("회장, 김부장, 이대리");
    // attendeesCount 등 meta 키는 미노출
    expect(migrated).not.toContain("attendeesCount");
    expect(migrated).not.toContain("bodyLength");
  });

  it("kakao_paste 저장 성공 (chatRoom 포함): kind=text + 다중 라인 통합형", () => {
    const kakaoResponse = [
      "✅ 카톡 회수 완료 (quality: partial)",
      "📂 한남동 644 PF",
      "💬 출처: PF사업단톡",
      "📝 인허가 일정 협의",
      "📁 projects/hannam-644/kakao/2026-05-09T01-00-00Z.md",
    ].join("\n");
    const data = {
      saved_path: "projects/hannam-644/kakao/2026-05-09T01-00-00Z.md",
      was_skipped: false,
      quality: "partial",
    };

    const legacy = formatReply(buildResult({ response: kakaoResponse, data }));
    const migrated = formatReply(
      buildResult({
        response: kakaoResponse,
        data,
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "kakao_paste",
            status: "saved",
            project: "hannam-644",
            wasSkipped: false,
            quality: "partial",
            hasTitle: true,
            hasChatRoom: true,
            bodyLength: 800,
          },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(kakaoResponse);
    expect(migrated).toContain("PF사업단톡");
    expect(migrated).not.toContain("hasChatRoom");
    expect(migrated).not.toContain("hasTitle");
    expect(migrated).not.toContain("bodyLength");
  });

  it("notebooklm raw 카카오 메시지 객체가 향후 data 에 들어가도 차단 (방어 시나리오)", () => {
    // 현재 핸들러는 카톡 raw 메시지 객체를 data 에 넣지 않지만, 향후 추가 가능성 대비
    const out = formatReply(
      buildResult({
        response: "✅ 카톡 회수 완료\n📂 한남동 644 PF\n📁 projects/hannam-644/kakao/x.md",
        data: {
          saved_path: "projects/hannam-644/kakao/x.md",
          // 가상의 카카오 raw 메시지 객체
          kakaoRaw: {
            chatRoomId: -1001234567890,
            messageId: 42,
            from: { id: 12345678, username: "ceo_aston", first_name: "회장" },
            text: "PF 진행 상황 공유합니다.",
            date: 1715240400,
          },
        },
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "kakao_paste", status: "saved" },
        },
      }),
    );
    expect(out).toBe("✅ 카톡 회수 완료\n📂 한남동 644 PF\n📁 projects/hannam-644/kakao/x.md");
    expect(out).not.toContain("kakaoRaw");
    expect(out).not.toContain("chatRoomId");
    expect(out).not.toContain("-1001234567890");
    expect(out).not.toContain("ceo_aston");
    expect(out).not.toContain("12345678");
    expect(out).not.toContain("PF 진행 상황 공유");
    expect(out).not.toContain("[object Object]");
  });

  it("notebooklm wiki frontmatter/uuid/rawMarkdown/internalPath 차단 (방어 시나리오)", () => {
    const out = formatReply(
      buildResult({
        response: "✅ NotebookLM 회수 완료\n📓 한남동 644 PF\n📁 projects/hannam-644/notebooklm/x.md",
        data: {
          saved_path: "projects/hannam-644/notebooklm/x.md",
          // 가상의 wiki 내부 구조
          frontmatter: {
            uuid: "internal-uuid-DO-NOT-LEAK-001",
            categories: ["realestate", "hannam-644"],
            absolutePath: "C:\\Users\\internal\\wiki\\projects\\hannam-644\\notebooklm\\x.md",
          },
          rawMarkdown: "# 비밀 제목\n\n## 내부 마크다운 본문\n절대 노출 금지",
          internalPath: "/var/lib/aston/internal/path",
        },
        handlerResponse: {
          kind: "text",
          text: "",
          meta: { action: "nb_save", status: "saved" },
        },
      }),
    );
    expect(out).toBe("✅ NotebookLM 회수 완료\n📓 한남동 644 PF\n📁 projects/hannam-644/notebooklm/x.md");
    expect(out).not.toContain("frontmatter");
    expect(out).not.toContain("internal-uuid-DO-NOT-LEAK-001");
    expect(out).not.toContain("absolutePath");
    expect(out).not.toContain("C:\\Users\\internal");
    expect(out).not.toContain("rawMarkdown");
    expect(out).not.toContain("비밀 제목");
    expect(out).not.toContain("절대 노출 금지");
    expect(out).not.toContain("internalPath");
    expect(out).not.toContain("/var/lib/aston");
  });

  it("notebooklm meta apiKey/secret/botToken/사용자 입력 원문/sessionId 미노출", () => {
    const out = formatReply(
      buildResult({
        response: "✅ NotebookLM 회수 완료\n📓 한남동 644 PF\n📁 projects/hannam-644/notebooklm/x.md",
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "nb_save",
            status: "saved",
            project: "hannam-644",
            // 노출 위험 키 다수
            apiKey: "GEMINI-API-KEY-LEAK",
            secret: "wiki-secret-DO-NOT-LEAK",
            botToken: "1234567890:AAA-bot-token-secret",
            sessionId: "session-internal-xyz",
            internalUserId: 12345678,
            // 사용자 입력 원문 (저장 안 되어야 하지만 방어 시나리오)
            rawBody: "회장님 비밀 NotebookLM 답변 원문 절대 노출 금지",
            attendeeNames: ["회장", "김부장"],
            chatRoomName: "PF사업단톡",
            sourceRefRaw: "nb:hannam-644:user:1:hash:abc123def456",
          },
        },
      }),
    );
    expect(out).toBe("✅ NotebookLM 회수 완료\n📓 한남동 644 PF\n📁 projects/hannam-644/notebooklm/x.md");
    expect(out).not.toContain("GEMINI-API-KEY-LEAK");
    expect(out).not.toContain("apiKey");
    expect(out).not.toContain("secret");
    expect(out).not.toContain("botToken");
    expect(out).not.toContain("AAA-bot-token");
    expect(out).not.toContain("sessionId");
    expect(out).not.toContain("session-internal-xyz");
    expect(out).not.toContain("internalUserId");
    expect(out).not.toContain("12345678");
    expect(out).not.toContain("rawBody");
    expect(out).not.toContain("회장님 비밀");
    expect(out).not.toContain("attendeeNames");
    expect(out).not.toContain("김부장");
    expect(out).not.toContain("chatRoomName");
    expect(out).not.toContain("PF사업단톡");
    expect(out).not.toContain("sourceRefRaw");
    expect(out).not.toContain("hash:abc123def456");
  });

  it("기존 11개 도메인 회귀 없음 (Phase 6-D 시리즈 종합)", () => {
    // google list
    expect(
      formatReply(
        buildResult({
          response: "📂 검색",
          data: { fileList: "1. 📄 a.pdf" },
          handlerResponse: { kind: "list", text: "1. 📄 a.pdf" },
        }),
      ),
    ).toBe("📂 검색\n\n1. 📄 a.pdf");

    // trading report
    expect(
      formatReply(
        buildResult({
          response: "BTC 분석 완료",
          data: { briefing: "📊 RSI" },
          handlerResponse: { kind: "report", text: "📊 RSI" },
        }),
      ),
    ).toBe("BTC 분석 완료\n\n📊 RSI");

    // deals text
    expect(
      formatReply(
        buildResult({
          response: "✅ 딜 추가 완료\n📁 한남동644",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ 딜 추가 완료\n📁 한남동644");

    // realestate report
    expect(
      formatReply(
        buildResult({
          response: "간단한 사업성 분석을 완료했습니다.",
          data: { report: "📊 분석" },
          handlerResponse: { kind: "report", text: "📊 분석" },
        }),
      ),
    ).toBe("간단한 사업성 분석을 완료했습니다.\n\n📊 분석");

    // finance list
    expect(
      formatReply(
        buildResult({
          response: "DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.",
          data: { disclosures: [{ rceptNo: "X" }] },
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.");

    // intelligence morning_briefing report
    expect(
      formatReply(
        buildResult({
          response: "모닝 브리핑을 발송했습니다.",
          data: { briefing: "🌅 본문" },
          handlerResponse: { kind: "report", text: "🌅 본문" },
        }),
      ),
    ).toBe("모닝 브리핑을 발송했습니다.\n\n🌅 본문");

    // wiki text
    expect(
      formatReply(
        buildResult({
          response: "✅ Wiki 저장 완료\n📁 신논현 매물",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ Wiki 저장 완료\n📁 신논현 매물");

    // chat list
    expect(
      formatReply(
        buildResult({
          response: "💬 최근 Telegram 메시지 1건\n\n1. 05/09 09:30 👤 메시지",
          data: { conversationId: 1, messages: [{ id: 1, role: "user", content: "메시지", createdAt: new Date() }] },
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("💬 최근 Telegram 메시지 1건\n\n1. 05/09 09:30 👤 메시지");

    // agents list
    expect(
      formatReply(
        buildResult({
          response: "🤖 에이전트 상태\n\n📚 에이전트 템플릿\n- notebook-query: 노트북 질의",
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("🤖 에이전트 상태\n\n📚 에이전트 템플릿\n- notebook-query: 노트북 질의");

    // approval list
    expect(
      formatReply(
        buildResult({
          response: "📋 승인 큐가 비어있습니다.",
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("📋 승인 큐가 비어있습니다.");

    // knowledgePipeline text (저장 성공)
    expect(
      formatReply(
        buildResult({
          response: "✅ Wiki 저장 완료\n📂 #hannam-644\n📁 projects/hannam-644/notes/x.md",
          data: { saved_path: "projects/hannam-644/notes/x.md", was_skipped: false, quality: "complete", step_failures: [] },
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ Wiki 저장 완료\n📂 #hannam-644\n📁 projects/hannam-644/notes/x.md");
  });
});

describe("formatReply — Phase 7-A kind='error' 분기 활성화 회귀", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("kind=error + 비어있지 않은 text → 기존 kind=text 와 byte-for-byte 동일 (response\\n\\ntext)", () => {
    const baseResponse = "헤더";
    const body = "본문 텍스트";

    const textKind = formatReply(
      buildResult({
        response: baseResponse,
        handlerResponse: { kind: "text", text: body },
      }),
    );
    const errorKind = formatReply(
      buildResult({
        response: baseResponse,
        handlerResponse: { kind: "error", text: body },
      }),
    );
    expect(errorKind).toBe(textKind);
    expect(errorKind).toBe(baseResponse + "\n\n" + body);
  });

  it("kind=error + text='' → legacy fallback 동작 (response 한 줄)", () => {
    const errorMsg = "🚫 작업 등록 실패: queue full";
    const out = formatReply(
      buildResult({
        response: errorMsg,
        handlerResponse: {
          kind: "error",
          text: "",
          meta: { action: "agent_command", status: "error", errorType: "Error" },
        },
      }),
    );
    expect(out).toBe(errorMsg);
  });

  it("kind=error + meta status/apiKey/secret/token/internal 사용자 응답 미노출", () => {
    const out = formatReply(
      buildResult({
        response: "🚫 단일 주문 한도(500,000원)를 초과합니다. 요청: 1,000,000원",
        handlerResponse: {
          kind: "error",
          text: "",
          meta: {
            action: "trading_buy_signal",
            status: "limit_exceeded",
            apiKey: "UPBIT-API-KEY-LEAK",
            secret: "secret-DO-NOT-LEAK",
            token: "Bearer leak-token",
            internalUuid: "internal-001",
            sessionId: "session-internal-xyz",
          },
        },
      }),
    );
    expect(out).toBe("🚫 단일 주문 한도(500,000원)를 초과합니다. 요청: 1,000,000원");
    expect(out).not.toContain("limit_exceeded");
    expect(out).not.toContain("apiKey");
    expect(out).not.toContain("UPBIT-API-KEY-LEAK");
    expect(out).not.toContain("secret-DO-NOT-LEAK");
    expect(out).not.toContain("token");
    expect(out).not.toContain("Bearer leak-token");
    expect(out).not.toContain("internalUuid");
    expect(out).not.toContain("sessionId");
  });

  it("deals unknown action 패턴 byte-for-byte 동일 (kind=text→error 변경 후)", () => {
    const unknownMsg = "⚠️ 알 수 없는 딜 명령입니다.";
    const legacy = formatReply(buildResult({ response: unknownMsg }));
    const migrated = formatReply(
      buildResult({
        response: unknownMsg,
        handlerResponse: {
          kind: "error",
          text: "",
          meta: { action: "unknown", reason: "no matching pattern" },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(unknownMsg);
  });

  it("agents not_found 패턴 byte-for-byte 동일", () => {
    const notFoundMsg = "🚫 작업을 찾지 못했습니다: task-999";
    const legacy = formatReply(buildResult({ response: notFoundMsg }));
    const migrated = formatReply(
      buildResult({
        response: notFoundMsg,
        handlerResponse: {
          kind: "error",
          text: "",
          meta: {
            action: "agent_command",
            subCommand: "result",
            taskId: "task-999",
            status: "not_found",
          },
        },
      }),
    );
    expect(migrated).toBe(legacy);
  });

  it("approval limit_exceeded 패턴 byte-for-byte 동일", () => {
    const limitMsg = "🚫 단일 주문 한도(500,000원)를 초과합니다. 요청: 1,000,000원";
    const legacy = formatReply(buildResult({ response: limitMsg }));
    const migrated = formatReply(
      buildResult({
        response: limitMsg,
        handlerResponse: {
          kind: "error",
          text: "",
          meta: {
            action: "trading_buy_signal",
            status: "limit_exceeded",
            market: "KRW-BTC",
          },
        },
      }),
    );
    expect(migrated).toBe(legacy);
  });

  it("approval invalid_volume 패턴 byte-for-byte 동일", () => {
    const invalidMsg = "🚫 매도 수량이 올바르지 않습니다.";
    const out = formatReply(
      buildResult({
        response: invalidMsg,
        handlerResponse: {
          kind: "error",
          text: "",
          meta: { action: "trading_sell_signal", status: "invalid_volume" },
        },
      }),
    );
    expect(out).toBe(invalidMsg);
  });

  it("knowledgePipeline empty_text 패턴 byte-for-byte 동일", () => {
    const emptyMsg = "❌ /tg 본문이 비어 있습니다.";
    const out = formatReply(
      buildResult({
        response: emptyMsg,
        handlerResponse: {
          kind: "error",
          text: "",
          meta: { action: "tg_pipeline_capture", status: "empty_text" },
        },
      }),
    );
    expect(out).toBe(emptyMsg);
  });

  it("knowledgePipeline missing_body 패턴 byte-for-byte 동일", () => {
    const missingMsg = "❌ /tg 명령에 본문이 없습니다. 예: /tg #hannam-644 인허가 5/15 신청";
    const out = formatReply(
      buildResult({
        response: missingMsg,
        handlerResponse: {
          kind: "error",
          text: "",
          meta: { action: "tg_pipeline_capture", status: "missing_body" },
        },
      }),
    );
    expect(out).toBe(missingMsg);
  });

  it("knowledgePipeline pipeline error 패턴 byte-for-byte 동일", () => {
    const failMsg = "⚠️ Wiki 저장 실패 — pending 큐에 보관됨 (pending/x.json)";
    const out = formatReply(
      buildResult({
        response: failMsg,
        data: { pending_path: "pending/x.json" },
        handlerResponse: {
          kind: "error",
          text: "",
          meta: {
            action: "tg_pipeline_capture",
            status: "error",
            stage: "pipeline_run",
          },
        },
      }),
    );
    expect(out).toBe(failMsg);
  });

  it("notebooklm invalid_format 패턴 byte-for-byte 동일", () => {
    const formatErr = [
      "❌ 형식 오류. 올바른 형식:",
      "```",
      "/nb save {project-id}",
      "NotebookLM 답변 본문...",
      "```",
      "project-id 목록: `/nb list`",
    ].join("\n");
    const out = formatReply(
      buildResult({
        response: formatErr,
        handlerResponse: {
          kind: "error",
          text: "",
          meta: { action: "nb_save", status: "invalid_format", rawLength: 0 },
        },
      }),
    );
    expect(out).toBe(formatErr);
  });

  it("notebooklm project_not_found 패턴 byte-for-byte 동일", () => {
    const notFoundMsg = [
      "❌ project `hannam` 없음.",
      "유사 항목:",
      "• `hannam-644` — 한남동 644 PF",
    ].join("\n");
    const out = formatReply(
      buildResult({
        response: notFoundMsg,
        handlerResponse: {
          kind: "error",
          text: "",
          meta: {
            action: "meet_save",
            status: "project_not_found",
            requestedProject: "hannam",
            suggestionCount: 1,
          },
        },
      }),
    );
    expect(out).toBe(notFoundMsg);
  });

  it("notebooklm error 패턴 byte-for-byte 동일", () => {
    const failMsg = "⚠️ 카톡 회수 실패 — pending 큐에 보관됨\n📁 pending/x.json";
    const out = formatReply(
      buildResult({
        response: failMsg,
        handlerResponse: {
          kind: "error",
          text: "",
          meta: {
            action: "kakao_paste",
            status: "error",
            stage: "pipeline_run",
            project: "hannam-644",
          },
        },
      }),
    );
    expect(out).toBe(failMsg);
  });

  it("기존 list/report/text 분기 회귀 없음 (Phase 6-A/6-B/6-C 정상 동작 유지)", () => {
    // list
    expect(
      formatReply(
        buildResult({
          response: "📂 검색",
          handlerResponse: { kind: "list", text: "1. 📄 a.pdf" },
        }),
      ),
    ).toBe("📂 검색\n\n1. 📄 a.pdf");

    // report
    expect(
      formatReply(
        buildResult({
          response: "BTC 분석 완료",
          handlerResponse: { kind: "report", text: "📊 RSI" },
        }),
      ),
    ).toBe("BTC 분석 완료\n\n📊 RSI");

    // text
    expect(
      formatReply(
        buildResult({
          response: "✅ 완료",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ 완료");
  });

  it("11개 도메인 종합 회귀 (kind=error 활성화 후에도 정상 동작)", () => {
    // google list
    expect(
      formatReply(
        buildResult({
          response: "📂 검색",
          data: { fileList: "1. 📄 a.pdf" },
          handlerResponse: { kind: "list", text: "1. 📄 a.pdf" },
        }),
      ),
    ).toBe("📂 검색\n\n1. 📄 a.pdf");

    // trading report
    expect(
      formatReply(
        buildResult({
          response: "BTC 분석 완료",
          data: { briefing: "📊 RSI" },
          handlerResponse: { kind: "report", text: "📊 RSI" },
        }),
      ),
    ).toBe("BTC 분석 완료\n\n📊 RSI");

    // deals text (정상)
    expect(
      formatReply(
        buildResult({
          response: "✅ 딜 추가 완료\n📁 한남동644",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ 딜 추가 완료\n📁 한남동644");

    // deals error (Phase 7-A 재분류, unknown action)
    expect(
      formatReply(
        buildResult({
          response: "⚠️ 알 수 없는 명령",
          handlerResponse: { kind: "error", text: "" },
        }),
      ),
    ).toBe("⚠️ 알 수 없는 명령");

    // realestate report
    expect(
      formatReply(
        buildResult({
          response: "간단한 사업성 분석을 완료했습니다.",
          data: { report: "📊 분석" },
          handlerResponse: { kind: "report", text: "📊 분석" },
        }),
      ),
    ).toBe("간단한 사업성 분석을 완료했습니다.\n\n📊 분석");

    // finance list
    expect(
      formatReply(
        buildResult({
          response: "DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.",
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.");

    // intelligence error (Phase 7-A 재분류, monitoring 에러)
    expect(
      formatReply(
        buildResult({
          response: "🛰️ 모니터링 조회 실패: redis connection refused",
          handlerResponse: { kind: "error", text: "" },
        }),
      ),
    ).toBe("🛰️ 모니터링 조회 실패: redis connection refused");

    // wiki error (Phase 7-A 재분류, wiki_auto_classify 에러)
    expect(
      formatReply(
        buildResult({
          response: "❌ Wiki 자동 분류 저장에 실패했습니다.",
          handlerResponse: { kind: "error", text: "" },
        }),
      ),
    ).toBe("❌ Wiki 자동 분류 저장에 실패했습니다.");

    // chat error (Phase 7-A 재분류, telegram_recent 에러)
    expect(
      formatReply(
        buildResult({
          response: "💬 Telegram 메시지 조회 실패: SQLITE_BUSY",
          handlerResponse: { kind: "error", text: "" },
        }),
      ),
    ).toBe("💬 Telegram 메시지 조회 실패: SQLITE_BUSY");

    // agents error (Phase 7-A 재분류, not_found)
    expect(
      formatReply(
        buildResult({
          response: "🚫 작업을 찾지 못했습니다: task-999",
          handlerResponse: { kind: "error", text: "" },
        }),
      ),
    ).toBe("🚫 작업을 찾지 못했습니다: task-999");

    // approval error (Phase 7-A 재분류, limit_exceeded)
    expect(
      formatReply(
        buildResult({
          response: "🚫 단일 주문 한도 초과",
          handlerResponse: { kind: "error", text: "" },
        }),
      ),
    ).toBe("🚫 단일 주문 한도 초과");

    // knowledgePipeline error (Phase 7-A 재분류, empty_text)
    expect(
      formatReply(
        buildResult({
          response: "❌ /tg 본문이 비어 있습니다.",
          handlerResponse: { kind: "error", text: "" },
        }),
      ),
    ).toBe("❌ /tg 본문이 비어 있습니다.");

    // notebooklm error (Phase 7-A 재분류, project_not_found)
    expect(
      formatReply(
        buildResult({
          response: "❌ project `hannam` 없음.",
          handlerResponse: { kind: "error", text: "" },
        }),
      ),
    ).toBe("❌ project `hannam` 없음.");
  });
});

describe("formatReply — Phase 7-B kind='confirmation' 분기 활성화 회귀", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("kind=confirmation + 비어있지 않은 text → 기존 kind=text 와 byte-for-byte 동일 (response\\n\\ntext)", () => {
    const baseResponse = "🔔 승인 안내";
    const body = "BTC 매수 50,000원 — 텔레그램에서 승인 버튼을 눌러주세요";

    const textKind = formatReply(
      buildResult({
        response: baseResponse,
        handlerResponse: { kind: "text", text: body },
      }),
    );
    const confirmationKind = formatReply(
      buildResult({
        response: baseResponse,
        handlerResponse: { kind: "confirmation", text: body },
      }),
    );
    expect(confirmationKind).toBe(textKind);
    expect(confirmationKind).toBe(baseResponse + "\n\n" + body);
  });

  it("kind=confirmation + text='' → legacy fallback 동작 (response 한 줄)", () => {
    const guidance = "🔔 매수 신호 발송 — 텔레그램에서 승인 버튼을 눌러주세요";
    const out = formatReply(
      buildResult({
        response: guidance,
        handlerResponse: {
          kind: "confirmation",
          text: "",
          meta: { action: "trading_buy_signal", status: "awaiting_approval" },
        },
      }),
    );
    expect(out).toBe(guidance);
  });

  it("kind=confirmation + meta apiKey/secret/token/internal/sessionId 사용자 응답 미노출", () => {
    const out = formatReply(
      buildResult({
        response: "🔔 매수 신호 발송",
        handlerResponse: {
          kind: "confirmation",
          text: "",
          meta: {
            action: "trading_buy_signal",
            status: "awaiting_approval",
            apiKey: "UPBIT-API-KEY-LEAK",
            secret: "secret-DO-NOT-LEAK",
            token: "Bearer leak-token",
            internalUuid: "approval-internal-001",
            sessionId: "session-internal-xyz",
            botToken: "1234567890:AAA-bot-token",
          },
        },
      }),
    );
    expect(out).toBe("🔔 매수 신호 발송");
    expect(out).not.toContain("awaiting_approval");
    expect(out).not.toContain("apiKey");
    expect(out).not.toContain("UPBIT-API-KEY-LEAK");
    expect(out).not.toContain("secret-DO-NOT-LEAK");
    expect(out).not.toContain("token");
    expect(out).not.toContain("Bearer leak-token");
    expect(out).not.toContain("internalUuid");
    expect(out).not.toContain("approval-internal-001");
    expect(out).not.toContain("sessionId");
    expect(out).not.toContain("botToken");
  });

  it("requiresConfirmation: true 기존 헤더 동작 유지 (Phase 4 승인 게이트 회귀 검증)", () => {
    const out = formatReply(
      buildResult({
        intent: {
          domain: "trading",
          action: "trading_balance",
          type: "execute",
          confidence: 0.9,
          params: { exchange: "binance" },
        },
        handled: false,
        requiresConfirmation: true,
        response: "실행 요청으로 분류되었습니다. 안전을 위해 확인 단계가 필요합니다.",
        confirmation: {
          action: "trading_balance",
          domain: "trading",
          params: { exchange: "binance" },
        },
      }),
    );
    expect(out).toContain("ACTION REQUIRES CONFIRMATION");
    expect(out).toContain("실행 요청으로 분류되었습니다.");
    expect(out).toContain("intent=trading/trading_balance type=execute");
    expect(out).toContain("params=");
    expect(out).toContain("next=allowExecute=true 로 승인 재요청");
  });

  it("requiresConfirmation: true + handlerResponse.kind=confirmation 조합 → requiresConfirmation 헤더 우선 (직교성 검증)", () => {
    // 두 분기가 동시에 true 여도 requiresConfirmation 분기가 먼저 처리되어
    // ACTION REQUIRES CONFIRMATION 헤더가 출력. handlerResponse.text 는
    // 사용되지 않음 (line 123 분기가 line ~170 handlerText 추출보다 먼저 실행)
    const out = formatReply(
      buildResult({
        intent: {
          domain: "trading",
          action: "trading_balance",
          type: "execute",
          confidence: 0.9,
          params: { exchange: "binance" },
        },
        handled: false,
        requiresConfirmation: true,
        response: "실행 요청으로 분류되었습니다. 안전을 위해 확인 단계가 필요합니다.",
        confirmation: {
          action: "trading_balance",
          domain: "trading",
          params: { exchange: "binance" },
        },
        handlerResponse: {
          kind: "confirmation",
          text: "이 텍스트는 출력되지 않아야 함 (헤더 분기 우선)",
          meta: { action: "trading_balance" },
        },
      }),
    );
    expect(out).toContain("ACTION REQUIRES CONFIRMATION");
    expect(out).toContain("실행 요청으로 분류되었습니다.");
    expect(out).not.toContain("이 텍스트는 출력되지 않아야 함");
  });

  it("requiresConfirmation: false + handlerResponse.kind=confirmation → kind=text 와 동일 처리", () => {
    // 텔레그램 인라인 키보드 confirmation 안내 가상 시나리오 (현재 핸들러는
    // 사용 안 하지만 향후 활용 대비). requiresConfirmation: false 이므로
    // 헤더 분기 미적용, kind=confirmation 마커가 text 분기와 동일하게 처리됨.
    const guidance = "📡 매수 신호 큐 등록 (id=abc12345)\n📨 텔레그램에서 ✅승인 / ❌거부 / 📊상세 버튼을 눌러주세요";
    const legacy = formatReply(buildResult({ response: guidance }));
    const migrated = formatReply(
      buildResult({
        response: guidance,
        handlerResponse: {
          kind: "confirmation",
          text: "",
          meta: {
            action: "trading_buy_signal",
            status: "awaiting_approval",
            approvalIdPrefix: "abc12345",
          },
        },
      }),
    );
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(guidance);
  });

  it("기존 list/report/text/error 분기 회귀 없음 (Phase 6-A/6-B/6-C/7-A 정상 동작 유지)", () => {
    // list
    expect(
      formatReply(
        buildResult({
          response: "📂 검색",
          handlerResponse: { kind: "list", text: "1. 📄 a.pdf" },
        }),
      ),
    ).toBe("📂 검색\n\n1. 📄 a.pdf");

    // report
    expect(
      formatReply(
        buildResult({
          response: "BTC 분석 완료",
          handlerResponse: { kind: "report", text: "📊 RSI" },
        }),
      ),
    ).toBe("BTC 분석 완료\n\n📊 RSI");

    // text
    expect(
      formatReply(
        buildResult({
          response: "✅ 완료",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ 완료");

    // error (Phase 7-A 활성화)
    expect(
      formatReply(
        buildResult({
          response: "🚫 작업을 찾지 못했습니다",
          handlerResponse: { kind: "error", text: "" },
        }),
      ),
    ).toBe("🚫 작업을 찾지 못했습니다");
  });

  it("11개 도메인 종합 회귀 (kind=confirmation 활성화 후에도 정상 동작)", () => {
    // google list
    expect(
      formatReply(
        buildResult({
          response: "📂 검색",
          data: { fileList: "1. 📄 a.pdf" },
          handlerResponse: { kind: "list", text: "1. 📄 a.pdf" },
        }),
      ),
    ).toBe("📂 검색\n\n1. 📄 a.pdf");

    // trading report
    expect(
      formatReply(
        buildResult({
          response: "BTC 분석 완료",
          data: { briefing: "📊 RSI" },
          handlerResponse: { kind: "report", text: "📊 RSI" },
        }),
      ),
    ).toBe("BTC 분석 완료\n\n📊 RSI");

    // deals text + error 양쪽 모두
    expect(
      formatReply(
        buildResult({
          response: "✅ 딜 추가 완료\n📁 한남동644",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ 딜 추가 완료\n📁 한남동644");
    expect(
      formatReply(
        buildResult({
          response: "⚠️ 알 수 없는 명령",
          handlerResponse: { kind: "error", text: "" },
        }),
      ),
    ).toBe("⚠️ 알 수 없는 명령");

    // realestate report
    expect(
      formatReply(
        buildResult({
          response: "간단한 사업성 분석을 완료했습니다.",
          data: { report: "📊 분석" },
          handlerResponse: { kind: "report", text: "📊 분석" },
        }),
      ),
    ).toBe("간단한 사업성 분석을 완료했습니다.\n\n📊 분석");

    // finance list
    expect(
      formatReply(
        buildResult({
          response: "DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.",
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.");

    // intelligence report + error 양쪽 모두
    expect(
      formatReply(
        buildResult({
          response: "모닝 브리핑을 발송했습니다.",
          data: { briefing: "🌅 본문" },
          handlerResponse: { kind: "report", text: "🌅 본문" },
        }),
      ),
    ).toBe("모닝 브리핑을 발송했습니다.\n\n🌅 본문");

    // wiki text + error 양쪽 모두
    expect(
      formatReply(
        buildResult({
          response: "✅ Wiki 저장 완료\n📁 신논현 매물",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ Wiki 저장 완료\n📁 신논현 매물");

    // chat list
    expect(
      formatReply(
        buildResult({
          response: "💬 최근 Telegram 메시지 1건\n\n1. 05/09 09:30 👤 메시지",
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("💬 최근 Telegram 메시지 1건\n\n1. 05/09 09:30 👤 메시지");

    // agents list
    expect(
      formatReply(
        buildResult({
          response: "🤖 에이전트 상태",
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("🤖 에이전트 상태");

    // approval list (빈 큐)
    expect(
      formatReply(
        buildResult({
          response: "📋 승인 큐가 비어있습니다.",
          handlerResponse: { kind: "list", text: "" },
        }),
      ),
    ).toBe("📋 승인 큐가 비어있습니다.");

    // knowledgePipeline text + error 양쪽 모두
    expect(
      formatReply(
        buildResult({
          response: "✅ Wiki 저장 완료\n📁 projects/hannam-644/notes/x.md",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ Wiki 저장 완료\n📁 projects/hannam-644/notes/x.md");

    // notebooklm text + error 양쪽 모두
    expect(
      formatReply(
        buildResult({
          response: "✅ NotebookLM 회수 완료",
          handlerResponse: { kind: "text", text: "" },
        }),
      ),
    ).toBe("✅ NotebookLM 회수 완료");
  });
});

describe("formatReply 헬퍼 함수", () => {
  it("containsRawObjectShape: method/files 키 가진 객체만 true", () => {
    expect(containsRawObjectShape({ method: "x" })).toBe(true);
    expect(containsRawObjectShape({ files: [] })).toBe(true);
    expect(containsRawObjectShape({ foo: "bar" })).toBe(false);
    expect(containsRawObjectShape("string")).toBe(false);
    expect(containsRawObjectShape(null)).toBe(false);
    expect(containsRawObjectShape(undefined)).toBe(false);
  });

  it("isPlainObjectReply: 객체이면 true, 그 외 false", () => {
    expect(isPlainObjectReply({})).toBe(true);
    expect(isPlainObjectReply({ a: 1 })).toBe(true);
    expect(isPlainObjectReply([])).toBe(true);
    expect(isPlainObjectReply("string")).toBe(false);
    expect(isPlainObjectReply(null)).toBe(false);
    expect(isPlainObjectReply(undefined)).toBe(false);
  });

  it("toUserVisibleText: 문자열은 그대로, 객체는 차단/빈문자열, null/undefined 는 빈문자열", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(toUserVisibleText("hi")).toBe("hi");
      expect(toUserVisibleText(null)).toBe("");
      expect(toUserVisibleText(undefined)).toBe("");
      expect(toUserVisibleText({ method: "x" })).toContain("내부 데이터");
      expect(toUserVisibleText({ ordinary: 1 })).toBe("");
      expect(toUserVisibleText(42)).toBe("42");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("inferKind: data 필드별로 list/report/text 반환", () => {
    expect(
      inferKind({ handled: true, requiresConfirmation: false, response: "x" }),
    ).toBe("text");
    expect(
      inferKind({
        handled: true,
        requiresConfirmation: false,
        response: "x",
        data: { fileList: "..." },
      }),
    ).toBe("list");
    expect(
      inferKind({
        handled: true,
        requiresConfirmation: false,
        response: "x",
        data: { briefing: "..." },
      }),
    ).toBe("report");
    expect(
      inferKind({
        handled: false,
        requiresConfirmation: true,
        response: "x",
      }),
    ).toBe("confirmation");
    expect(
      inferKind({
        handled: false,
        requiresConfirmation: false,
        response: "",
      }),
    ).toBe("text");
  });
});
