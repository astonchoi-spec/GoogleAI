import { describe, it, expect, vi } from "vitest";
import type { LandUseRegulationResult, LandPriceResult, RealTransactionResult } from "../realestate/publicDataAPI.ts";

describe("Public Data API Types", () => {
  it("should have correct type structure for LandUseRegulationResult", () => {
    const result: LandUseRegulationResult = {
      pnu: "1234567890",
      address: "서울시 강남구",
      regulations: ["도시계획구역", "상업지역"],
    };

    expect(result).toHaveProperty("pnu");
    expect(result).toHaveProperty("address");
    expect(result).toHaveProperty("regulations");
    expect(Array.isArray(result.regulations)).toBe(true);
  });

  it("should have correct type structure for LandPriceResult", () => {
    const result: LandPriceResult = {
      pnu: "1234567890",
      price: 100000000,
      year: "2024",
      area: 100,
    };

    expect(result).toHaveProperty("pnu");
    expect(result).toHaveProperty("price");
    expect(result).toHaveProperty("year");
    expect(result).toHaveProperty("area");
    expect(typeof result.price).toBe("number");
    expect(typeof result.year).toBe("string");
  });

  it("should have correct type structure for RealTransactionResult", () => {
    const result: RealTransactionResult = {
      transactions: [
        {
          aptName: "테스트 아파트",
          price: 500000000,
          area: 84,
          floor: 10,
          date: "20240101",
        },
      ],
    };

    expect(result).toHaveProperty("transactions");
    expect(Array.isArray(result.transactions)).toBe(true);
    if (result.transactions.length > 0) {
      const tx = result.transactions[0];
      expect(tx).toHaveProperty("aptName");
      expect(tx).toHaveProperty("price");
      expect(tx).toHaveProperty("area");
      expect(tx).toHaveProperty("floor");
      expect(tx).toHaveProperty("date");
    }
  });
});
