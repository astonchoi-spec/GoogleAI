/**
 * 사용자 메시지에서 [첨부: <절대경로>] 패턴을 파싱해 본문을 추출하고,
 * systemPrompt 끝에 [첨부 문서] 섹션을 prepend한다.
 *
 * 두 채팅 진입점(웹 tRPC chat / 텔레그램 봇 메시지 핸들러)에서 공유 호출.
 */

import { extractAttachmentText, type AttachmentExtractResult } from "./attachmentExtract.ts";

const ATTACHMENT_PATTERN =
  /\[(?:첨부|Attached|ATTACHMENT)[:：]\s*["'`]?([\s\S]+?\.(?:pdf|md|txt|csv))["'`]?\s*\]/gi;

export interface InjectAttachmentMeta {
  path: string;
  filename: string;
  ok: boolean;
  error?: string;
  bytes?: number;
  truncated?: boolean;
  pageCount?: number;
}

export interface InjectResult {
  systemPrompt: string;
  attachments: InjectAttachmentMeta[];
  warnings: string[];
}

export async function injectAttachments(
  baseSystemPrompt: string,
  userMessage: string,
): Promise<InjectResult> {
  const matches = Array.from(userMessage.matchAll(ATTACHMENT_PATTERN));
  if (matches.length === 0) {
    return { systemPrompt: baseSystemPrompt, attachments: [], warnings: [] };
  }

  // 중복 경로 제거 (같은 메시지에 같은 파일을 두 번 적은 경우)
  const uniquePaths = Array.from(new Set(matches.map((m) => m[1].trim())));

  const results = await Promise.all(
    uniquePaths.map(async (p) => ({ path: p, result: await extractAttachmentText(p) })),
  );

  const blocks: string[] = [];
  const attachments: InjectAttachmentMeta[] = [];
  const warnings: string[] = [];

  for (const { path: p, result } of results) {
    const meta: InjectAttachmentMeta = {
      path: p,
      filename: result.filename ?? p,
      ok: result.ok,
      error: result.error,
      bytes: result.bytes,
      truncated: result.truncated,
      pageCount: result.pageCount,
    };
    attachments.push(meta);

    if (result.ok && result.text) {
      blocks.push(`### [첨부 — ${meta.filename}]\n${result.text}`);
    } else {
      blocks.push(`### [첨부 — ${meta.filename}]\n(추출 실패: ${result.error ?? "알 수 없는 오류"})`);
      if (result.error) {
        warnings.push(`${meta.filename}: ${result.error}`);
      }
    }
  }

  const section = `[첨부 문서]\n\n${blocks.join("\n\n---\n")}`;
  const systemPrompt = `${baseSystemPrompt}\n\n${section}`;

  return { systemPrompt, attachments, warnings };
}

export type { AttachmentExtractResult };
