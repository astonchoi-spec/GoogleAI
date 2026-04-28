import { describe, it, expect } from "vitest";
import { calculateRisk, formatRiskReportFromResult, type RiskInput } from "../trading/riskCalculator.ts";

describe("Risk Calculator", () => {
  it("should calculate correct position size for long position", () => {
    const input: RiskInput = {
      entryPrice: 65000,
      accountBalance: 10000,
      riskPercent: 2,
      leverage: 10,
      stopLossPrice: 63000,
      side: "long",
    };

    const result = calculateRisk(input);

    expect(result.positionSize).toBeGreaterThan(0);
    expect(result.positionSize).toBeLessThan(100);
    // positionSize = (10000 * 2/100) / (65000 - 63000) = 200 / 2000 = 0.1
    expect(result.positionSize).toBeCloseTo(0.1, 5);
  });

  it("should calculate liquidation price correctly for short position", () => {
    const input: RiskInput = {
      entryPrice: 65000,
      accountBalance: 10000,
      riskPercent: 2,
      leverage: 10,
      stopLossPrice: 67000,
      side: "short",
    };

    const result = calculateRisk(input);

    // For short: liquidationPrice = entryPrice × (1 + 1/leverage) = 65000 × (1 + 0.1) = 71500
    expect(result.liquidationPrice).toBeGreaterThan(input.entryPrice);
    expect(result.liquidationPrice).toBeCloseTo(71500, 0);
  });

  it("should have liquidation price near entry price with leverage 1", () => {
    const input: RiskInput = {
      entryPrice: 65000,
      accountBalance: 10000,
      riskPercent: 2,
      leverage: 1,
      stopLossPrice: 64000,
      side: "long",
    };

    const result = calculateRisk(input);

    // For long with leverage 1: liquidationPrice = entryPrice × (1 - 1/1) = 0
    expect(result.liquidationPrice).toBeLessThanOrEqual(input.entryPrice * 0.1);
  });

  it("should format risk report with required fields", () => {
    const input: RiskInput = {
      entryPrice: 65000,
      accountBalance: 10000,
      riskPercent: 2,
      leverage: 10,
      stopLossPrice: 63000,
      side: "long",
    };

    const result = calculateRisk(input);
    const report = formatRiskReportFromResult(result, input);

    expect(report).toContain("진입가");
    expect(report).toContain("손절가");
    expect(report).toContain("청산가");
  });
});
