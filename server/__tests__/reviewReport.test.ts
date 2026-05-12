import { describe, expect, it } from "vitest";
import { formatReviewReport, parseReviewMessage, type ReviewReport } from "../trading/reviewReport.ts";

describe("parseReviewMessage", () => {
  it("롱 검토 BTC 15배를 레버리지 시나리오로 파싱하고 금액으로 오해하지 않는다", () => {
    const parsed = parseReviewMessage("롱 검토 BTC 15배");
    expect(parsed?.symbol).toBe("BTC");
    expect(parsed?.side).toBe("long");
    expect(parsed?.leverage).toBe(15);
    expect(parsed?.money).toBeUndefined();
  });

  it("매수 시뮬 BTC 5만원은 50,000 KRW로 파싱한다", () => {
    const parsed = parseReviewMessage("매수 시뮬 BTC 5만원");
    expect(parsed?.symbol).toBe("BTC");
    expect(parsed?.side).toBe("long");
    expect(parsed?.money).toEqual({ value: 50_000, currency: "KRW" });
  });

  it("단위 없는 큰 숫자는 KRW로 가정하고 안내 notes를 남긴다", () => {
    const parsed = parseReviewMessage("검토 ETH 5000");
    expect(parsed?.symbol).toBe("ETH");
    expect(parsed?.money).toEqual({ value: 5000, currency: "KRW", ambiguous: true });
    expect(parsed?.notes.join(" ")).toContain("KRW로 가정");
  });

  it("수량과 USD 단위를 구분한다", () => {
    const quantity = parseReviewMessage("검토 BTC 0.01BTC");
    const usd = parseReviewMessage("검토 BTC 500달러");
    expect(quantity?.quantity).toEqual({ value: 0.01, symbol: "BTC" });
    expect(usd?.money).toEqual({ value: 500, currency: "USD" });
  });

  // P0 (2026-05-12) 회귀 가드 — "검토" 단독이 BTC fallback 으로 폭주하던 버그 차단.
  it("명시적 crypto ticker 없는 '검토' 문장은 null 반환 (chat fallback)", () => {
    expect(parseReviewMessage("한남644PFV사업구조 및 일정 (25.12.16) / 파일 내용 읽고 검토해")).toBeNull();
    expect(parseReviewMessage("이 PDF 내용 검토해줘")).toBeNull();
    expect(parseReviewMessage("계약서 검토 부탁")).toBeNull();
    expect(parseReviewMessage("PF 사업성 검토")).toBeNull();
    expect(parseReviewMessage("검토해")).toBeNull();
  });

  it("부동산/회사 약어(PFV/SPC/REIT)는 ticker 로 인식하지 않는다", () => {
    expect(parseReviewMessage("PFV 검토")).toBeNull();
    expect(parseReviewMessage("SPC 매수 적합?")).toBeNull();
    expect(parseReviewMessage("REIT 들어가도 되?")).toBeNull();
  });

  it("한글 코인명(비트코인/이더 등)은 여전히 인식한다", () => {
    expect(parseReviewMessage("비트코인 검토해")?.symbol).toBe("BTC");
    expect(parseReviewMessage("이더 매수 적합?")?.symbol).toBe("ETH");
  });

  // P0 보강 가드 (2026-05-12 16:48) 회귀 — 가이드/문서/마크다운에 'BTC'+'검토' 섞인 경우 차단.
  it("긴 텍스트(>200자) 안에 BTC+검토 섞여도 review 아님", () => {
    const longGuide = `PC 도착 후 동선

1단계 — 코드 동기화 + PM2 재시작

cd "C:\\Users\\user\\Desktop\\구글연동AI"
git pull --rebase origin codex-google-workspace-expansion
pm2 restart aston

2단계 — 텔레그램 봇 첫 명령어

가장 짧은 검증부터: 내위키
P0 (가장 위험했던 BTC 폭주 차단 검증): 한남644PFV ... 검토해
→ BTC 리포트 사라지고 RAG 인용 답변 나오면 통과.`;
    expect(longGuide.length).toBeGreaterThan(200);
    expect(parseReviewMessage(longGuide)).toBeNull();
  });

  it("멀티라인(>5줄) 메시지는 review 아님", () => {
    const multiline = "검토 BTC\n포지션\n진입\n타이밍\n참고\n자료";
    expect(parseReviewMessage(multiline)).toBeNull();
  });

  it("마크다운 헤더/리스트/코드블록 포함 메시지는 review 아님", () => {
    expect(parseReviewMessage("# BTC 검토\n본문")).toBeNull();
    expect(parseReviewMessage("BTC 검토\n- 항목1\n- 항목2")).toBeNull();
    expect(parseReviewMessage("```\nBTC 검토\n```")).toBeNull();
  });

  it("짧은 매매 검토 메시지는 정상 작동 (회귀 가드)", () => {
    expect(parseReviewMessage("검토 BTC 5만원")?.symbol).toBe("BTC");
    expect(parseReviewMessage("롱 BTC 15배")).toBeNull(); // 검토 키워드 없음
    expect(parseReviewMessage("롱 검토 BTC 15배")?.symbol).toBe("BTC");
  });
});

describe("formatReviewReport", () => {
  it("손절가/목표가 자동 제안 없이 회장님 직접 결정 안내를 포함한다", () => {
    const report: ReviewReport = {
      input: { symbol: "BTC", side: "long", leverage: 15, notes: [] },
      currentPrice: 80_000,
      priceChange24hPercent: 2.1,
      quoteVolume24h: 1_000_000_000,
      timeframes: [
        { timeframe: "1h", rsi: 55, bbPositionPercent: 62, bbLabel: "밴드 내부", macdHistogram: 10, close: 80_000 },
        { timeframe: "4h", rsi: 58, bbPositionPercent: 70, bbLabel: "밴드 내부", macdHistogram: 8, close: 80_000 },
        { timeframe: "1d", rsi: 60, bbPositionPercent: 65, bbLabel: "밴드 내부", macdHistogram: null, close: 80_000 },
      ],
      volumeSpikeRatio: 1.2,
      funding: { latestPercent: 0.01, avg4Percent: 0.02, avg24Percent: 0.015 },
      kimchiPremiumPercent: 1.3,
      kimchiPremiumChange24h: -0.2,
      riskGuard: {
        dailyPnlPercent: 0,
        dailyLossLimitPercent: 3,
        consecutiveLosses: 0,
        consecutiveLossBlock: 3,
        locked: false,
      },
      liquidationPrice: 74_666.666,
      checklist: [
        { label: "Risk Guard", status: "ok", detail: "차단 조건 없음" },
      ],
      verdict: "caution",
      notes: [],
    };
    const text = formatReviewReport(report);
    expect(text).toContain("검토 리포트");
    expect(text).toContain("손절가/목표가는 회장님이 직접 결정");
    expect(text).not.toContain("자동 제안");
  });
});
