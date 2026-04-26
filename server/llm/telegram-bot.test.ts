import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { SessionManager } from "./session";
import LLMCaller from "./caller";
import TelegramBot from "./telegram-bot";
import { getModel, getDefaultModel } from "./models";

describe("Telegram Bot Commands", () => {
  let sessionManager: SessionManager;
  let llmCaller: LLMCaller;
  let bot: TelegramBot;
  const testUserId = "test-user-123";

  beforeAll(() => {
    sessionManager = new SessionManager();
    llmCaller = new LLMCaller();
    // Note: Bot token would be set from environment in real usage
    // For testing, we're just testing the session/command logic
  });

  afterAll(async () => {
    await sessionManager.disconnect();
  });

  describe("/status command", () => {
    it("should return current engine and model", async () => {
      const session = await sessionManager.getSession(testUserId);
      const model = getModel(session.engine, session.modelKey);

      expect(session.engine).toBe("gemini");
      expect(session.modelKey).toBe("pro");
      expect(model).toBeDefined();
      expect(model?.name).toBe("Gemini 2.5 Pro");
    });

    it("should show conversation history count", async () => {
      // Add test messages
      await sessionManager.addMessage(testUserId, "user", "안녕하세요");
      await sessionManager.addMessage(testUserId, "assistant", "안녕하세요!");

      const session = await sessionManager.getSession(testUserId);
      expect(session.conversationHistory.length).toBe(2);
    });

    it("should display last updated timestamp", async () => {
      const session = await sessionManager.getSession(testUserId);
      expect(session.lastUpdated).toBeGreaterThan(0);
      expect(typeof session.lastUpdated).toBe("number");
    });
  });

  describe("/model command", () => {
    it("should switch to Gemini Pro model", async () => {
      await sessionManager.switchEngine(testUserId, "gemini", "pro");

      const session = await sessionManager.getSession(testUserId);
      expect(session.engine).toBe("gemini");
      expect(session.modelKey).toBe("pro");

      const model = getModel(session.engine, session.modelKey);
      expect(model?.name).toBe("Gemini 2.5 Pro");
    });

    it("should maintain model after multiple operations", async () => {
      // Switch to Pro
      await sessionManager.switchEngine(testUserId, "gemini", "pro");

      // Add message
      await sessionManager.addMessage(testUserId, "user", "테스트");

      // Verify model is still Pro
      const session = await sessionManager.getSession(testUserId);
      expect(session.modelKey).toBe("pro");
    });

    it("should support all Gemini models", async () => {
      const models = ["flash", "pro", "3.1pro", "3.1live"];

      for (const modelKey of models) {
        await sessionManager.switchEngine(testUserId, "gemini", modelKey);
        const session = await sessionManager.getSession(testUserId);
        expect(session.modelKey).toBe(modelKey);
      }
    });
  });

  describe("/engine command", () => {
    it("should switch engines", async () => {
      const engines = ["gemini", "codex", "claude"];

      for (const engine of engines) {
        // Get first model for this engine
        const models = getModel(engine as any, "flash") || getModel(engine as any, "5.4") || getModel(engine as any, "sonnet");
        if (models) {
          await sessionManager.switchEngine(testUserId, engine as any, "flash");
          const session = await sessionManager.getSession(testUserId);
          expect(session.engine).toBe(engine);
        }
      }
    });
  });

  describe("/clear command", () => {
    it("should clear conversation history", async () => {
      // Add messages
      await sessionManager.addMessage(testUserId, "user", "메시지 1");
      await sessionManager.addMessage(testUserId, "assistant", "응답 1");

      let session = await sessionManager.getSession(testUserId);
      expect(session.conversationHistory.length).toBeGreaterThan(0);

      // Clear history
      await sessionManager.clearHistory(testUserId);

      // Verify cleared
      session = await sessionManager.getSession(testUserId);
      expect(session.conversationHistory.length).toBe(0);
    });

    it("should preserve engine/model after clearing", async () => {
      // Set specific engine/model
      await sessionManager.switchEngine(testUserId, "gemini", "pro");

      // Add and clear messages
      await sessionManager.addMessage(testUserId, "user", "테스트");
      await sessionManager.clearHistory(testUserId);

      // Verify engine/model preserved
      const session = await sessionManager.getSession(testUserId);
      expect(session.engine).toBe("gemini");
      expect(session.modelKey).toBe("pro");
      expect(session.conversationHistory.length).toBe(0);
    });
  });

  describe("Session Management", () => {
    it("should create new session for new user", async () => {
      const newUserId = "new-user-456";
      const session = await sessionManager.getSession(newUserId);

      expect(session.userId).toBe(newUserId);
      expect(session.engine).toBe("gemini");
      expect(session.modelKey).toBe("pro");
      expect(session.conversationHistory.length).toBe(0);
    });

    it("should maintain separate sessions for different users", async () => {
      const user1 = "user-1";
      const user2 = "user-2";

      // Setup user1
      await sessionManager.switchEngine(user1, "gemini", "pro");
      await sessionManager.addMessage(user1, "user", "User1 message");

      // Setup user2
      await sessionManager.switchEngine(user2, "codex", "5.4");
      await sessionManager.addMessage(user2, "user", "User2 message");

      // Verify separate sessions
      const session1 = await sessionManager.getSession(user1);
      const session2 = await sessionManager.getSession(user2);

      expect(session1.engine).toBe("gemini");
      expect(session1.modelKey).toBe("pro");
      expect(session1.conversationHistory.length).toBe(1);

      expect(session2.engine).toBe("codex");
      expect(session2.modelKey).toBe("5.4");
      expect(session2.conversationHistory.length).toBe(1);
    });

    it("should get session count", async () => {
      const count = await sessionManager.getSessionCount();
      expect(count).toBeGreaterThan(0);
      expect(typeof count).toBe("number");
    });

    it("should delete session", async () => {
      const userId = "delete-test-user";
      await sessionManager.getSession(userId);

      let count = await sessionManager.getSessionCount();
      const initialCount = count;

      await sessionManager.deleteSession(userId);

      count = await sessionManager.getSessionCount();
      expect(count).toBeLessThan(initialCount);
    });
  });

  describe("Conversation History", () => {
    it("should add messages to history", async () => {
      const userId = "history-test-user";

      await sessionManager.addMessage(userId, "user", "안녕하세요");
      await sessionManager.addMessage(userId, "assistant", "안녕하세요!");
      await sessionManager.addMessage(userId, "user", "어떻게 지내세요?");

      const history = await sessionManager.getConversationHistory(userId);
      expect(history.length).toBe(3);
      expect(history[0].role).toBe("user");
      expect(history[0].content).toBe("안녕하세요");
      expect(history[1].role).toBe("assistant");
      expect(history[2].content).toBe("어떻게 지내세요?");
    });

    it("should limit history with limit parameter", async () => {
      const userId = "limit-test-user";

      // Add 10 messages
      for (let i = 0; i < 10; i++) {
        await sessionManager.addMessage(userId, i % 2 === 0 ? "user" : "assistant", `Message ${i}`);
      }

      // Get last 5
      const history = await sessionManager.getConversationHistory(userId, 5);
      expect(history.length).toBe(5);
      expect(history[0].content).toBe("Message 5");
      expect(history[4].content).toBe("Message 9");
    });

    it("should include timestamps in history", async () => {
      const userId = "timestamp-test-user";

      const before = Date.now();
      await sessionManager.addMessage(userId, "user", "Test message");
      const after = Date.now();

      const history = await sessionManager.getConversationHistory(userId);
      expect(history[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(history[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("Default Configuration", () => {
    it("should have Gemini as default engine", () => {
      const defaultModel = getDefaultModel();
      expect(defaultModel.engine).toBe("gemini");
    });

    it("should have Pro as default model", () => {
      const defaultModel = getDefaultModel();
      expect(defaultModel.modelKey || defaultModel.key).toBe("pro");
    });

    it("should have correct default model name", () => {
      const defaultModel = getDefaultModel();
      expect(defaultModel.name).toContain("Pro");
    });
  });
});
