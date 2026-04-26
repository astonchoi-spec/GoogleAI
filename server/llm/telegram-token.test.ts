import { describe, it, expect } from "vitest";
import axios from "axios";

const maybeDescribe = process.env.TELEGRAM_BOT_TOKEN ? describe : describe.skip;

maybeDescribe("Telegram Bot Token Validation", () => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  it("should have TELEGRAM_BOT_TOKEN set", () => {
    expect(botToken).toBeDefined();
    expect(botToken).not.toBe("");
  });

  it("should be able to call Telegram Bot API with token", async () => {
    if (!botToken) {
      console.warn("Skipping Telegram API test - no token provided");
      return;
    }

    try {
      const response = await axios.get(
        `https://api.telegram.org/bot${botToken}/getMe`,
        { timeout: 10000 }
      );

      expect(response.status).toBe(200);
      expect(response.data.ok).toBe(true);
      expect(response.data.result).toBeDefined();
      expect(response.data.result.id).toBeDefined();
      expect(response.data.result.username).toBeDefined();

      console.log(`✅ Telegram Bot verified: @${response.data.result.username}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to validate Telegram Bot Token: ${errorMsg}`);
    }
  });
});
