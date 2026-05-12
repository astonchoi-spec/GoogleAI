import { describe, expect, it } from "vitest";
import { AGENT_TEMPLATES, getTemplate, listTemplates } from "../agents/agentTemplates.ts";

describe("agentTemplates", () => {
  it("exposes exactly 5 templates", () => {
    expect(listTemplates()).toHaveLength(5);
  });

  it("each template has required fields and unique id", () => {
    const ids = new Set<string>();
    for (const template of AGENT_TEMPLATES) {
      expect(template.id).toBeTruthy();
      expect(template.label).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(["pf", "trading", "research"]).toContain(template.category);
      expect(Array.isArray(template.inputs)).toBe(true);
      const requiredTarget = template.inputs.find((input) => input.key === "target");
      expect(requiredTarget?.required).toBe(true);
      expect(ids.has(template.id)).toBe(false);
      ids.add(template.id);
    }
  });

  it("getTemplate returns null on unknown id", () => {
    expect(getTemplate("nonexistent")).toBeNull();
    expect(getTemplate("pf-comprehensive")).not.toBeNull();
  });

  it("notebook-query routes to local RAG (Phase 4-A) instead of OpenClaw automation", () => {
    const template = getTemplate("notebook-query");
    expect(template?.label).toContain("회수 자료");
    expect(template?.instructions).toContain("외부 NotebookLM 자동화는 사용하지 않는다");
    expect(template?.instructions).toContain("localMdSearch");
    expect(template?.instructions).toContain("projects/*/notebooklm/*.md");
    // question 입력 파라미터는 그대로 유지
    expect(template?.inputs.find((i) => i.key === "question")?.required).toBe(true);
  });
});
