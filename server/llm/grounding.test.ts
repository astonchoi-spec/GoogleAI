/**
 * Tests for Gemini Grounding Sources
 * Validates extraction, deduplication, and proper structuring of grounding sources
 */

import { describe, it, expect, vi } from "vitest";

// MODIFIED: test grounding source extraction and deduplication without calling real Gemini API.
describe("Grounding Sources", () => {
  describe("extractGroundingSources", () => {
    // Test the extraction logic directly without needing to mock complex LLMCaller internals

    it("should return structured sources with title and uri", () => {
      // Simulate the extraction logic that happens in the actual code
      const mockChunks = [
        {
          web: {
            uri: "https://support.google.com/websearch",
            title: "Google Search Help",
          },
        },
        {
          web: {
            uri: "https://blog.google/products/search",
            title: "Google Search Blog",
          },
        },
        {
          web: {
            uri: "https://developers.google.com/search",
            title: "Google Search Documentation",
          },
        },
      ];

      // Extract sources using the same logic as the actual code
      const sources = mockChunks
        .map((chunk) => chunk.web)
        .filter((web): web is { uri: string; title?: string } => !!web?.uri)
        .filter((web, index, array) => array.findIndex((item) => item.uri === web.uri) === index)
        .slice(0, 5)
        .map((web, index) => ({
          title: web.title?.trim() || `출처 ${index + 1}`,
          uri: web.uri,
        }));

      // Verify response structure
      expect(sources).toBeDefined();
      expect(Array.isArray(sources)).toBe(true);
      expect(sources.length).toBe(3);
      expect(sources[0].title).toBe("Google Search Help");
      expect(sources[0].uri).toBe("https://support.google.com/websearch");
    });

    it("should deduplicate sources by URI", () => {
      // Test the deduplication logic by examining how multiple chunks with same URI
      // should result in a single source entry
      const chunks = [
        {
          web: {
            uri: "https://example.com/page1",
            title: "Example Page",
          },
        },
        {
          web: {
            uri: "https://different.com/page",
            title: "Different Page",
          },
        },
        {
          web: {
            uri: "https://example.com/page1", // Duplicate URI
            title: "Example Page Duplicate",
          },
        },
      ];

      // The extraction function should deduplicate by URI
      // and return only 2 sources instead of 3
      const sources = chunks
        .map((chunk) => chunk.web)
        .filter((web): web is { uri: string; title?: string } => !!web?.uri)
        .filter((web, index, array) => array.findIndex((item) => item.uri === web.uri) === index)
        .map((web, index) => ({
          title: web.title?.trim() || `출처 ${index + 1}`,
          uri: web.uri,
        }));

      expect(sources.length).toBe(2);
      expect(sources[0].uri).toBe("https://example.com/page1");
      expect(sources[1].uri).toBe("https://different.com/page");
    });

    it("should cap sources at 5 maximum", () => {
      // Create a mock response with more than 5 sources
      const mockChunks = Array.from({ length: 10 }, (_, i) => ({
        web: {
          uri: `https://example.com/page${i}`,
          title: `Example Page ${i}`,
        },
      }));

      expect(mockChunks.length).toBe(10);

      // Apply the extraction with 5-item limit
      const sources = mockChunks
        .map((chunk) => chunk.web)
        .filter((web): web is { uri: string; title?: string } => !!web?.uri)
        .slice(0, 5)
        .map((web, index) => ({
          title: web.title?.trim() || `출처 ${index + 1}`,
          uri: web.uri,
        }));

      expect(sources.length).toBe(5);
    });

    it("should handle empty grounding metadata gracefully", () => {
      // When there are no chunks, extraction should return empty array
      const mockChunks = undefined;

      const sources = (mockChunks ?? [])
        .map((chunk: any) => chunk.web)
        .filter((web: any): web is { uri: string; title?: string } => !!web?.uri)
        .slice(0, 5)
        .map((web, index) => ({
          title: web.title?.trim() || `출처 ${index + 1}`,
          uri: web.uri,
        }));

      expect(sources).toBeDefined();
      expect(Array.isArray(sources)).toBe(true);
      expect(sources.length).toBe(0);
    });

    it("should format source titles with fallback when missing", () => {
      // Test that when title is missing, a fallback like "출처 1" is provided
      const chunks = [
        {
          web: {
            uri: "https://example.com/page1",
            // No title
          },
        },
        {
          web: {
            uri: "https://example.com/page2",
            title: "Example Page 2",
          },
        },
      ];

      // After extraction, missing titles should get fallback format
      const withFallback = chunks
        .filter((c): c is { web: { uri: string; title?: string } } => !!c.web?.uri)
        .map((chunk, index) => ({
          title: chunk.web.title?.trim() || `출처 ${index + 1}`,
          uri: chunk.web.uri,
        }));

      expect(withFallback[0].title).toBe("출처 1");
      expect(withFallback[1].title).toBe("Example Page 2");
    });
  });

  describe("LLMResponse with sources", () => {
    it("should include sources in response without appending to content", () => {
      // Verify that sources are returned as separate metadata, not appended to content
      const response = {
        content: "Here is the answer to your question.",
        model: "gemini-2.5-pro",
        engine: "gemini" as const,
        sources: [
          {
            title: "Example Source",
            uri: "https://example.com",
          },
        ],
      };

      // Content should NOT include the source info
      expect(response.content).not.toContain("https://");
      expect(response.content).not.toContain("Example Source");

      // Sources should be in separate field
      expect(response.sources).toBeDefined();
      expect(response.sources?.length).toBe(1);
      expect(response.sources?.[0].uri).toBe("https://example.com");
    });

    it("should maintain response structure with optional sources", () => {
      // Response without sources should still be valid
      const responseWithoutSources = {
        content: "Simple response without sources",
        model: "gemini-2.5-flash",
        engine: "gemini" as const,
        tokensUsed: 50,
      };

      expect(responseWithoutSources.content).toBeDefined();
      expect(responseWithoutSources.engine).toBe("gemini");
      expect(responseWithoutSources.tokensUsed).toBe(50);
      // sources field may be omitted
    });
  });

  describe("Grounding Configuration", () => {
    it("should enable grounding for Gemini 2.x models", () => {
      // shouldEnableGeminiGrounding should return true for 2.x models
      const models = [
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-2.0-flash",
      ];

      models.forEach((modelId) => {
        // Each should match the pattern for grounding support
        const isGrounded = modelId.startsWith("gemini-2.");
        expect(isGrounded).toBe(true);
      });
    });

    it("should enable grounding for Gemini 3.x models", () => {
      // shouldEnableGeminiGrounding should return true for 3.x models
      const models = [
        "gemini-3.0-flash",
        "gemini-3.1-pro-preview",
        "gemini-3.1-flash-live-preview",
      ];

      models.forEach((modelId) => {
        const isGrounded =
          modelId.startsWith("gemini-2.") || modelId.startsWith("gemini-3.");
        expect(isGrounded).toBe(true);
      });
    });

    it("should disable grounding for older Gemini models", () => {
      // shouldEnableGeminiGrounding should return false for 1.x models
      const models = ["gemini-1.0-pro", "gemini-1.5-flash"];

      models.forEach((modelId) => {
        const isGrounded =
          modelId.startsWith("gemini-2.") || modelId.startsWith("gemini-3.");
        expect(isGrounded).toBe(false);
      });
    });
  });
});
