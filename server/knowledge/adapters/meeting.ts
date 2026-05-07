// MeetingAdapter — /meet save {project}\n{회의록} 를 PipelineInput으로 변환.
//
// 입력 형식 (텔레그램 멀티라인):
//   1행: /meet save {project-id} [참석자: 이름,이름]
//   2행~: 회의록 본문
//   예: /meet save hannam-644 참석자: 홍길동,김철수
//       안건 1: 인허가 일정...

import type { PipelineInput } from "../types.ts";

export type MeetRawEvent = {
  project: string;
  attendees: string[];  // 파싱된 참석자 목록
  body: string;
  source_ref: string;
  received_at: string;
};

export class MeetingAdapter {
  readonly source_type = "meeting" as const;

  /**
   * /meet save {project} [참석자: ...]\n{body} 파싱.
   * 반환값이 null이면 형식 오류.
   */
  static parseRaw(rawMessage: string): { project: string; attendees: string[]; body: string } | null {
    const lines = rawMessage.trim().split("\n");
    const firstLine = lines[0].trim();

    // /meet save {project} [참석자: 이름,이름]
    const m = firstLine.match(/^\/meet\s+save\s+(\S+)(?:\s+참석자:\s*(.+))?$/i);
    if (!m) return null;

    const project = m[1].trim();
    const attendees = m[2]
      ? m[2].split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
      : [];
    const body = lines.slice(1).join("\n").trim();
    if (!body) return null;

    return { project, attendees, body };
  }

  toPipelineInput(event: MeetRawEvent): PipelineInput {
    const hints: Record<string, string | number | boolean | undefined> = {};
    if (event.attendees.length > 0) {
      hints.attendees = event.attendees.join(", ");
    }

    return {
      source_type: "meeting",
      source_ref: event.source_ref,
      raw_text: event.body,
      hints,
      command_hints: {
        explicit_project: event.project,
        permanent_knowledge: true,
      },
      received_at: event.received_at,
    };
  }
}

export const meetingAdapter = new MeetingAdapter();
