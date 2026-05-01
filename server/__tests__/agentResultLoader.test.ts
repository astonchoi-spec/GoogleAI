import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadAgentResultsForDate,
  parseAgentResultFileName,
} from "../agents/agentResultLoader.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `agent-results-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  process.env.AGENT_WIKI_PATH = tmpDir;
});

afterEach(async () => {
  delete process.env.AGENT_WIKI_PATH;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("parseAgentResultFileName", () => {
  it("parses date, template id, and task id from persisted agent files", () => {
    expect(parseAgentResultFileName("2026-04-30-pf-comprehensive-abc12.md")).toEqual({
      date: "2026-04-30",
      templateId: "pf-comprehensive",
      taskId: "abc12",
    });
  });

  it("ignores files that do not match the agent result pattern", () => {
    expect(parseAgentResultFileName("briefing.md")).toBeNull();
    expect(parseAgentResultFileName("2026-04-30-pf-comprehensive.md.txt")).toBeNull();
  });
});

describe("loadAgentResultsForDate", () => {
  it("filters by date and extracts metrics, preview, target, and simulation marker", async () => {
    await fs.writeFile(
      path.join(tmpDir, "2026-04-30-pf-comprehensive-abc12.md"),
      [
        "# PF 종합 분석 — 한남동644",
        "> 시뮬레이션 결과 · 생성 2026-04-30T01:00:00.000Z · task abc12",
        "",
        "## 핵심 지표",
        "- IRR(추정): 14.1%",
        "- 평당 매입단가: 4,800만원",
        "",
        "## 리스크",
        "1. 인허가 지연",
      ].join("\n")
    );
    await fs.writeFile(path.join(tmpDir, "2026-04-29-pf-comprehensive-old.md"), "# PF 종합 분석 — 과거딜");

    const results = await loadAgentResultsForDate("2026-04-30");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      taskId: "abc12",
      templateLabel: "PF 종합 분석",
      target: "한남동644",
      simulation: true,
    });
    expect(results[0].metrics).toContain("IRR");
    expect(results[0].preview).toContain("평당 매입단가");
  });

  it("returns an empty list for a missing directory", async () => {
    process.env.AGENT_WIKI_PATH = path.join(tmpDir, "missing");

    await expect(loadAgentResultsForDate("2026-04-30")).resolves.toEqual([]);
  });

  it("ignores corrupted or unreadable entries without failing the scan", async () => {
    await fs.mkdir(path.join(tmpDir, "2026-04-30-pf-comprehensive-dir.md"));
    await fs.writeFile(path.join(tmpDir, "2026-04-30-notebook-query-note9.md"), "# NotebookLM 질의 — 용인신대지구");

    const results = await loadAgentResultsForDate("2026-04-30");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ templateId: "notebook-query", taskId: "note9" });
  });
});
