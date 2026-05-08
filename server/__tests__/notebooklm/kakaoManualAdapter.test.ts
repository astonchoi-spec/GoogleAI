import { describe, it, expect } from "vitest";
import { KakaoManualAdapter } from "../../knowledge/adapters/kakaoManual.ts";

describe("KakaoManualAdapter.parseRaw", () => {
  it("기본 형식 파싱 — 출처 없음", () => {
    const raw = "/kakao paste hannam-644\n[홍길동] 어제 미팅 결과\n[김철수] 사업수지표 첨부";
    const result = KakaoManualAdapter.parseRaw(raw);
    expect(result).not.toBeNull();
    expect(result!.project).toBe("hannam-644");
    expect(result!.chatRoom).toBeNull();
    expect(result!.body).toContain("[홍길동]");
  });

  it("출처(단톡방명) 포함 파싱", () => {
    const raw = "/kakao paste hannam-644 출처: 한남동PFV단톡\n[홍길동] 메시지";
    const result = KakaoManualAdapter.parseRaw(raw);
    expect(result!.chatRoom).toBe("한남동PFV단톡");
    expect(result!.body).toContain("[홍길동]");
  });

  it("출처 공백 처리", () => {
    const raw = "/kakao paste hannam-644 출처:  한남 PFV  \n본문";
    const result = KakaoManualAdapter.parseRaw(raw);
    expect(result!.chatRoom).toBe("한남 PFV");
  });

  it("본문 없으면 null", () => {
    expect(KakaoManualAdapter.parseRaw("/kakao paste hannam-644")).toBeNull();
  });

  it("빈 본문 null", () => {
    expect(KakaoManualAdapter.parseRaw("/kakao paste hannam-644\n  \n")).toBeNull();
  });

  it("형식 오류 — paste 없음", () => {
    expect(KakaoManualAdapter.parseRaw("/kakao hannam-644\n본문")).toBeNull();
  });

  it("대소문자 무관", () => {
    const raw = "/KAKAO PASTE hannam-644\n본문";
    const result = KakaoManualAdapter.parseRaw(raw);
    expect(result!.project).toBe("hannam-644");
  });
});

describe("KakaoManualAdapter.toPipelineInput", () => {
  const adapter = new KakaoManualAdapter();

  it("source_type이 kakao_manual", () => {
    const input = adapter.toPipelineInput({
      project: "hannam-644",
      chatRoom: null,
      body: "카톡 내용",
      source_ref: "kakao:test",
      received_at: "2026-05-08T00:00:00.000Z",
    });
    expect(input.source_type).toBe("kakao_manual");
  });

  it("explicit_project + permanent_knowledge 설정", () => {
    const input = adapter.toPipelineInput({
      project: "hannam-644",
      chatRoom: "한남PFV",
      body: "내용",
      source_ref: "kakao:test",
      received_at: "2026-05-08T00:00:00.000Z",
    });
    expect(input.command_hints?.explicit_project).toBe("hannam-644");
    expect(input.command_hints?.permanent_knowledge).toBe(true);
  });

  it("chatRoom이 hints에 포함", () => {
    const input = adapter.toPipelineInput({
      project: "hannam-644",
      chatRoom: "한남PFV",
      body: "내용",
      source_ref: "kakao:test",
      received_at: "2026-05-08T00:00:00.000Z",
    });
    expect(input.hints?.chat_room).toBe("한남PFV");
  });

  it("chatRoom 없으면 hints.chat_room 없음", () => {
    const input = adapter.toPipelineInput({
      project: "hannam-644",
      chatRoom: null,
      body: "내용",
      source_ref: "kakao:test",
      received_at: "2026-05-08T00:00:00.000Z",
    });
    expect(input.hints?.chat_room).toBeUndefined();
  });
});
