import { describe, it, expect } from "vitest";
import { NotebookLmAdapter } from "../../knowledge/adapters/notebooklm.ts";

describe("NotebookLmAdapter.parseRaw", () => {
  it("정상 형식 파싱", () => {
    const raw = "/nb save hannam-644\n한남동 644 사업성 분석 결과입니다.\n수익률 15% 예상.";
    const result = NotebookLmAdapter.parseRaw(raw);
    expect(result).not.toBeNull();
    expect(result!.project).toBe("hannam-644");
    expect(result!.body).toContain("한남동 644 사업성");
  });

  it("본문 없으면 null", () => {
    const raw = "/nb save hannam-644";
    expect(NotebookLmAdapter.parseRaw(raw)).toBeNull();
  });

  it("빈 본문이면 null", () => {
    const raw = "/nb save hannam-644\n   \n  ";
    expect(NotebookLmAdapter.parseRaw(raw)).toBeNull();
  });

  it("형식 오류 — save 없음", () => {
    const raw = "/nb hannam-644\n본문";
    expect(NotebookLmAdapter.parseRaw(raw)).toBeNull();
  });

  it("project에 공백 없음 검증", () => {
    const raw = "/nb save system-trading-automation\n트레이딩 자동화 분석.";
    const result = NotebookLmAdapter.parseRaw(raw);
    expect(result!.project).toBe("system-trading-automation");
  });

  it("대소문자 무관 파싱", () => {
    const raw = "/NB SAVE hannam-644\n본문 내용";
    const result = NotebookLmAdapter.parseRaw(raw);
    expect(result).not.toBeNull();
    expect(result!.project).toBe("hannam-644");
  });
});

describe("NotebookLmAdapter.toPipelineInput", () => {
  const adapter = new NotebookLmAdapter();

  it("source_type이 notebooklm", () => {
    const input = adapter.toPipelineInput({
      project: "hannam-644",
      body: "분석 결과",
      source_ref: "nb:hannam-644:test",
      received_at: "2026-05-07T00:00:00.000Z",
    });
    expect(input.source_type).toBe("notebooklm");
  });

  it("explicit_project가 command_hints에 설정됨", () => {
    const input = adapter.toPipelineInput({
      project: "hannam-644",
      body: "분석 결과",
      source_ref: "nb:test",
      received_at: "2026-05-07T00:00:00.000Z",
    });
    expect(input.command_hints?.explicit_project).toBe("hannam-644");
  });

  it("permanent_knowledge가 true", () => {
    const input = adapter.toPipelineInput({
      project: "hannam-644",
      body: "분석",
      source_ref: "nb:test",
      received_at: "2026-05-07T00:00:00.000Z",
    });
    expect(input.command_hints?.permanent_knowledge).toBe(true);
  });
});
