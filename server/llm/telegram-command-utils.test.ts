import { describe, expect, it } from "vitest";
import {
  getCommandArgs,
  normalizeEngineArg,
  normalizeModelArg,
} from "./telegram-command-utils.ts";

describe("telegram-command-utils", () => {
  it("parses command arguments with repeated spaces", () => {
    const args = getCommandArgs("/use   gemini   flash");
    expect(args).toEqual(["gemini", "flash"]);
  });

  it("normalizes engine token case-insensitively", () => {
    expect(normalizeEngineArg("GeMiNi")).toBe("gemini");
    expect(normalizeEngineArg("CODEx")).toBe("codex");
  });

  it("returns null for unknown engine tokens", () => {
    expect(normalizeEngineArg("unknown")).toBeNull();
    expect(normalizeEngineArg("")).toBeNull();
    expect(normalizeEngineArg(undefined)).toBeNull();
  });

  it("normalizes model token case-insensitively", () => {
    expect(normalizeModelArg(" Flash ")).toBe("flash");
    expect(normalizeModelArg(" 3.1PRO ")).toBe("3.1pro");
  });

  it("returns null for empty model tokens", () => {
    expect(normalizeModelArg("   ")).toBeNull();
    expect(normalizeModelArg(undefined)).toBeNull();
  });
});

