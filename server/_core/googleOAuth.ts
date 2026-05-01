import { google, Auth } from "googleapis";
import { sessionManager } from "../llm/session.ts";

type OAuth2Client = Auth.OAuth2Client;

export async function getAnyGoogleOAuthClient(): Promise<{ userId: string; auth: OAuth2Client } | null> {
  const userId = await sessionManager.getAnyAuthenticatedGoogleUserId();
  if (!userId) return null;
  const tokens = await sessionManager.getGoogleTokens(userId);
  if (!tokens?.accessToken) return null;

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID || "",
    process.env.GOOGLE_CLIENT_SECRET || "",
    process.env.GOOGLE_REDIRECT_URI || "",
  );

  client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });

  if (tokens.expiresAt < Date.now() && tokens.refreshToken) {
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token) throw new Error("No access token in refresh response");
    const expiresIn = credentials.expiry_date
      ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
      : 3600;
    await sessionManager.setGoogleTokens(userId, credentials.access_token, tokens.refreshToken, expiresIn);
    client.setCredentials({
      access_token: credentials.access_token,
      refresh_token: tokens.refreshToken,
    });
  }

  return { userId, auth: client };
}
