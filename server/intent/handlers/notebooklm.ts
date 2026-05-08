import crypto from "node:crypto";
import { handleNbCommand } from "../../notebooklm/notebookQuery.ts";
import { loadMapping } from "../../notebooklm/mappingLoader.ts";
import { NotebookLmAdapter, notebookLmAdapter } from "../../knowledge/adapters/notebooklm.ts";
import { MeetingAdapter, meetingAdapter } from "../../knowledge/adapters/meeting.ts";
import { KakaoManualAdapter, kakaoManualAdapter } from "../../knowledge/adapters/kakaoManual.ts";
import { PipelineRunner } from "../../knowledge/pipeline/runner.ts";
import type { HandlerMap, IntentHandler } from "../types.ts";

const runner = new PipelineRunner();

const nbCommand: IntentHandler = async (intent) => {
  const raw = String(intent.params.raw ?? "");
  const text = handleNbCommand(raw);
  // Phase 6-D-9 — `handleNbCommand` 가 매핑 조회/검색/도움말 등 다양한 응답을
  // 단일 string 으로 반환. response 통합형 + text="". 사용자 입력 raw 는 meta
  // 에 미포함 (length 만 기록).
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: text,
    handlerResponse: {
      kind: "text",
      text: "",
      meta: {
        action: "nb_command",
        rawLength: raw.length,
      },
    },
  };
};

const nbSave: IntentHandler = async (intent, options) => {
  const raw = String(intent.params.raw ?? "").trim();

  const parsed = NotebookLmAdapter.parseRaw(raw);
  if (!parsed) {
    // Phase 6-D-9 — 형식 오류. kind="text" + meta.status="invalid_format".
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: [
        "❌ 형식 오류. 올바른 형식:",
        "```",
        "/nb save {project-id}",
        "NotebookLM 답변 본문...",
        "```",
        "project-id 목록: `/nb list`",
      ].join("\n"),
      handlerResponse: {
        kind: "error",
        text: "",
        meta: {
          action: "nb_save",
          status: "invalid_format",
          rawLength: raw.length,
        },
      },
    };
  }

  // project ID 검증
  const { notebooks } = loadMapping();
  const notebook = notebooks.find((n) => n.project === parsed.project);
  if (!notebook) {
    const suggestions = notebooks
      .filter((n) => n.project.includes(parsed.project) || parsed.project.includes(n.project.split("-")[0]))
      .slice(0, 3)
      .map((n) => `• \`${n.project}\` — ${n.display_name}`)
      .join("\n");
    // Phase 6-D-9 — project 미발견. kind="text" + meta.status="project_not_found".
    // requestedProject 는 사용자 입력에서 추출된 영문 enum 형태라 안전.
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: [
        `❌ project \`${parsed.project}\` 없음.`,
        ...(suggestions ? ["유사 항목:", suggestions] : ["`/nb list`로 전체 목록 확인"]),
      ].join("\n"),
      handlerResponse: {
        kind: "error",
        text: "",
        meta: {
          action: "nb_save",
          status: "project_not_found",
          requestedProject: parsed.project,
          suggestionCount: suggestions ? suggestions.split("\n").length : 0,
        },
      },
    };
  }

  const textHash = crypto.createHash("sha256").update(parsed.body).digest("hex").slice(0, 16);
  const sourceRef = `nb:${parsed.project}:user:${options.userId}:hash:${textHash}`;

  const input = notebookLmAdapter.toPipelineInput({
    project: parsed.project,
    body: parsed.body,
    source_ref: sourceRef,
    received_at: new Date().toISOString(),
  });

  const result = await runner.run(input);

  if (!result.ok) {
    // Phase 6-D-9 — 저장 실패 (pending 큐 보관). kind="error" 활성화 금지 제약상
    // kind="text" + meta.status="error" 임시. Phase 6-D 후반부 일괄 재분류.
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `⚠️ Wiki 저장 실패 — pending 큐에 보관됨\n📁 ${result.pending_path}`,
      handlerResponse: {
        kind: "error",
        text: "",
        meta: {
          action: "nb_save",
          status: "error",
          stage: "pipeline_run",
          project: parsed.project,
        },
      },
    };
  }

  const skipNote = result.was_skipped ? " (이미 저장된 동일 내용 — skip)" : "";
  const qualityNote = result.doc.quality !== "complete" ? ` (quality: ${result.doc.quality})` : "";

  // Phase 6-D-9 — 저장 성공. response 다중 라인 통합형. kind="text" + text="".
  // doc.title 은 LLM 추출 결과로 사용자 입력 원문이 아님 (제목 한 줄). hasTitle
  // boolean 만 meta 에 기록. body / sourceRef / textHash 는 meta 미포함.
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: [
      `✅ NotebookLM 회수 완료${skipNote}${qualityNote}`,
      `📓 ${notebook.display_name}`,
      `💬 ${result.doc.title}`,
      `📁 ${result.entry.saved_path}`,
    ].join("\n"),
    data: {
      saved_path: result.entry.saved_path,
      was_skipped: result.was_skipped,
      quality: result.doc.quality,
    },
    handlerResponse: {
      kind: "text",
      text: "",
      meta: {
        action: "nb_save",
        status: "saved",
        project: parsed.project,
        wasSkipped: result.was_skipped,
        quality: result.doc.quality,
        hasTitle: typeof result.doc.title === "string" && result.doc.title.length > 0,
        bodyLength: parsed.body.length,
      },
    },
  };
};

const meetSave: IntentHandler = async (intent, options) => {
  const raw = String(intent.params.raw ?? "").trim();

  const parsed = MeetingAdapter.parseRaw(raw);
  if (!parsed) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: [
        "❌ 형식 오류. 올바른 형식:",
        "```",
        "/meet save {project-id} [참석자: 이름,이름]",
        "회의록 본문...",
        "```",
        "project-id 목록: `/nb list`",
      ].join("\n"),
      handlerResponse: {
        kind: "error",
        text: "",
        meta: {
          action: "meet_save",
          status: "invalid_format",
          rawLength: raw.length,
        },
      },
    };
  }

  // project ID 검증
  const { notebooks } = loadMapping();
  const notebook = notebooks.find((n) => n.project === parsed.project);
  if (!notebook) {
    const suggestions = notebooks
      .filter((n) => n.project.includes(parsed.project) || parsed.project.includes(n.project.split("-")[0]))
      .slice(0, 3)
      .map((n) => `• \`${n.project}\` — ${n.display_name}`)
      .join("\n");
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: [
        `❌ project \`${parsed.project}\` 없음.`,
        ...(suggestions ? ["유사 항목:", suggestions] : ["`/nb list`로 전체 목록 확인"]),
      ].join("\n"),
      handlerResponse: {
        kind: "error",
        text: "",
        meta: {
          action: "meet_save",
          status: "project_not_found",
          requestedProject: parsed.project,
          suggestionCount: suggestions ? suggestions.split("\n").length : 0,
        },
      },
    };
  }

  const textHash = crypto.createHash("sha256").update(parsed.body).digest("hex").slice(0, 16);
  const sourceRef = `meet:${parsed.project}:user:${options.userId}:hash:${textHash}`;

  const input = meetingAdapter.toPipelineInput({
    project: parsed.project,
    attendees: parsed.attendees,
    body: parsed.body,
    source_ref: sourceRef,
    received_at: new Date().toISOString(),
  });

  const result = await runner.run(input);

  if (!result.ok) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `⚠️ 회의록 저장 실패 — pending 큐에 보관됨\n📁 ${result.pending_path}`,
      handlerResponse: {
        kind: "error",
        text: "",
        meta: {
          action: "meet_save",
          status: "error",
          stage: "pipeline_run",
          project: parsed.project,
        },
      },
    };
  }

  const skipNote = result.was_skipped ? " (중복 — skip)" : "";
  const qualityNote = result.doc.quality !== "complete" ? ` (quality: ${result.doc.quality})` : "";
  const attendeeLine = parsed.attendees.length > 0 ? `\n👥 참석자: ${parsed.attendees.join(", ")}` : "";

  // Phase 6-D-9 — 회의록 저장 성공. attendees 는 사용자 입력 이름이라 meta 에는
  // attendeesCount 만 기록 (개별 이름 미포함).
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: [
      `✅ 회의록 저장 완료${skipNote}${qualityNote}`,
      `📂 ${notebook.display_name}${attendeeLine}`,
      `💬 ${result.doc.title}`,
      `📁 ${result.entry.saved_path}`,
    ].join("\n"),
    data: {
      saved_path: result.entry.saved_path,
      was_skipped: result.was_skipped,
      quality: result.doc.quality,
    },
    handlerResponse: {
      kind: "text",
      text: "",
      meta: {
        action: "meet_save",
        status: "saved",
        project: parsed.project,
        wasSkipped: result.was_skipped,
        quality: result.doc.quality,
        hasTitle: typeof result.doc.title === "string" && result.doc.title.length > 0,
        attendeesCount: parsed.attendees.length,
        bodyLength: parsed.body.length,
      },
    },
  };
};

const kakaoPaste: IntentHandler = async (intent, options) => {
  const raw = String(intent.params.raw ?? "").trim();

  const parsed = KakaoManualAdapter.parseRaw(raw);
  if (!parsed) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: [
        "❌ 형식 오류. 올바른 형식:",
        "```",
        "/kakao paste {project-id} [출처: 단톡방명]",
        "카톡 본문...",
        "```",
        "project-id 목록: `/nb list`",
      ].join("\n"),
      handlerResponse: {
        kind: "error",
        text: "",
        meta: {
          action: "kakao_paste",
          status: "invalid_format",
          rawLength: raw.length,
        },
      },
    };
  }

  // project ID 검증 (NotebookLM 매핑과 동일 출처 사용)
  const { notebooks } = loadMapping();
  const notebook = notebooks.find((n) => n.project === parsed.project);
  if (!notebook) {
    const suggestions = notebooks
      .filter((n) => n.project.includes(parsed.project) || parsed.project.includes(n.project.split("-")[0]))
      .slice(0, 3)
      .map((n) => `• \`${n.project}\` — ${n.display_name}`)
      .join("\n");
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: [
        `❌ project \`${parsed.project}\` 없음.`,
        ...(suggestions ? ["유사 항목:", suggestions] : ["`/nb list`로 전체 목록 확인"]),
      ].join("\n"),
      handlerResponse: {
        kind: "error",
        text: "",
        meta: {
          action: "kakao_paste",
          status: "project_not_found",
          requestedProject: parsed.project,
          suggestionCount: suggestions ? suggestions.split("\n").length : 0,
        },
      },
    };
  }

  const textHash = crypto.createHash("sha256").update(parsed.body).digest("hex").slice(0, 16);
  const sourceRef = `kakao:${parsed.project}:user:${options.userId}:hash:${textHash}`;

  const input = kakaoManualAdapter.toPipelineInput({
    project: parsed.project,
    chatRoom: parsed.chatRoom,
    body: parsed.body,
    source_ref: sourceRef,
    received_at: new Date().toISOString(),
  });

  const result = await runner.run(input);

  if (!result.ok) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `⚠️ 카톡 회수 실패 — pending 큐에 보관됨\n📁 ${result.pending_path}`,
      handlerResponse: {
        kind: "error",
        text: "",
        meta: {
          action: "kakao_paste",
          status: "error",
          stage: "pipeline_run",
          project: parsed.project,
        },
      },
    };
  }

  const skipNote = result.was_skipped ? " (중복 — skip)" : "";
  const qualityNote = result.doc.quality !== "complete" ? ` (quality: ${result.doc.quality})` : "";
  const chatRoomLine = parsed.chatRoom ? `\n💬 출처: ${parsed.chatRoom}` : "";

  // Phase 6-D-9 — 카톡 회수 성공. chatRoom 은 사용자 입력 채팅방명이라 meta 에는
  // hasChatRoom boolean 만 기록 (이름 미포함).
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: [
      `✅ 카톡 회수 완료${skipNote}${qualityNote}`,
      `📂 ${notebook.display_name}${chatRoomLine}`,
      `📝 ${result.doc.title}`,
      `📁 ${result.entry.saved_path}`,
    ].join("\n"),
    data: {
      saved_path: result.entry.saved_path,
      was_skipped: result.was_skipped,
      quality: result.doc.quality,
    },
    handlerResponse: {
      kind: "text",
      text: "",
      meta: {
        action: "kakao_paste",
        status: "saved",
        project: parsed.project,
        wasSkipped: result.was_skipped,
        quality: result.doc.quality,
        hasTitle: typeof result.doc.title === "string" && result.doc.title.length > 0,
        hasChatRoom: typeof parsed.chatRoom === "string" && parsed.chatRoom.length > 0,
        bodyLength: parsed.body.length,
      },
    },
  };
};

export const notebooklmHandlers: HandlerMap = {
  nb_command: nbCommand,
  nb_save: nbSave,
  meet_save: meetSave,
  kakao_paste: kakaoPaste,
};
