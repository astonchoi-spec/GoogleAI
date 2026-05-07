import { describe, it, expect, vi } from "vitest";
import { Classifier, type LLMJsonClient } from "../../knowledge/pipeline/classifier.ts";
import { Summarizer } from "../../knowledge/pipeline/summarizer.ts";
import { Tagger } from "../../knowledge/pipeline/tagger.ts";
import type { CleanedDocument, ClassifiedDocument, SummarizedDocument } from "../../knowledge/types.ts";

function fakeLlm(responses: unknown[]): LLMJsonClient {
  let i = 0;
  return {
    parseJson: vi.fn(async () => {
      if (i >= responses.length) throw new Error("no more fake responses");
      const r = responses[i++];
      if (r instanceof Error) throw r;
      return r as never;
    }),
  };
}

function cleanedDoc(overrides: Partial<CleanedDocument> = {}): CleanedDocument {
  return {
    source_type: "telegram",
    source_ref: "tg:1:1",
    raw_text: "한남동 644 인허가 5월 15일 신청 예정. 변호사 김변호사 컨펌받음. 컨소시엄 미팅 5/20 예정.",
    received_at: "2026-05-07T14:30:00+09:00",
    cleaned_text: "한남동 644 인허가 5월 15일 신청 예정. 변호사 김변호사 컨펌받음. 컨소시엄 미팅 5/20 예정.",
    ...overrides,
  };
}

describe("Classifier", () => {
  it("LLM 결과를 검증·필터링", async () => {
    const llm = fakeLlm([{ category: "real-estate", suggested_projects: ["hannam-644"], confidence: 0.9 }]);
    const c = new Classifier(llm);
    const r = await c.classify(cleanedDoc());
    expect(r.category).toBe("real-estate");
    expect(r.suggested_projects).toEqual(["hannam-644"]);
    expect(r.classification_confidence).toBe(0.9);
  });

  it("invalid category는 'other'로 폴백", async () => {
    const llm = fakeLlm([{ category: "fake-category", suggested_projects: [], confidence: 0.5 }]);
    const r = await new Classifier(llm).classify(cleanedDoc());
    expect(r.category).toBe("other");
  });

  it("non-kebab project는 필터링", async () => {
    const llm = fakeLlm([{ category: "other", suggested_projects: ["valid-name", "Invalid_Name", "한글명", "ok123"], confidence: 0.7 }]);
    const r = await new Classifier(llm).classify(cleanedDoc());
    expect(r.suggested_projects).toEqual(["valid-name", "ok123"]);
  });

  it("explicit_project이 있으면 LLM 호출 생략", async () => {
    const fn = vi.fn();
    const llm: LLMJsonClient = { parseJson: fn };
    const doc = cleanedDoc({ command_hints: { explicit_project: "hannam-644", explicit_command: "tg" } });
    const r = await new Classifier(llm).classify(doc);
    expect(fn).not.toHaveBeenCalled();
    expect(r.suggested_projects).toEqual(["hannam-644"]);
    expect(r.classification_confidence).toBe(1.0);
  });

  it("LLM 실패 시 throw (runner가 처리)", async () => {
    const llm = fakeLlm([new Error("rate limit")]);
    await expect(new Classifier(llm).classify(cleanedDoc())).rejects.toThrow();
  });
});

describe("Summarizer", () => {
  function classified(overrides: Partial<ClassifiedDocument> = {}): ClassifiedDocument {
    return {
      ...cleanedDoc(),
      category: "real-estate",
      suggested_projects: ["hannam-644"],
      classification_confidence: 0.9,
      ...overrides,
    };
  }

  it("100자 미만 입력은 LLM 호출 생략", async () => {
    const fn = vi.fn();
    const llm: LLMJsonClient = { parseJson: fn };
    const r = await new Summarizer(llm).summarize(classified({ cleaned_text: "짧은 메모" }));
    expect(fn).not.toHaveBeenCalled();
    expect(r.title).toBe("짧은 메모");
    expect(r.summary).toBe("짧은 메모");
  });

  it("LLM 결과 정상 파싱", async () => {
    const llm = fakeLlm([
      {
        title: "한남644 인허가 진행",
        summary: "5/15 신청 예정.",
        key_points: ["인허가 5/15", "컨소시엄 5/20"],
        action_items: [
          { text: "변호사 검토 5/13", due_date: "2026-05-13", assignee: "본인" },
          { text: "잘못된 형식", due_date: "잘못된날짜" },
        ],
      },
    ]);
    const longText =
      "한남동 644번지 PFV 사업의 인허가 신청 일정이 확정되었습니다. " +
      "5월 15일에 1차 인허가 서류를 제출할 예정이며, 김변호사 컨펌을 완료했습니다. " +
      "또한 컨소시엄 1차 미팅이 5월 20일로 예정되어 있고, 자금 조달 구조에 대해 협의 예정입니다. " +
      "후속 자료 작성과 검토는 5월 13일까지 마무리되어야 합니다.";
    const r = await new Summarizer(llm).summarize(classified({ cleaned_text: longText }));
    expect(r.title).toBe("한남644 인허가 진행");
    expect(r.key_points).toHaveLength(2);
    expect(r.action_item_candidates).toHaveLength(2);
    expect(r.action_item_candidates[0].due_date).toBe("2026-05-13");
    expect(r.action_item_candidates[1].due_date).toBeUndefined(); // invalid format dropped
  });
});

describe("Tagger", () => {
  function summarized(overrides: Partial<SummarizedDocument> = {}): SummarizedDocument {
    return {
      ...cleanedDoc(),
      category: "real-estate",
      suggested_projects: ["hannam-644"],
      classification_confidence: 0.9,
      title: "타이틀",
      summary: "요약",
      key_points: [],
      action_item_candidates: [],
      ...overrides,
    };
  }

  it("LLM 결과 정상 매핑", async () => {
    const llm = fakeLlm([
      { tags: ["부동산PF", "한남644"], people: ["김변호사"], companies: [], importance: "high", permanent_knowledge: false, privacy_level: "private" },
    ]);
    const r = await new Tagger(llm).tag(summarized());
    expect(r.tags).toEqual(["부동산PF", "한남644"]);
    expect(r.people).toEqual(["김변호사"]);
    expect(r.importance).toBe("high");
    expect(r.permanent_knowledge).toBe(false);
    expect(r.quality).toBe("complete");
  });

  it("invalid importance는 'normal'로 폴백", async () => {
    const llm = fakeLlm([{ tags: [], people: [], companies: [], importance: "super-high" }]);
    const r = await new Tagger(llm).tag(summarized());
    expect(r.importance).toBe("normal");
  });

  it("command_hints가 LLM 결과보다 우선", async () => {
    const llm = fakeLlm([{ tags: [], people: [], companies: [], importance: "low", permanent_knowledge: false }]);
    const r = await new Tagger(llm).tag(summarized({ command_hints: { importance: "high", permanent_knowledge: true } }));
    expect(r.importance).toBe("high");
    expect(r.permanent_knowledge).toBe(true);
  });
});
