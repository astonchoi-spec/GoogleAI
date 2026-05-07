/**
 * tRPC Router for Google Workspace API Integration
 * Handles Gmail, Calendar, Drive, and Sheets operations
 */

import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc.ts";
import GoogleAuthManager from "../google/auth.ts";
import GmailConnector from "../google/gmail.ts";
import CalendarConnector from "../google/calendar.ts";
import DriveConnector from "../google/drive.ts";
import SheetsConnector from "../google/sheets.ts";
import { getConfiguredWorkspaceSheet, saveConfiguredWorkspaceSheet, saveWorkspaceSchemaResult } from "../google/workspace-sheet-config.ts";
import { ensureWorkspaceSchema, REQUIRED_TABS } from "../google/workspaceSchema.ts";
import { sessionManager } from "../llm/session.ts"; // MODIFIED: reuse the shared session store so Google auth state stays aligned with chat and Telegram.

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
    if (ctx.user?.loginMethod !== "google") {
      return { authenticated: false, appAuthenticated: !!ctx.user, loginMethod: ctx.user?.loginMethod ?? null };
    }

    const userId = ctx.user?.id.toString() || "anonymous";
    const authenticated = await googleAuthManager.isAuthenticated(userId);
    return { authenticated, appAuthenticated: true, loginMethod: "google" };
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
        const calendar = new CalendarConnector(auth);
        const events = await calendar.getUpcomingEvents(input.maxResults);
        return { events };
      }),

    /**
     * Get today's events (KST 00:00 ~ 24:00)
     */
    getTodayEvents: publicProcedure.query(async ({ ctx }: any) => {
      const userId = ctx.user?.id.toString() || "anonymous";
      const auth = await googleAuthManager.getAuthenticatedClient(userId);
      const calendar = new CalendarConnector(auth);
      const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
      const nowKst = new Date(Date.now() + KST_OFFSET_MS);
      const y = nowKst.getUTCFullYear();
      const m = nowKst.getUTCMonth();
      const d = nowKst.getUTCDate();
      const start = new Date(Date.UTC(y, m, d) - KST_OFFSET_MS);
      const end = new Date(Date.UTC(y, m, d + 1) - KST_OFFSET_MS);
      const events = await calendar.getEventsByDateRange(start, end);
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
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
    getDefaultSpreadsheet: publicProcedure.query(async () => {
      const configured = await getConfiguredWorkspaceSheet();
      return {
        spreadsheetId: configured?.spreadsheetId || "",
        title: configured?.title || "",
        sheetTitle: configured?.sheetTitle || "",
        configured: !!configured?.spreadsheetId,
        source: process.env.WORKSPACE_SPREADSHEET_ID ? "env" : configured?.spreadsheetId ? "local" : "none",
      };
    }),

    connectDefaultSpreadsheet: protectedProcedure
      .input(
        z.object({
          title: z.string().trim().min(1).max(200).default("Aston Workspace Data"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const existing = await getConfiguredWorkspaceSheet();
        if (existing?.spreadsheetId) {
          return { ...existing, created: false };
        }

        const userId = ctx.user.id.toString();
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
        const sheets = new SheetsConnector(auth);
        const spreadsheetId = await sheets.createSpreadsheet(input.title);
        const firstSheet = await sheets.getFirstSheetInfo(spreadsheetId);
        const sheetTitle = "Workspace";
        if (firstSheet.title !== sheetTitle) {
          await sheets.renameSheet(spreadsheetId, firstSheet.sheetId, sheetTitle);
        }

        await sheets.writeSheet({
          spreadsheetId,
          range: `'${sheetTitle.replace(/'/g, "''")}'!A1:F1`,
          values: [["구분", "제목", "내용", "상태", "담당", "작성일"]],
        });

        const saved = await saveConfiguredWorkspaceSheet({
          spreadsheetId,
          title: input.title,
          sheetTitle,
        });

        return { ...saved, created: true };
      }),

    /**
     * 워크스페이스 스프레드시트 필수 탭 스키마 확인/생성 (비파괴).
     * 누락된 탭만 생성하고, tabs 결과를 workspace-sheet.json에 기록.
     */
    ensureSchema: protectedProcedure.mutation(async ({ ctx }) => {
      const configured = await getConfiguredWorkspaceSheet();
      if (!configured?.spreadsheetId) {
        throw new Error("WORKSPACE_SPREADSHEET_ID 또는 workspace-sheet.json 설정이 필요합니다.");
      }
      const userId = ctx.user.id.toString();
      const result = await ensureWorkspaceSchema(userId, configured.spreadsheetId);
      await saveWorkspaceSchemaResult({
        spreadsheetId: result.spreadsheetId,
        tabs: result.resolvedTabs,
      });
      return {
        ...result,
        requiredTabs: REQUIRED_TABS.map((t) => ({ key: t.key, title: t.title, description: t.description })),
      };
    }),

    /**
     * Read sheet data
     */
    readSheet: publicProcedure
      .input(z.object({ spreadsheetId: z.string(), range: z.string() }))
      .query(async ({ ctx, input }: any) => {
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
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
        const userId = ctx.user?.id.toString() || "anonymous";
        const auth = await googleAuthManager.getAuthenticatedClient(userId);
        const sheets = new SheetsConnector(auth);
        const spreadsheetId = await sheets.createSpreadsheet(input.title);
        return { spreadsheetId };
      }),
  }),
});

export default googleWorkspaceRouter;
