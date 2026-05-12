import { describe, it, expect } from "vitest";
import { type OhlcvData, calcRSI, calcMACD, calcBollingerBands } from "../trading/technicalAnalysis.ts";

const sampleCloses = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
  46.28, 46.00, 46.00, 46.00, 47.00, 47.23, 47.64, 46.19, 46.26, 45.64, 46.21, 46.25, 45.71,
  46.45, 46.09, 47.27, 47.18,
];

const sampleData: OhlcvData = sampleCloses.map((close, i) => ({
  timestamp: Date.now() - (30 - i) * 60 * 60 * 1000,
  open: close - 0.5,
  high: close + 0.5,
  low: close - 1,
  close,
  volume: 1000000 + Math.random() * 100000,
}));

describe("Technical Analysis Functions", () => {
  it("calcRSI should return values between 0 and 100", () => {
    const result = calcRSI(sampleData, 14);
    expect(result.latest).toBeDefined();
    expect(result.latest).toBeGreaterThanOrEqual(0);
    expect(result.latest).toBeLessThanOrEqual(100);
    expect(result.values.length).toBeGreaterThan(0);
  });

  it("calcMACD should return macd, signal, and histogram", () => {
    const result = calcMACD(sampleData, 12, 26, 9);
    expect(result.latest).toBeDefined();
    expect(result.latest.macd).toBeDefined();
    expect(result.latest.signal).toBeDefined();
    expect(result.latest.histogram).toBeDefined();
    expect(result.macd.length).toBeGreaterThan(0);
    expect(result.signal.length).toBeGreaterThan(0);
    expect(result.histogram.length).toBeGreaterThan(0);
  });

  it("should return empty arrays when data is insufficient", () => {
    const shortData: OhlcvData = sampleData.slice(0, 5);
    const rsiResult = calcRSI(shortData, 14);
    expect(rsiResult.values).toEqual([]);
    expect(rsiResult.latest).toBeNull();

    const macdResult = calcMACD(shortData, 12, 26, 9);
    expect(macdResult.macd).toEqual([]);
    expect(macdResult.signal).toEqual([]);
    expect(macdResult.histogram).toEqual([]);
    expect(macdResult.latest.macd).toBeNull();
    expect(macdResult.latest.signal).toBeNull();
    expect(macdResult.latest.histogram).toBeNull();
  });

  it("calcBollingerBands should return upper, middle, lower bands", () => {
    const result = calcBollingerBands(sampleData, 20, 2);
    expect(result.latest).toBeDefined();
    expect(result.latest.upper).not.toBeNull();
    expect(result.latest.middle).not.toBeNull();
    expect(result.latest.lower).not.toBeNull();
    expect(result.upper.length).toBeGreaterThan(0);
    expect(result.middle.length).toBeGreaterThan(0);
    expect(result.lower.length).toBeGreaterThan(0);
  });
});
