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

  it("includes NotebookLM execution instructions for OpenClaw", () => {
    const template = getTemplate("notebook-query");
    expect(template?.instructions).toContain("https://notebooklm.google.com");
    expect(template?.instructions).toContain("dealStore.getDeal(dealName)");
    expect(template?.instructions).toContain("질문을 입력한다");
    expect(template?.instructions).toContain("출처가 보이면 함께 기록");
  });
});
