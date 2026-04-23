/**
 * tRPC Router for API Settings Management
 * Handles user's LLM provider API key configuration
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc.ts";
import { saveApiSetting, getApiSettings, getApiSetting, deleteApiSetting } from "../db.ts";

export const apiSettingsRouter = router({
  /**
   * Get all API settings for current user
   */
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user?.id;
    if (!userId) {
      throw new Error("User not found");
    }

    const settings = await getApiSettings(userId);
    
    // Don't return actual API keys to frontend, only metadata
    return settings.map((s) => ({
      id: s.id,
      provider: s.provider,
      isActive: s.isActive === 1,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      hasKey: !!s.apiKey, // Just indicate if key exists
    }));
  }),

  /**
   * Save or update API key for a provider
   */
  save: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["gemini", "openai", "anthropic", "ollama"]),
        apiKey: z.string().min(1, "API key is required"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new Error("User not found");
      }

      try {
        await saveApiSetting(userId, input.provider, input.apiKey);
        return {
          success: true,
          provider: input.provider,
          message: `${input.provider} API key saved successfully`,
        };
      } catch (error) {
        console.error("Failed to save API setting:", error);
        throw new Error(`Failed to save API key: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }),

  /**
   * Delete API key for a provider
   */
  delete: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["gemini", "openai", "anthropic", "ollama"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new Error("User not found");
      }

      try {
        await deleteApiSetting(userId, input.provider);
        return {
          success: true,
          provider: input.provider,
          message: `${input.provider} API key deleted successfully`,
        };
      } catch (error) {
        console.error("Failed to delete API setting:", error);
        throw new Error(`Failed to delete API key: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }),

  /**
   * Validate API key by testing connectivity
   */
  validate: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["gemini", "openai", "anthropic", "ollama"]),
        apiKey: z.string().min(1, "API key is required"),
      })
    )
    .mutation(async ({ input }) => {
      try {
        switch (input.provider) {
          case "gemini": {
            // Test Gemini API
            const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": input.apiKey,
              },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [{ text: "test" }],
                  },
                ],
              }),
            });

            if (response.status === 401 || response.status === 403) {
              return { valid: false, error: "Invalid API key" };
            }
            return { valid: response.ok, error: response.ok ? null : "API validation failed" };
          }

          case "openai": {
            // Test OpenAI API
            const response = await fetch("https://api.openai.com/v1/models", {
              headers: {
                Authorization: `Bearer ${input.apiKey}`,
              },
            });

            if (response.status === 401) {
              return { valid: false, error: "Invalid API key" };
            }
            return { valid: response.ok, error: response.ok ? null : "API validation failed" };
          }

          case "anthropic": {
            // Test Anthropic API
            const response = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "x-api-key": input.apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model: "claude-opus-4-1",
                max_tokens: 10,
                messages: [{ role: "user", content: "test" }],
              }),
            });

            if (response.status === 401) {
              return { valid: false, error: "Invalid API key" };
            }
            return { valid: response.ok, error: response.ok ? null : "API validation failed" };
          }

          case "ollama": {
            // Test Ollama API
            const response = await fetch(`${input.apiKey}/api/tags`);
            return { valid: response.ok, error: response.ok ? null : "Cannot connect to Ollama" };
          }

          default:
            return { valid: false, error: "Unknown provider" };
        }
      } catch (error) {
        return {
          valid: false,
          error: error instanceof Error ? error.message : "Validation failed",
        };
      }
    }),
});

export default apiSettingsRouter;
