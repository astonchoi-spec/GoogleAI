import { describe, expect, it } from "vitest";
import { calcDday, formatKstShortDate, parseDealDate } from "../deals/dateParser.ts";

const NOW = new Date("2026-05-01T03:00:00.000Z");

describe("parseDealDate", () => {
  it("parses absolute YYYY-MM-DD", () => {
    const iso = parseDealDate("2026-06-30", NOW);
    expect(iso).not.toBeNull();
    expect(iso!.slice(0, 10)).toBe("2026-06-29");
    expect(calcDday(iso!, NOW)).toBe(60);
  });

  it("parses YYYY/MM/DD", () => {
    const iso = parseDealDate("2026/06/30", NOW);
    expect(iso).not.toBeNull();
    expect(calcDday(iso!, NOW)).toBe(60);
  });

  it("parses M/D as future this year", () => {
    const iso = parseDealDate("5/4", NOW);
    expect(iso).not.toBeNull();
    expect(calcDday(iso!, NOW)).toBe(3);
  });

  it("parses M/D as next year when in the past", () => {
    const iso = parseDealDate("4/30", NOW);
    expect(iso).not.toBeNull();
    expect(iso!.startsWith("2027-")).toBe(true);
  });

  it("parses 내일 / 모레 / 글피", () => {
    expect(calcDday(parseDealDate("내일", NOW)!, NOW)).toBe(1);
    expect(calcDday(parseDealDate("모레", NOW)!, NOW)).toBe(2);
    expect(calcDday(parseDealDate("글피", NOW)!, NOW)).toBe(3);
  });

  it("parses N일 후 / N주 후 / N개월 후", () => {
    expect(calcDday(parseDealDate("30일 후", NOW)!, NOW)).toBe(30);
    expect(calcDday(parseDealDate("2주 후", NOW)!, NOW)).toBe(14);
    expect(calcDday(parseDealDate("1개월 후", NOW)!, NOW)).toBeGreaterThanOrEqual(28);
  });

  it("parses 다음주 월요일", () => {
    const iso = parseDealDate("다음주 월요일", NOW);
    expect(iso).not.toBeNull();
    const d = calcDday(iso!, NOW);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(14);
  });

  it("returns null on invalid input", () => {
    expect(parseDealDate("abc", NOW)).toBeNull();
    expect(parseDealDate("", NOW)).toBeNull();
    expect(parseDealDate("2026-13-45", NOW)).toBeNull();
  });
});

describe("formatKstShortDate", () => {
  it("formats ISO to M/D in KST", () => {
    const iso = parseDealDate("2026-06-30", NOW)!;
    expect(formatKstShortDate(iso)).toBe("6/30");
  });
});

describe("calcDday", () => {
  it("returns 0 for today", () => {
    const today = parseDealDate("오늘", NOW)!;
    expect(calcDday(today, NOW)).toBe(0);
  });

  it("returns negative for past dates", () => {
    const past = parseDealDate("2025-01-01", NOW)!;
    expect(calcDday(past, NOW)).toBeLessThan(0);
  });
});
