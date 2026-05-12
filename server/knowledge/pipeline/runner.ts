// 파이프라인 오케스트레이션. 단계 1~7 + 이벤트 발행.
//
// 핵심 정책 (CURRENT_TASK §8 합의):
//   - LLM 실패: inline 폴백 + step_failures 메타 + quality 마킹. 진행.
//   - I/O 실패: pending 큐 + 재시도. 별도 처리.
//   - 두 실패는 같은 try-catch에 묶지 않는다.

import { llmAdapter } from "../../_core/llmAdapter.ts";
import { cleaner } from "./cleaner.ts";
import { Classifier, type LLMJsonClient } from "./classifier.ts";
import { Summarizer } from "./summarizer.ts";
import { Tagger } from "./tagger.ts";
import { router } from "./router.ts";
import { saveWikiEntry } from "../storage/wikiWriter.ts";
import { enqueuePending } from "../storage/pendingQueue.ts";
import { publishWikiEntrySaved } from "../events/pipelineEvents.ts";
import type {
  PipelineInput,
  CleanedDocument,
  ClassifiedDocument,
  SummarizedDocument,
  TaggedDocument,
  WikiEntry,
  Quality,
  ActionItemDraft,
} from "../types.ts";

export type RunResult =
  | { ok: true; entry: WikiEntry; doc: TaggedDocument; was_skipped: boolean }
  | { ok: false; reason: "io_failure"; pending_path: string; doc: TaggedDocument };

export type PipelineRunnerOptions = {
  llm?: LLMJsonClient;
};

function defaultLlm(): LLMJsonClient {
  return {
    parseJson: <T>(msg: string, sys: string) =>
      llmAdapter.parseJson<Record<string, unknown>>(msg, sys) as Promise<T>,
  };
}

export class PipelineRunner {
  private readonly classifier: Classifier;
  private readonly summarizer: Summarizer;
  private readonly tagger: Tagger;

  constructor(options: PipelineRunnerOptions = {}) {
    const llm = options.llm ?? defaultLlm();
    this.classifier = new Classifier(llm);
    this.summarizer = new Summarizer(llm);
    this.tagger = new Tagger(llm);
  }

  async run(input: PipelineInput): Promise<RunResult> {
    // 단계 2 — 정제
    const cleaned: CleanedDocument = await cleaner.clean(input);

    // 단계 3·4·5 — LLM (실패 격리, partial 진행)
    const stepFailures: string[] = [];

    let classified: ClassifiedDocument;
    try {
      classified = await this.classifier.classify(cleaned);
    } catch {
      stepFailures.push("classify");
      classified = {
        ...cleaned,
        category: "other",
        suggested_projects: cleaned.command_hints?.explicit_project ? [cleaned.command_hints.explicit_project] : [],
        classification_confidence: 0,
      };
    }

    let summarized: SummarizedDocument;
    try {
      summarized = await this.summarizer.summarize(classified);
    } catch {
      stepFailures.push("summarize");
      summarized = {
        ...classified,
        title: classified.cleaned_text.slice(0, 50) || "메모",
        summary: classified.cleaned_text,
        key_points: [],
        action_item_candidates: [] as ActionItemDraft[],
      };
    }

    let tagged: TaggedDocument;
    try {
      tagged = await this.tagger.tag(summarized);
      tagged.step_failures = [...stepFailures, ...tagged.step_failures];
    } catch {
      stepFailures.push("tag");
      tagged = {
        ...summarized,
        tags: [],
        people: [],
        companies: [],
        importance: summarized.command_hints?.importance ?? "normal",
        permanent_knowledge: summarized.command_hints?.permanent_knowledge ?? false,
        privacy_level: "private",
        step_failures: [...stepFailures],
        quality: deriveQuality(stepFailures.length),
      };
    }
    if (tagged.step_failures.length !== stepFailures.length) {
      tagged.step_failures = [...stepFailures];
    }
    tagged.quality = deriveQuality(tagged.step_failures.length);

    // 단계 6 — 라우팅
    const route = router.route(tagged);

    // 단계 7 — 저장 (I/O 실패는 별도 경로)
    try {
      const entry = await saveWikiEntry(tagged, route);
      // 단계 8 — 이벤트 (best-effort)
      void publishWikiEntrySaved(entry, tagged, route);
      return { ok: true, entry, doc: tagged, was_skipped: !!entry.was_skipped };
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      const pendingPath = await enqueuePending(tagged, route, errorObj);
      return { ok: false, reason: "io_failure", pending_path: pendingPath, doc: tagged };
    }
  }
}

function deriveQuality(failureCount: number): Quality {
  if (failureCount === 0) return "complete";
  if (failureCount <= 2) return "partial";
  return "minimal";
}
