/**
 * Google OAuth Authentication Manager
 * Handles OAuth 2.0 flow and token management
 */

import { google, Auth } from "googleapis";
type OAuth2Client = Auth.OAuth2Client;
import { SessionManager } from "../llm/session.ts";

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class GoogleAuthManager {
  private oauth2Client: OAuth2Client;
  private sessionManager: SessionManager;
  private config: GoogleAuthConfig;

  constructor(config: GoogleAuthConfig, sessionManager: SessionManager) {
    this.config = config;
    this.sessionManager = sessionManager;

    this.oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
  }

  /**
   * Get authorization URL for user to grant permissions
   */
  getAuthUrl(userId: string, scopes: string[] = this.getDefaultScopes()): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      state: userId, // Pass userId in state for verification
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string, userId: string): Promise<void> {
    const params = new URLSearchParams({
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      grant_type: "authorization_code",
    });

    console.log("[GoogleAuth] Exchanging code, client_id:", this.config.clientId.slice(0, 20) + "...");

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      console.error("[GoogleAuth] Token exchange failed:", data);
      throw new Error(data.error_description || data.error || "Token exchange failed");
    }

    if (!data.access_token) {
      throw new Error("No access token received");
    }

    await this.sessionManager.setGoogleTokens(
      userId,
      data.access_token,
      data.refresh_token || "",
      data.expires_in || 3600
    );

    this.oauth2Client.setCredentials({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
  }

  /**
   * Get authenticated OAuth2 client for API calls
   */
  async getAuthenticatedClient(userId: string): Promise<OAuth2Client> {
    try {
      const tokens = await this.sessionManager.getGoogleTokens(userId);

      if (!tokens) {
        throw new Error("No tokens found for user. Please authenticate first.");
      }

      // Check if token is expired and refresh if needed
      if (tokens.expiresAt < Date.now()) {
        if (!tokens.refreshToken) {
          throw new Error("Token expired and no refresh token available");
        }

        await this.refreshTokens(userId, tokens.refreshToken);
        return this.getAuthenticatedClient(userId);
      }

      const client = new google.auth.OAuth2(
        this.config.clientId,
        this.config.clientSecret,
        this.config.redirectUri
      );

      client.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });

      return client;
    } catch (error) {
      throw new Error(`Failed to get authenticated client: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Refresh access token
   */
  private async refreshTokens(userId: string, refreshToken: string): Promise<void> {
    try {
      const client = new google.auth.OAuth2(
        this.config.clientId,
        this.config.clientSecret,
        this.config.redirectUri
      );

      client.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } = await client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new Error("No access token in refresh response");
      }

      const expiresIn = credentials.expiry_date
        ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
        : 3600;

      await this.sessionManager.setGoogleTokens(
        userId,
        credentials.access_token,
        refreshToken,
        expiresIn
      );
    } catch (error) {
      throw new Error(`Failed to refresh tokens: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Revoke access token
   */
  async revokeToken(userId: string): Promise<void> {
    try {
      const tokens = await this.sessionManager.getGoogleTokens(userId);

      if (!tokens) {
        return;
      }

      await this.oauth2Client.revokeToken(tokens.accessToken);

      // Delete tokens from session
      await this.sessionManager.deleteSession(userId);
    } catch (error) {
      throw new Error(`Failed to revoke token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(userId: string): Promise<boolean> {
    try {
      const tokens = await this.sessionManager.getGoogleTokens(userId);
      return !!tokens?.accessToken;
    } catch {
      return false;
    }
  }

  /**
   * Get default OAuth scopes for Google Workspace APIs
   */
  private getDefaultScopes(): string[] {
    return [
      // Gmail
      "https://www.googleapis.com/auth/gmail.modify",
      // Calendar
      "https://www.googleapis.com/auth/calendar",
      // Drive
      "https://www.googleapis.com/auth/drive",
      // Sheets
      "https://www.googleapis.com/auth/spreadsheets",
      // Tasks
      "https://www.googleapis.com/auth/tasks",
    ];
  }
}

export default GoogleAuthManager;
