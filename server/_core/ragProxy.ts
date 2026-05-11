// _core/ragProxy — 도메인 간 RAG 호출용 thin re-export.
//
// Modular Monolith 원칙상 다른 도메인 모듈(server/agents, server/intent 등)은
// server/rag 를 직접 import 할 수 없다. _core 경유로 우회한다.
//
// 새 함수가 필요하면 여기에 추가 export 만 적고 본체는 server/rag/ 안에 둔다.

export { searchLocalNotes, formatCitationFooter } from "../rag/localMdSearch.ts";
export type { NoteHit, SearchOptions } from "../rag/localMdSearch.ts";
