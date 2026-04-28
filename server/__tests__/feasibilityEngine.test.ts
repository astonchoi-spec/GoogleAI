import { describe, it, expect } from "vitest";
import { calculateFeasibility, formatSimpleFeasibilityReport, type SimpleFeasibilityInput } from "../realestate/feasibilityEngine.ts";

describe("Feasibility Engine", () => {
  it("should calculate total cost as sum of all cost items", () => {
    const input: SimpleFeasibilityInput = {
      projectName: "판교 오피스텔",
      landCost: 5000000000,
      constructionCost: 10000000000,
      designFee: 1000000000,
      financeCost: 2000000000,
      taxAndFee: 500000000,
      otherCost: 1500000000,
      totalUnits: 100,
      avgSalePrice: 50000000,
      projectMonths: 30,
    };

    const result = calculateFeasibility(input);

    const expectedTotalCost =
      input.landCost +
      input.constructionCost +
      input.designFee +
      input.financeCost +
      input.taxAndFee +
      input.otherCost;

    expect(result.totalCost).toBe(expectedTotalCost);
  });

  it("should calculate positive profit rate when revenue exceeds cost", () => {
    const input: SimpleFeasibilityInput = {
      projectName: "판교 오피스텔",
      landCost: 5000000000,
      constructionCost: 10000000000,
      designFee: 1000000000,
      financeCost: 2000000000,
      taxAndFee: 500000000,
      otherCost: 1500000000,
      totalUnits: 100,
      avgSalePrice: 250000000,
      projectMonths: 30,
    };

    const result = calculateFeasibility(input);

    expect(result.grossProfit).toBeGreaterThan(0);
    expect(result.profitRate).toBeGreaterThan(0);
  });

  it("should calculate negative profit rate when revenue is less than cost", () => {
    const input: SimpleFeasibilityInput = {
      projectName: "판교 오피스텔",
      landCost: 5000000000,
      constructionCost: 10000000000,
      designFee: 1000000000,
      financeCost: 2000000000,
      taxAndFee: 500000000,
      otherCost: 1500000000,
      totalUnits: 100,
      avgSalePrice: 20000000,
      projectMonths: 30,
    };

    const result = calculateFeasibility(input);

    expect(result.grossProfit).toBeLessThan(0);
    expect(result.profitRate).toBeLessThan(0);
  });

  it("should calculate break even rate within 0-100% range", () => {
    const input: SimpleFeasibilityInput = {
      projectName: "판교 오피스텔",
      landCost: 5000000000,
      constructionCost: 10000000000,
      designFee: 1000000000,
      financeCost: 2000000000,
      taxAndFee: 500000000,
      otherCost: 1500000000,
      totalUnits: 100,
      avgSalePrice: 200000000,
      projectMonths: 30,
    };

    const result = calculateFeasibility(input);

    expect(result.breakEvenRate).toBeGreaterThanOrEqual(0);
    expect(result.breakEvenRate).toBeLessThanOrEqual(100);
  });

  it("should format report with required fields", () => {
    const input: SimpleFeasibilityInput = {
      projectName: "판교 오피스텔",
      landCost: 5000000000,
      constructionCost: 10000000000,
      designFee: 1000000000,
      financeCost: 2000000000,
      taxAndFee: 500000000,
      otherCost: 1500000000,
      totalUnits: 100,
      avgSalePrice: 200000000,
      projectMonths: 30,
    };

    const result = calculateFeasibility(input);
    const report = formatSimpleFeasibilityReport(result, input);

    expect(report).toContain("총사업비");
    expect(report).toContain("이익률");
  });
});
