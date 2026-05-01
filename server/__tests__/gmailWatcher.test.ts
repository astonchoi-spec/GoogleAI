import { beforeEach, describe, expect, it, vi } from "vitest";
import { pollGmailOnce, processGmailMessage } from "../deals/gmailWatcher.ts";

function createGmailMock() {
  const attachmentData = Buffer.from("pdf").toString("base64url");
  return {
    users: {
      messages: {
        list: vi.fn(async () => ({ data: { messages: [{ id: "m1" }] } })),
        get: vi.fn(async () => ({
          data: {
            id: "m1",
            payload: {
              headers: [
                { name: "From", value: "able@example.com" },
                { name: "Subject", value: "용인신대지구 사업계획서" },
              ],
              parts: [{ filename: "사업계획서.pdf", mimeType: "application/pdf", body: { attachmentId: "a1", size: 2048 } }],
            },
          },
        })),
        attachments: { get: vi.fn(async () => ({ data: { data: attachmentData } })) },
        modify: vi.fn(async () => ({ data: {} })),
      },
      labels: {
        list: vi.fn(async () => ({ data: { labels: [] } })),
        create: vi.fn(async () => ({ data: { id: "processed" } })),
      },
    },
  } as any;
}

beforeEach(() => {
  process.env.GMAIL_AUTO_LABEL = "Aston-Deals";
});

describe("gmailWatcher", () => {
  it("lists unread labeled messages and downloads attachments for classification", async () => {
    const gmail = createGmailMock();
    const classify = vi.fn(async () => ({ status: "saved" as const, fileName: "사업계획서.pdf", dealName: "용인신대지구", category: "feasibility" as const, filePath: "x" }));

    const count = await pollGmailOnce({ gmail, classify });

    expect(count).toBe(1);
    expect(gmail.users.messages.list).toHaveBeenCalledWith(expect.objectContaining({ q: "label:Aston-Deals is:unread has:attachment" }));
    expect(classify).toHaveBeenCalledWith(expect.objectContaining({ source: "gmail", originalName: "사업계획서.pdf" }));
  });

  it("creates processed label when missing", async () => {
    const gmail = createGmailMock();
    await processGmailMessage(gmail, "m1", { classify: vi.fn(async () => ({ status: "pending" as const, fileName: "x", tempId: "t", candidates: [] })) });
    expect(gmail.users.labels.create).toHaveBeenCalledWith(expect.objectContaining({ requestBody: expect.objectContaining({ name: "Aston-Deals/Processed" }) }));
    expect(gmail.users.messages.modify).toHaveBeenCalledWith(expect.objectContaining({ requestBody: expect.objectContaining({ addLabelIds: ["processed"] }) }));
  });

  it("notifies once when OAuth token is unavailable", async () => {
    const notify = vi.fn(async () => {});
    const authProvider = vi.fn(async () => null);
    await pollGmailOnce({ authProvider, notify });
    await pollGmailOnce({ authProvider, notify });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Gmail 인증"));
  });

  it("ignores ad subjects", async () => {
    const gmail = createGmailMock();
    gmail.users.messages.get.mockResolvedValueOnce({
      data: {
        payload: {
          headers: [
            { name: "From", value: "sales@example.com" },
            { name: "Subject", value: "광고 할인 쿠폰" },
          ],
          parts: [{ filename: "coupon.pdf", mimeType: "application/pdf", body: { attachmentId: "a1", size: 2048 } }],
        },
      },
    });
    const classify = vi.fn();
    const count = await processGmailMessage(gmail, "m1", { classify: classify as any });
    expect(count).toBe(0);
    expect(classify).not.toHaveBeenCalled();
  });

  it("ignores image-only attachments", async () => {
    const gmail = createGmailMock();
    gmail.users.messages.get.mockResolvedValueOnce({
      data: {
        payload: {
          headers: [{ name: "Subject", value: "사진" }],
          parts: [{ filename: "image.png", mimeType: "image/png", body: { attachmentId: "a1", size: 2048 } }],
        },
      },
    });
    const classify = vi.fn();
    const count = await processGmailMessage(gmail, "m1", { classify: classify as any });
    expect(count).toBe(0);
  });
});
