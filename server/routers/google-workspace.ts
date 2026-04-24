/**
 * tRPC Router for Google Workspace API Integration
 * Handles Gmail, Calendar, Drive, and Sheets operations
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc.ts";
import GoogleAuthManager from "../google/auth.ts";
import GmailConnector from "../google/gmail.ts";
import CalendarConnector from "../google/calendar.ts";
import DriveConnector from "../google/drive.ts";
import SheetsConnector from "../google/sheets.ts";
import { SessionManager } from "../llm/session.ts";

const sessionManager = new SessionManager();

// Initialize Google Auth Manager
const googleAuthManager = new GoogleAuthManager(
  {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  },
  sessionManager
);

export { googleAuthManager };

function getGoogleAuthError(error: unknown): TRPCError {
  const message = error instanceof Error ? error.message : String(error);
  const requiresReconnect =
    message.includes("No tokens found") ||
    message.includes("Token expired") ||
    message.includes("refresh token") ||
    message.includes("invalid_grant") ||
    message.includes("Failed to refresh tokens");

  return new TRPCError({
    code: requiresReconnect ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR",
    message: requiresReconnect
      ? "Google 인증이 만료되었습니다. Google 계정을 다시 연결해주세요."
      : message,
  });
}

async function getGoogleClientForUser(ctx: any) {
  const userId = ctx.user?.id.toString() || "anonymous";

  try {
    return await googleAuthManager.getAuthenticatedClient(userId);
  } catch (error) {
    throw getGoogleAuthError(error);
  }
}

export const googleWorkspaceRouter = router({
  /**
   * Get authorization URL for OAuth flow
   */
  getAuthUrl: publicProcedure.query(({ ctx }: any) => {
    const userId = ctx.user?.id.toString() || "anonymous";
    const authUrl = googleAuthManager.getAuthUrl(userId);
    return { authUrl };
  }),

  /**
   * Exchange authorization code for tokens
   */
  exchangeCode: publicProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }: any) => {
      const userId = ctx.user?.id.toString() || "anonymous";
      await googleAuthManager.exchangeCodeForTokens(input.code, userId);
      return { success: true };
    }),

  /**
   * Check if user is authenticated with Google
   */
  isAuthenticated: publicProcedure.query(async ({ ctx }: any) => {
    const userId = ctx.user?.id.toString() || "anonymous";
    let authenticated = false;

    try {
      authenticated = await googleAuthManager.isAuthenticated(userId);
      if (authenticated) {
        await googleAuthManager.getAuthenticatedClient(userId);
      }
    } catch {
      authenticated = false;
    }

    return { authenticated };
  }),

  /**
   * Revoke Google authentication
   */
  revokeAuth: publicProcedure.mutation(async ({ ctx }: any) => {
    const userId = ctx.user?.id.toString() || "anonymous";
    await googleAuthManager.revokeToken(userId);
    return { success: true };
  }),

  // Gmail operations
  gmail: router({
    /**
     * Get recent emails
     */
    getEmails: publicProcedure
      .input(z.object({ maxResults: z.number().default(10), query: z.string().optional() }))
      .query(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const gmail = new GmailConnector(auth);
        const emails = await gmail.getEmails(input.maxResults, input.query);
        return { emails };
      }),

    /**
     * Send email
     */
    sendEmail: publicProcedure
      .input(
        z.object({
          to: z.string(),
          subject: z.string(),
          body: z.string(),
          cc: z.string().optional(),
          bcc: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const gmail = new GmailConnector(auth);
        const messageId = await gmail.sendEmail(input);
        return { messageId };
      }),

    /**
     * Mark email as read
     */
    markAsRead: publicProcedure
      .input(z.object({ messageId: z.string() }))
      .mutation(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const gmail = new GmailConnector(auth);
        await gmail.markAsRead(input.messageId);
        return { success: true };
      }),

    /**
     * Delete email
     */
    deleteEmail: publicProcedure
      .input(z.object({ messageId: z.string() }))
      .mutation(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const gmail = new GmailConnector(auth);
        await gmail.deleteEmail(input.messageId);
        return { success: true };
      }),
  }),

  // Calendar operations
  calendar: router({
    /**
     * Get upcoming events
     */
    getUpcomingEvents: publicProcedure
      .input(z.object({ maxResults: z.number().default(10) }))
      .query(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const calendar = new CalendarConnector(auth);
        const events = await calendar.getUpcomingEvents(input.maxResults);
        return { events };
      }),

    /**
     * Create event
     */
    createEvent: publicProcedure
      .input(
        z.object({
          title: z.string(),
          description: z.string().optional(),
          startTime: z.string(),
          endTime: z.string(),
          attendees: z.array(z.string()).optional(),
          location: z.string().optional(),
          isAllDay: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const calendar = new CalendarConnector(auth);
        const event = await calendar.createEvent({
          title: input.title,
          description: input.description,
          startTime: new Date(input.startTime),
          endTime: new Date(input.endTime),
          attendees: input.attendees,
          location: input.location,
          isAllDay: input.isAllDay,
        });
        return { eventId: event.id, htmlLink: event.htmlLink };
      }),

    /**
     * Get events by month (year + month, 1-based) including Korean holidays
     */
    getMonthEvents: publicProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const calendar = new CalendarConnector(auth);
        const start = new Date(input.year, input.month - 1, 1);
        const end = new Date(input.year, input.month, 1);

        // Fetch personal events + Korean holiday calendar in parallel
        const [events, holidays] = await Promise.allSettled([
          calendar.getEventsByDateRange(start, end),
          calendar.getEventsByDateRangeFromCalendar(
            "ko.south_korea#holiday@group.v.calendar.google.com",
            start, end
          ),
        ]);

        const allEvents = [
          ...(events.status === "fulfilled" ? events.value : []),
          ...(holidays.status === "fulfilled"
            ? holidays.value.map(h => ({ ...h, isHoliday: true }))
            : []),
        ];
        return { events: allEvents };
      }),

    /**
     * Delete event
     */
    deleteEvent: publicProcedure
      .input(z.object({ eventId: z.string() }))
      .mutation(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const calendar = new CalendarConnector(auth);
        await calendar.deleteEvent(input.eventId);
        return { success: true };
      }),
  }),

  // Drive operations
  drive: router({
    /**
     * List files in a folder (default: root)
     */
    listFolder: publicProcedure
      .input(z.object({ folderId: z.string().default("root"), maxResults: z.number().default(50) }))
      .query(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const drive = new DriveConnector(auth);
        const files = await drive.searchFiles(
          `'${input.folderId}' in parents and trashed = false`,
          input.maxResults
        );
        // folders first, then files, alphabetically
        files.sort((a: any, b: any) => {
          const aFolder = a.mimeType === "application/vnd.google-apps.folder";
          const bFolder = b.mimeType === "application/vnd.google-apps.folder";
          if (aFolder !== bFolder) return aFolder ? -1 : 1;
          return a.name.localeCompare(b.name, "ko");
        });
        return { files };
      }),

    /**
     * Search files
     */
    searchFiles: publicProcedure
      .input(z.object({ query: z.string(), maxResults: z.number().default(20) }))
      .query(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const drive = new DriveConnector(auth);
        const files = await drive.searchFiles(input.query, input.maxResults);
        return { files };
      }),

    /**
     * Create folder
     */
    createFolder: publicProcedure
      .input(z.object({ folderName: z.string(), parentFolderId: z.string().optional() }))
      .mutation(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const drive = new DriveConnector(auth);
        const folderId = await drive.createFolder(input.folderName, input.parentFolderId);
        return { folderId };
      }),

    /**
     * Delete file
     */
    deleteFile: publicProcedure
      .input(z.object({ fileId: z.string() }))
      .mutation(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const drive = new DriveConnector(auth);
        await drive.deleteFile(input.fileId);
        return { success: true };
      }),

    /**
     * Share file
     */
    shareFile: publicProcedure
      .input(
        z.object({
          fileId: z.string(),
          email: z.string(),
          role: z.enum(["reader", "writer", "owner"]).default("reader"),
        })
      )
      .mutation(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const drive = new DriveConnector(auth);
        await drive.shareFile(input.fileId, input.email, input.role);
        return { success: true };
      }),

    /**
     * Upload file (base64 encoded)
     */
    uploadFile: publicProcedure
      .input(
        z.object({
          fileName: z.string(),
          mimeType: z.string(),
          base64Content: z.string(),
          parentFolderId: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const drive = new DriveConnector(auth);
        const buffer = Buffer.from(input.base64Content, "base64");
        const fileId = await drive.uploadFile({
          fileName: input.fileName,
          mimeType: input.mimeType,
          fileContent: buffer,
          parentFolderId: input.parentFolderId,
        });
        return { fileId };
      }),
  }),

  // Sheets operations
  sheets: router({
    /**
     * Read sheet data
     */
    readSheet: publicProcedure
      .input(z.object({ spreadsheetId: z.string(), range: z.string() }))
      .query(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const sheets = new SheetsConnector(auth);
        const data = await sheets.readSheet(input.spreadsheetId, input.range);
        return { data };
      }),

    /**
     * Write to sheet
     */
    writeSheet: publicProcedure
      .input(
        z.object({
          spreadsheetId: z.string(),
          range: z.string(),
          values: z.array(z.array(z.any())),
        })
      )
      .mutation(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const sheets = new SheetsConnector(auth);
        await sheets.writeSheet(input);
        return { success: true };
      }),

    /**
     * Append to sheet
     */
    appendSheet: publicProcedure
      .input(
        z.object({
          spreadsheetId: z.string(),
          range: z.string(),
          values: z.array(z.array(z.any())),
        })
      )
      .mutation(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const sheets = new SheetsConnector(auth);
        await sheets.appendSheet(input);
        return { success: true };
      }),

    /**
     * Create spreadsheet
     */
    createSpreadsheet: publicProcedure
      .input(z.object({ title: z.string() }))
      .mutation(async ({ ctx, input }: any) => {
        const auth = await getGoogleClientForUser(ctx);
        const sheets = new SheetsConnector(auth);
        const spreadsheetId = await sheets.createSpreadsheet(input.title);
        return { spreadsheetId };
      }),
  }),
});

export default googleWorkspaceRouter;
