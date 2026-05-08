// KakaoManualAdapter — /kakao paste {project} [출처: 단톡방명] + 본문 메시지를 PipelineInput으로 변환.
//
// 입력 형식 (텔레그램 멀티라인):
//   1행: /kakao paste {project-id} [출처: 단톡방명]
//   2행~: 카톡 본문 (붙여넣기)
//
// V1 기본 경로 — OpenClaw 카카오톡 미지원이므로 자동화 대신 수동 회수만 지원.
// 회수 결과는 projects/{project}/notes/ 에 저장 (회의록과 동일 카테고리).

import type { PipelineInput } from "../types.ts";

export type KakaoPasteEvent = {
  project: string;
  chatRoom: string | null;  // 단톡방명 (선택)
  body: string;
  source_ref: string;
  received_at: string;
};

export class KakaoManualAdapter {
  readonly source_type = "kakao_manual" as const;

  /**
   * /kakao paste {project} [출처: 단톡방명]\n{body} 파싱.
   * 반환값이 null이면 형식 오류.
   */
  static parseRaw(rawMessage: string): { project: string; chatRoom: string | null; body: string } | null {
    const lines = rawMessage.trim().split("\n");
    const firstLine = lines[0].trim();

    // /kakao paste {project} [출처: 단톡방명]
    const m = firstLine.match(/^\/kakao\s+paste\s+(\S+)(?:\s+출처:\s*(.+))?$/i);
    if (!m) return null;

    const project = m[1].trim();
    const chatRoom = m[2]?.trim() || null;
    const body = lines.slice(1).join("\n").trim();
    if (!body) return null;

    return { project, chatRoom, body };
  }

  toPipelineInput(event: KakaoPasteEvent): PipelineInput {
    const hints: Record<string, string | number | boolean | undefined> = {};
    if (event.chatRoom) {
      hints.chat_room = event.chatRoom;
    }

    return {
      source_type: "kakao_manual",
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

export const kakaoManualAdapter = new KakaoManualAdapter();
