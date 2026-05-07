import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PipelineRunner } from "../../knowledge/pipeline/runner.ts";
import type { LLMJsonClient } from "../../knowledge/pipeline/classifier.ts";
import type { PipelineInput } from "../../knowledge/types.ts";

function fakeLlmSequence(responses: unknown[]): LLMJsonClient {
  let i = 0;
  return {
    parseJson: vi.fn(async () => {
      if (i >= responses.length) throw new Error("out of fake responses");
      const r = responses[i++];
      if (r instanceof Error) throw r;
      return r as never;
    }),
  };
}

function makeInput(overrides: Partial<PipelineInput> = {}): PipelineInput {
  return {
    source_type: "telegram",
    source_ref: "tg:99:100",
    raw_text:
      "한남동 644번지 PFV 사업의 인허가 일정이 정해졌습니다. " +
      "5월 15일 1차 인허가 신청 예정이고, 김변호사 자문 컨펌 완료. " +
      "컨소시엄 1차 미팅 5월 20일이며, 자금 조달 구조 협의 예정. " +
      "후속 자료 작성과 검토는 5월 13일까지 마무리 필요. " +
      "재무 모델 업데이트 및 시나리오 분석도 병행 진행 중.",
    received_at: "2026-05-07T14:00:00+09:00",
    ...overrides,
  };
}

describe("PipelineRunner — end-to-end", () => {
  let tmpRoot: string;
  let originalCwd: string;
  let originalAston: string | undefined;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "runner-"));
    originalCwd = process.cwd();
    originalAston = process.env.ASTON_WIKI_ROOT;
    process.chdir(tmpRoot);
    process.env.ASTON_WIKI_ROOT = path.join(tmpRoot, "wiki");
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalAston === undefined) delete process.env.ASTON_WIKI_ROOT;
    else process.env.ASTON_WIKI_ROOT = originalAston;
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("explicit_project + 모든 LLM 성공 → projects/{p}/notes/에 저장 (classifier LLM 호출 생략 확인)", async () => {
    const llmFn = vi.fn(async (_: string, sys: string) => {
      // classifier는 호출되면 안 됨 (explicit_project 있음)
      // summarizer / tagger만 호출됨
      if (sys.includes("title")) return { title: "한남644 인허가", summary: "5/15 신청.", key_points: [], action_items: [] };
      if (sys.includes("permanent_knowledge")) return { tags: ["부동산PF"], people: [], companies: [], importance: "normal" };
      throw new Error("unexpected prompt");
    });
    const llm: LLMJsonClient = { parseJson: llmFn };
    const runner = new PipelineRunner({ llm });
    const result = await runner.run(makeInput({ command_hints: { explicit_command: "tg", explicit_project: "hannam-644" } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.saved_path).toContain(path.join("projects", "hannam-644", "notes"));
    expect(result.doc.suggested_projects).toEqual(["hannam-644"]);
    expect(result.doc.quality).toBe("complete");
    expect(result.doc.step_failures).toEqual([]);

    // classifier prompt(category 필드)는 절대 호출 안 됨
    const calls = llmFn.mock.calls.map((c: any) => c[1] as string);
    const classifierCalled = calls.some((p) => p.includes("category"));
    expect(classifierCalled).toBe(false);
  });

  it("explicit_project 없음 + 모든 LLM 성공 → inbox/telegram/에 저장", async () => {
    const llm = fakeLlmSequence([
      { category: "real-estate", suggested_projects: ["hannam-644"], confidence: 0.85 },
      { title: "한남644 일정", summary: "5/15 신청.", key_points: ["인허가"], action_items: [] },
      { tags: ["부동산"], people: [], companies: [], importance: "high" },
    ]);
    const result = await new PipelineRunner({ llm }).run(makeInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.saved_path).toContain(path.join("inbox", "telegram"));
    expect(result.doc.category).toBe("real-estate");
    expect(result.doc.importance).toBe("high");
  });

  it("classifier LLM 실패 → partial 진행 + step_failures 마킹", async () => {
    const llm = fakeLlmSequence([
      new Error("rate limit"),
      { title: "타이틀", summary: "요약", key_points: [], action_items: [] },
      { tags: [], people: [], companies: [], importance: "normal" },
    ]);
    const result = await new PipelineRunner({ llm }).run(makeInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.step_failures).toContain("classify");
    expect(result.doc.quality).toBe("partial");
    expect(result.doc.category).toBe("other"); // 폴백
  });

  it("3개 LLM 모두 실패 → quality=minimal, raw_text 보존, 저장 진행", async () => {
    const llm = fakeLlmSequence([new Error("e1"), new Error("e2"), new Error("e3")]);
    const result = await new PipelineRunner({ llm }).run(makeInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.step_failures).toEqual(["classify", "summarize", "tag"]);
    expect(result.doc.quality).toBe("minimal");
    expect(result.doc.raw_text).toContain("한남동 644번지");
    const content = await fs.readFile(result.entry.saved_path, "utf8");
    expect(content).toContain("quality: minimal");
    expect(content).toContain("step_failures: ['classify', 'summarize', 'tag']");
  });

  it("멱등성 — 동일 source_ref + 동일 raw_text는 was_skipped=true", async () => {
    const llmA = fakeLlmSequence([
      { category: "other", suggested_projects: [], confidence: 0.5 },
      { title: "t", summary: "s", key_points: [], action_items: [] },
      { tags: [], people: [], companies: [], importance: "normal" },
    ]);
    const r1 = await new PipelineRunner({ llm: llmA }).run(makeInput());
    expect(r1.ok).toBe(true);
    const llmB = fakeLlmSequence([
      { category: "other", suggested_projects: [], confidence: 0.5 },
      { title: "t", summary: "s", key_points: [], action_items: [] },
      { tags: [], people: [], companies: [], importance: "normal" },
    ]);
    const r2 = await new PipelineRunner({ llm: llmB }).run(makeInput());
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.was_skipped).toBe(true);
  });
});
