import { google, Auth } from "googleapis";
import { sessionManager } from "../llm/session.ts";

type OAuth2Client = Auth.OAuth2Client;

export async function getGoogleOAuthClient(
  userId?: string,
  options: { forceRefresh?: boolean } = {},
): Promise<{ userId: string; auth: OAuth2Client } | null> {
  const resolvedUserId = userId ?? await sessionManager.getAnyAuthenticatedGoogleUserId();
  if (!resolvedUserId) return null;
  const tokens = await sessionManager.getGoogleTokens(resolvedUserId);
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

  if ((tokens.expiresAt < Date.now() || options.forceRefresh) && tokens.refreshToken) {
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token) throw new Error("No access token in refresh response");
    const expiresIn = credentials.expiry_date
      ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
      : 3600;
    await sessionManager.setGoogleTokens(resolvedUserId, credentials.access_token, tokens.refreshToken, expiresIn);
    client.setCredentials({
      access_token: credentials.access_token,
      refresh_token: tokens.refreshToken,
    });
  }

  return { userId: resolvedUserId, auth: client };
}

export async function getAnyGoogleOAuthClient(): Promise<{ userId: string; auth: OAuth2Client } | null> {
  return getGoogleOAuthClient();
}
