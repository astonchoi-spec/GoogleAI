// NotebookLmAdapter — /nb save {project} + 본문 메시지를 PipelineInput으로 변환.
//
// 입력 형식 (텔레그램 멀티라인):
//   1행: /nb save {project-id}
//   2행~: NotebookLM 답변 본문 (붙여넣기)
//   선택: 마지막에 "출처:" 섹션 포함 가능

import type { PipelineInput } from "../types.ts";

export type NbSaveEvent = {
  project: string;       // 매핑에서 검증된 project ID
  body: string;          // NotebookLM 답변 본문
  source_ref: string;    // 멱등성 키
  received_at: string;   // ISO 8601
};

export class NotebookLmAdapter {
  readonly source_type = "notebooklm" as const;

  /**
   * /nb save {project}\n{body} 형태의 raw 메시지를 파싱.
   * 첫 줄에서 project를 추출하고 나머지를 body로 반환.
   * 반환값이 null이면 형식 오류.
   */
  static parseRaw(rawMessage: string): { project: string; body: string } | null {
    const lines = rawMessage.trim().split("\n");
    const firstLine = lines[0].trim();
    const m = firstLine.match(/^\/nb\s+save\s+(\S+)$/i);
    if (!m) return null;
    const project = m[1].trim();
    const body = lines.slice(1).join("\n").trim();
    if (!body) return null;
    return { project, body };
  }

  toPipelineInput(event: NbSaveEvent): PipelineInput {
    return {
      source_type: "notebooklm",
      source_ref: event.source_ref,
      raw_text: event.body,
      command_hints: {
        explicit_project: event.project,
        permanent_knowledge: true,   // NotebookLM 분석 결과는 영구 지식
      },
      received_at: event.received_at,
    };
  }
}

export const notebookLmAdapter = new NotebookLmAdapter();
