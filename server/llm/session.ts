/**
 * In-Memory Session Manager
 * Handles user state, LLM engine/model selection, and conversation history
 * Uses in-memory storage for development (no Redis required)
 */

import type { LLMEngine } from "./models";
import { DEFAULT_ENGINE, DEFAULT_MODEL_KEY } from "./models";

export interface UserSession {
  userId: string;
  engine: LLMEngine;
  modelKey: string;
  conversationHistory: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
  }>;
  googleTokens?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
  lastUpdated: number;
}

export class SessionManager {
  private sessions: Map<string, UserSession> = new Map();
  private sessionTTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval to remove expired sessions
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000); // Run every hour
  }

  /**
   * Get user session or create new one
   */
  async getSession(userId: string): Promise<UserSession> {
    let session = this.sessions.get(userId);

    if (!session) {
      session = {
        userId,
        engine: DEFAULT_ENGINE,
        modelKey: DEFAULT_MODEL_KEY,
        conversationHistory: [],
        lastUpdated: Date.now(),
      };
      this.sessions.set(userId, session);
    }

    return session;
  }

  /**
   * Save user session
   */
  async saveSession(session: UserSession): Promise<void> {
    session.lastUpdated = Date.now();
    this.sessions.set(session.userId, session);
  }

  /**
   * Add message to conversation history
   */
  async addMessage(
    userId: string,
    role: "user" | "assistant" | "system",
    content: string
  ): Promise<void> {
    const session = await this.getSession(userId);
    session.conversationHistory.push({
      role,
      content,
      timestamp: Date.now(),
    });
    await this.saveSession(session);
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(
    userId: string,
    limit: number = 10
  ): Promise<UserSession["conversationHistory"]> {
    const session = await this.getSession(userId);
    return session.conversationHistory.slice(-limit);
  }

  /**
   * Clear conversation history
   */
  async clearConversationHistory(userId: string): Promise<void> {
    const session = await this.getSession(userId);
    session.conversationHistory = [];
    await this.saveSession(session);
  }

  /**
   * Set LLM engine and model
   */
  async setEngine(
    userId: string,
    engine: LLMEngine,
    modelKey: string
  ): Promise<void> {
    const session = await this.getSession(userId);
    session.engine = engine;
    session.modelKey = modelKey;
    await this.saveSession(session);
  }

  /**
   * Get current engine and model
   */
  async getEngineConfig(userId: string): Promise<{ engine: LLMEngine; modelKey: string }> {
    const session = await this.getSession(userId);
    return {
      engine: session.engine,
      modelKey: session.modelKey,
    };
  }

  /**
   * Store Google OAuth tokens
   */
  async setGoogleTokens(
    userId: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number
  ): Promise<void> {
    const session = await this.getSession(userId);
    session.googleTokens = {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    await this.saveSession(session);
  }

  /**
   * Get Google OAuth tokens
   */
  async getGoogleTokens(
    userId: string
  ): Promise<UserSession["googleTokens"] | undefined> {
    const session = await this.getSession(userId);
    return session.googleTokens;
  }

  /**
   * Delete session
   */
  async deleteSession(userId: string): Promise<void> {
    this.sessions.delete(userId);
  }

  /**
   * Get all sessions (for debugging/monitoring)
   */
  async getAllSessions(): Promise<UserSession[]> {
    const result: UserSession[] = [];
    for (const session of this.sessions.values()) {
      result.push(session);
    }
    return result;
  }

  /**
   * Get session count
   */
  async getSessionCount(): Promise<number> {
    return this.sessions.size;
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [userId, session] of this.sessions.entries()) {
      if (now - session.lastUpdated > this.sessionTTL) {
        this.sessions.delete(userId);
      }
    }
  }

  /**
   * Switch engine and model (alias for setEngine)
   */
  async switchEngine(
    userId: string,
    engine: LLMEngine,
    modelKey: string
  ): Promise<void> {
    await this.setEngine(userId, engine, modelKey);
  }

  /**
   * Get history (alias for getConversationHistory)
   */
  async getHistory(
    userId: string,
    limit?: number
  ): Promise<UserSession["conversationHistory"]> {
    return this.getConversationHistory(userId, limit);
  }

  /**
   * Clear history (alias for clearConversationHistory)
   */
  async clearHistory(userId: string): Promise<void> {
    await this.clearConversationHistory(userId);
  }

  /**
   * Disconnect/cleanup (for graceful shutdown)
   */
  async disconnect(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.sessions.clear();
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
