/**
 * Gmail API Connector
 * Send, read, search emails with natural language commands
 */

import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: Date;
  isRead: boolean;
}

export interface GmailSendOptions {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}

export class GmailConnector {
  private gmail: gmail_v1.Gmail;

  constructor(auth: any) {
    this.gmail = google.gmail({ version: "v1", auth });
  }

  /**
   * Get recent emails
   */
  async getEmails(maxResults: number = 10, query?: string): Promise<GmailMessage[]> {
    try {
      const response = await this.gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults,
      });

      const messages = response.data.messages || [];
      const emails: GmailMessage[] = [];

      for (const message of messages) {
        if (!message.id) continue;

        const fullMessage = await this.gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "full",
        });

        const headers = fullMessage.data.payload?.headers || [];
        const getHeader = (name: string) => headers.find((h) => h.name === name)?.value || "";

        const body = this.extractBody(fullMessage.data.payload);

        emails.push({
          id: message.id,
          threadId: message.threadId || "",
          from: getHeader("From"),
          to: getHeader("To"),
          subject: getHeader("Subject"),
          body,
          date: new Date(getHeader("Date")),
          isRead: !fullMessage.data.labelIds?.includes("UNREAD"),
        });
      }

      return emails;
    } catch (error) {
      throw new Error(`Gmail API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Search emails
   */
  async searchEmails(query: string, maxResults: number = 20): Promise<GmailMessage[]> {
    return this.getEmails(maxResults, query);
  }

  /**
   * Send email
   */
  async sendEmail(options: GmailSendOptions): Promise<string> {
    try {
      const email = [
        `To: ${options.to}`,
        `Subject: ${options.subject}`,
        ...(options.cc ? [`Cc: ${options.cc}`] : []),
        ...(options.bcc ? [`Bcc: ${options.bcc}`] : []),
        "Content-Type: text/plain; charset=utf-8",
        "",
        options.body,
      ].join("\n");

      const encodedEmail = Buffer.from(email).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

      const response = await this.gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedEmail,
        },
      });

      return response.data.id || "";
    } catch (error) {
      throw new Error(`Failed to send email: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Mark email as read
   */
  async markAsRead(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: {
          removeLabelIds: ["UNREAD"],
        },
      });
    } catch (error) {
      throw new Error(`Failed to mark email as read: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete email
   */
  async deleteEmail(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.delete({
        userId: "me",
        id: messageId,
      });
    } catch (error) {
      throw new Error(`Failed to delete email: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract email body from payload
   */
  private extractBody(payload: any): string {
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === "text/plain") {
          if (part.body?.data) {
            return Buffer.from(part.body.data, "base64").toString("utf-8");
          }
        }
      }
    }

    if (payload.body?.data) {
      return Buffer.from(payload.body.data, "base64").toString("utf-8");
    }

    return "";
  }
}

export default GmailConnector;
