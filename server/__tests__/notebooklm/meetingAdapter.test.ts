import { describe, it, expect } from "vitest";
import { MeetingAdapter } from "../../knowledge/adapters/meeting.ts";

describe("MeetingAdapter.parseRaw", () => {
  it("기본 형식 파싱", () => {
    const raw = "/meet save hannam-644\n안건 1: 인허가 일정 점검\n결론: 5월 15일 신청 확정";
    const result = MeetingAdapter.parseRaw(raw);
    expect(result).not.toBeNull();
    expect(result!.project).toBe("hannam-644");
    expect(result!.body).toContain("안건 1");
    expect(result!.attendees).toHaveLength(0);
  });

  it("참석자 포함 파싱", () => {
    const raw = "/meet save hannam-644 참석자: 홍길동,김철수\n안건 1: 사업성 검토";
    const result = MeetingAdapter.parseRaw(raw);
    expect(result!.attendees).toEqual(["홍길동", "김철수"]);
  });

  it("참석자 쉼표·공백 처리", () => {
    const raw = "/meet save hannam-644 참석자: 홍길동, 김철수, 박영희\n본문";
    const result = MeetingAdapter.parseRaw(raw);
    expect(result!.attendees).toEqual(["홍길동", "김철수", "박영희"]);
  });

  it("본문 없으면 null", () => {
    expect(MeetingAdapter.parseRaw("/meet save hannam-644")).toBeNull();
  });

  it("빈 본문 null", () => {
    expect(MeetingAdapter.parseRaw("/meet save hannam-644\n  \n")).toBeNull();
  });

  it("형식 오류 — save 없음", () => {
    expect(MeetingAdapter.parseRaw("/meet hannam-644\n본문")).toBeNull();
  });

  it("대소문자 무관", () => {
    const raw = "/MEET SAVE hannam-644\n본문";
    const result = MeetingAdapter.parseRaw(raw);
    expect(result!.project).toBe("hannam-644");
  });
});

describe("MeetingAdapter.toPipelineInput", () => {
  const adapter = new MeetingAdapter();

  it("source_type이 meeting", () => {
    const input = adapter.toPipelineInput({
      project: "hannam-644",
      attendees: [],
      body: "회의 내용",
      source_ref: "meet:test",
      received_at: "2026-05-07T00:00:00.000Z",
    });
    expect(input.source_type).toBe("meeting");
  });

  it("explicit_project 설정", () => {
    const input = adapter.toPipelineInput({
      project: "hannam-644",
      attendees: ["홍길동"],
      body: "내용",
      source_ref: "meet:test",
      received_at: "2026-05-07T00:00:00.000Z",
    });
    expect(input.command_hints?.explicit_project).toBe("hannam-644");
    expect(input.command_hints?.permanent_knowledge).toBe(true);
  });

  it("참석자가 hints에 포함", () => {
    const input = adapter.toPipelineInput({
      project: "hannam-644",
      attendees: ["홍길동", "김철수"],
      body: "내용",
      source_ref: "meet:test",
      received_at: "2026-05-07T00:00:00.000Z",
    });
    expect(input.hints?.attendees).toBe("홍길동, 김철수");
  });

  it("참석자 없으면 hints.attendees 없음", () => {
    const input = adapter.toPipelineInput({
      project: "hannam-644",
      attendees: [],
      body: "내용",
      source_ref: "meet:test",
      received_at: "2026-05-07T00:00:00.000Z",
    });
    expect(input.hints?.attendees).toBeUndefined();
  });
});
