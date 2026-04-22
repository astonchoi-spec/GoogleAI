import { describe, it, expect, beforeAll } from "vitest";
import LLMCaller from "./caller";

describe("Gemini API Integration", () => {
  let llmCaller: LLMCaller;

  beforeAll(() => {
    llmCaller = new LLMCaller();
  });

  it("should validate Gemini API key is configured", () => {
    const apiKey = process.env.GEMINI_API_KEY;
    expect(apiKey).toBeDefined();
    expect(apiKey).not.toBe("");
    expect(apiKey?.length).toBeGreaterThan(10);
  });

  it("should successfully call Gemini API", async () => {
    const response = await llmCaller.call(
      "gemini",
      "flash",
      [
        {
          role: "user",
          content: "안녕하세요. 간단히 인사해주세요.",
        },
      ],
      "You are a helpful assistant."
    );

    expect(response).toBeDefined();
    expect(response.content).toBeDefined();
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.engine).toBe("gemini");
  }, { timeout: 30000 });

  it("should handle Gemini model switching", async () => {
    const models = ["flash", "pro"];

    for (const modelKey of models) {
      const response = await llmCaller.call(
        "gemini",
        modelKey,
        [
          {
            role: "user",
            content: "Hello",
          },
        ],
        "You are a helpful assistant."
      );

      expect(response.content).toBeDefined();
      expect(response.content.length).toBeGreaterThan(0);
    }
  }, { timeout: 60000 });
});
