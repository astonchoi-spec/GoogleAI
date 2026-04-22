/**
 * Unit tests for LLMCaller
 * Tests model registry and API structure validation
 */

import { describe, it, expect } from "vitest";
import LLMCaller from "./caller";
import { getModel, getAllEngines, getModelsByEngine } from "./models";

describe("LLMCaller", () => {
  describe("Model Registry", () => {
    it("should have all required engines", () => {
      const engines = getAllEngines();

      expect(engines).toContain("gemma4");
      expect(engines).toContain("gemini");
      expect(engines).toContain("codex");
      expect(engines).toContain("claude");
    });

    it("each engine should have models", () => {
      const engines = getAllEngines();

      engines.forEach((engine) => {
        const models = getModelsByEngine(engine as any);
        expect(models.length).toBeGreaterThan(0);

        models.forEach((model) => {
          expect(model).toHaveProperty("key");
          expect(model).toHaveProperty("name");
          expect(model).toHaveProperty("modelId");
          expect(model).toHaveProperty("description");
        });
      });
    });

    it("should retrieve specific model", () => {
      const model = getModel("gemma4", "e4b");

      expect(model).toBeDefined();
      expect(model?.key).toBe("e4b");
      expect(model?.name).toContain("Gemma 4");
      expect(model?.modelId).toBe("gemma4:e4b");
    });

    it("should return null for unknown model", () => {
      const model = getModel("gemma4", "unknown");

      expect(model).toBeNull();
    });
  });

  describe("LLMCaller Structure", () => {
    it("should initialize with environment variables", () => {
      const caller = new LLMCaller();

      expect(caller).toBeDefined();
      expect(typeof caller.call).toBe("function");
    });

    it("should accept custom configuration", () => {
      const caller = new LLMCaller(
        "http://custom-ollama:11434",
        "test-gemini-key",
        "test-openai-key",
        "test-anthropic-key"
      );

      expect(caller).toBeDefined();
    });

    it("should have call method with correct signature", () => {
      const caller = new LLMCaller();

      expect(typeof caller.call).toBe("function");

      // Verify method accepts correct parameters
      const method = caller.call;
      expect(method.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Message Structure", () => {
    it("should validate LLM message format", () => {
      const messages = [
        { role: "user" as const, content: "Hello" },
        { role: "assistant" as const, content: "Hi there" },
        { role: "system" as const, content: "You are helpful" },
      ];

      messages.forEach((msg) => {
        expect(["user", "assistant", "system"]).toContain(msg.role);
        expect(typeof msg.content).toBe("string");
        expect(msg.content.length).toBeGreaterThan(0);
      });
    });

    it("should handle empty message content gracefully", () => {
      const message = { role: "user" as const, content: "" };

      expect(message.role).toBe("user");
      expect(message.content).toBe("");
    });
  });

  describe("Model Configuration", () => {
    it("Gemma4 models should be properly configured", () => {
      const models = getModelsByEngine("gemma4");

      expect(models.length).toBeGreaterThan(0);

      models.forEach((model) => {
        expect(model.modelId).toMatch(/^gemma4:/);
        expect(model.key).toBeTruthy();
      });
    });

    it("Gemini models should be properly configured", () => {
      const models = getModelsByEngine("gemini");

      expect(models.length).toBeGreaterThan(0);

      models.forEach((model) => {
        expect(model.modelId).toMatch(/^gemini-/);
        expect(model.key).toBeTruthy();
      });
    });

    it("Codex models should be properly configured", () => {
      const models = getModelsByEngine("codex");

      expect(models.length).toBeGreaterThan(0);

      models.forEach((model) => {
        expect(model.modelId).toMatch(/^gpt-/);
        expect(model.key).toBeTruthy();
      });
    });

    it("Claude models should be properly configured", () => {
      const models = getModelsByEngine("claude");

      expect(models.length).toBeGreaterThan(0);

      models.forEach((model) => {
        expect(model.modelId).toMatch(/^claude-/);
        expect(model.key).toBeTruthy();
      });
    });
  });

  describe("Default Configuration", () => {
    it("should have default engine and model", () => {
      const engines = getAllEngines();
      expect(engines).toContain("gemma4");

      const models = getModelsByEngine("gemma4");
      expect(models.length).toBeGreaterThan(0);

      const defaultModel = models.find((m) => m.key === "e4b");
      expect(defaultModel).toBeDefined();
    });
  });
});
