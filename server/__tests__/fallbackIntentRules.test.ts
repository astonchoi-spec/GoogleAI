import { describe, it, expect } from "vitest";
import { fallbackIntent } from "../intent/fallbackIntent.ts";

describe("fallbackIntent 명시 규칙 정리", () => {
  describe("오늘 메일 요약", () => {
    it("\"오늘 메일 요약\"을 google_get_emails(newer_than:1d)로 매칭한다", () => {
      const r = fallbackIntent("오늘 메일 요약");
      expect(r.action).toBe("google_get_emails");
      expect(r.params.searchQuery).toBe("newer_than:1d");
      expect(r.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it("\"오늘 메일\"을 매칭한다", () => {
      const r = fallbackIntent("오늘 메일 보여줘");
      expect(r.action).toBe("google_get_emails");
      expect(r.params.searchQuery).toBe("newer_than:1d");
    });

    it("\"메일 요약\"을 매칭한다", () => {
      const r = fallbackIntent("메일 요약");
      expect(r.action).toBe("google_get_emails");
    });

    it("\"받은 메일\"은 기존 fallback(검색쿼리 없음)이 유지된다", () => {
      const r = fallbackIntent("받은 메일");
      expect(r.action).toBe("google_get_emails");
      expect(r.params.searchQuery).toBeUndefined();
    });
  });

  describe("잔고 거래소 매핑", () => {
    it("\"업비트잔고\"를 upbit exchange로 매핑한다", () => {
      const r = fallbackIntent("업비트잔고");
      expect(r.action).toBe("trading_balance");
      expect(r.params.exchange).toBe("upbit");
    });

    it("\"업비트 잔고\"도 upbit으로 매핑한다", () => {
      const r = fallbackIntent("업비트 잔고");
      expect(r.action).toBe("trading_balance");
      expect(r.params.exchange).toBe("upbit");
    });

    it("\"upbit 잔고\" 영문도 upbit으로 매핑한다", () => {
      const r = fallbackIntent("upbit 잔고");
      expect(r.action).toBe("trading_balance");
      expect(r.params.exchange).toBe("upbit");
    });

    it("\"잔고\" 단독은 binance 기본값으로 매핑한다", () => {
      const r = fallbackIntent("잔고");
      expect(r.action).toBe("trading_balance");
      expect(r.params.exchange).toBe("binance");
    });
  });

  describe("Telegram 최근 메시지", () => {
    it("\"Telegram 최근 메시지\"를 chat_telegram_recent로 매칭한다", () => {
      const r = fallbackIntent("Telegram 최근 메시지");
      expect(r.action).toBe("chat_telegram_recent");
      expect(r.domain).toBe("chat");
      expect(r.params.limit).toBe(10);
    });

    it("\"텔레그램 최근\"을 매칭한다", () => {
      const r = fallbackIntent("텔레그램 최근");
      expect(r.action).toBe("chat_telegram_recent");
    });

    it("\"최근 텔레그램\"을 매칭한다", () => {
      const r = fallbackIntent("최근 텔레그램 보여줘");
      expect(r.action).toBe("chat_telegram_recent");
    });

    it("\"telegram recent\" 영문을 매칭한다", () => {
      const r = fallbackIntent("telegram recent");
      expect(r.action).toBe("chat_telegram_recent");
    });
  });

  describe("/kakao paste 라우팅", () => {
    it("\"/kakao paste {project}\\n본문\"을 kakao_paste로 매칭한다", () => {
      const r = fallbackIntent("/kakao paste hannam-644\n[홍길동] 카톡 메시지");
      expect(r.domain).toBe("notebooklm");
      expect(r.action).toBe("kakao_paste");
      expect(r.confidence).toBeGreaterThanOrEqual(0.99);
      expect(r.params.raw).toContain("/kakao paste hannam-644");
    });

    it("\"/kakao paste {project} 출처: ...\\n본문\" 출처 포함 매칭", () => {
      const r = fallbackIntent("/kakao paste hannam-644 출처: 한남PFV단톡\n메시지");
      expect(r.action).toBe("kakao_paste");
    });

    it("본문 없는 \"/kakao paste {project}\" 단독은 kakao_paste 매칭 안함", () => {
      const r = fallbackIntent("/kakao paste hannam-644");
      expect(r.action).not.toBe("kakao_paste");
    });
  });
});
