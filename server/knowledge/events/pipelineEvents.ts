// 단계 8 stub — 이벤트 발행 (no-op).
// 향후 검색 인덱스 갱신, 활동 피드 알림 등을 여기에 hook.

import type { PipelineEvent, WikiEntry, RoutingDecision, TaggedDocument } from "../types.ts";

type Subscriber = (event: PipelineEvent) => void | Promise<void>;

const subscribers: Subscriber[] = [];

export function subscribe(handler: Subscriber): () => void {
  subscribers.push(handler);
  return () => {
    const idx = subscribers.indexOf(handler);
    if (idx >= 0) subscribers.splice(idx, 1);
  };
}

export async function publishWikiEntrySaved(
  entry: WikiEntry,
  doc: TaggedDocument,
  route: RoutingDecision,
): Promise<void> {
  const event: PipelineEvent = {
    event_type: "wiki_entry_saved",
    entry,
    metadata: {
      source_type: doc.source_type,
      routing_reason: route.routing_reason,
      is_permanent_knowledge: doc.permanent_knowledge,
    },
    timestamp: new Date().toISOString(),
  };
  for (const sub of subscribers) {
    try {
      await sub(event);
    } catch (e) {
      console.error("[pipelineEvents] subscriber failed:", e);
    }
  }
}
