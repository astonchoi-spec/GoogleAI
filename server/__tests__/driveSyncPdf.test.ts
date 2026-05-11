// Step 1 (2026-05-11) — driveSync PDF 본문 자동 추출 회귀 가드.
// 통합 (chokidar + tmp 폴더 + pipeline) 테스트는 비용 대비 효익 낮아
// 확장자 매핑 상수만 검증한다. PDF 본문 추출 자체는
// server/llm/attachmentExtract.test.ts 가 검증한다.

import { describe, it, expect } from "vitest";
import {
  SUPPORTED_AUTO_INGEST,
  META_ONLY_TYPES,
} from "../knowledge/driveSync.ts";

describe("driveSync 확장자 매핑 (Step 1: .pdf 본문 추출 분기)", () => {
  it(".pdf 가 SUPPORTED_AUTO_INGEST 에 포함된다", () => {
    expect(SUPPORTED_AUTO_INGEST.has(".pdf")).toBe(true);
  });

  it(".pdf 가 META_ONLY_TYPES 에서 제거되었다", () => {
    expect(META_ONLY_TYPES.has(".pdf")).toBe(false);
  });

  it("기존 자동 회수 대상 (.md / .txt / .docx) 회귀 없음", () => {
    expect(SUPPORTED_AUTO_INGEST.has(".md")).toBe(true);
    expect(SUPPORTED_AUTO_INGEST.has(".txt")).toBe(true);
    expect(SUPPORTED_AUTO_INGEST.has(".docx")).toBe(true);
  });

  it("Google 네이티브 메타파일은 여전히 META_ONLY_TYPES", () => {
    expect(META_ONLY_TYPES.has(".gdoc")).toBe(true);
    expect(META_ONLY_TYPES.has(".gsheet")).toBe(true);
  });

  it("SUPPORTED_AUTO_INGEST 와 META_ONLY_TYPES 는 상호 배타", () => {
    for (const ext of SUPPORTED_AUTO_INGEST) {
      expect(META_ONLY_TYPES.has(ext)).toBe(false);
    }
  });
});
