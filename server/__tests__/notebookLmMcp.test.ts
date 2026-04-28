import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryNotebookLm, isNotebookLmEnabled } from "../integrations/notebookLmMcp.ts";

describe("NotebookLM MCP Client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NOTEBOOKLM_MCP_ENABLED;
    delete process.env.NOTEBOOKLM_MCP_URL;
  });

  it("NOTEBOOKLM_MCP_ENABLED=false일 때 비활성화 메시지를 반환한다", async () => {
    process.env.NOTEBOOKLM_MCP_ENABLED = "false";

    const result = await queryNotebookLm("테스트 질문");

    expect(result.answer).toBe("NotebookLM 연동이 비활성화되어 있습니다.");
    expect(result.sources).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("NOTEBOOKLM_MCP_ENABLED=true이고 MCP 서버가 응답할 때 answer와 sources를 반환한다", async () => {
    process.env.NOTEBOOKLM_MCP_ENABLED = "true";
    process.env.NOTEBOOKLM_MCP_URL = "http://localhost:3100";

    const mockResponse = {
      answer: "테스트 답변입니다.",
      sources: ["문서A.pdf", "문서B.txt"],
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await queryNotebookLm("테스트 질문");

    expect(result.answer).toBe("테스트 답변입니다.");
    expect(result.sources).toEqual(["문서A.pdf", "문서B.txt"]);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3100/query",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "테스트 질문" }),
      })
    );
  });

  it("MCP 서버 연결 실패 시 에러를 던지지 않고 적절한 메시지를 반환한다", async () => {
    process.env.NOTEBOOKLM_MCP_ENABLED = "true";

    vi.mocked(fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await queryNotebookLm("연결 실패 테스트");

    expect(result.answer).toContain("NotebookLM 연결 실패");
    expect(result.sources).toEqual([]);
  });
});
