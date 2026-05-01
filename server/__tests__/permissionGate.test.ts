import { afterEach, describe, expect, it } from "vitest";
import { checkAgentAction, describeLevel, getPermissionLevel } from "../agents/permissionGate.ts";

const ORIG = process.env.AGENT_PERMISSION_LEVEL;
afterEach(() => {
  if (ORIG === undefined) delete process.env.AGENT_PERMISSION_LEVEL;
  else process.env.AGENT_PERMISSION_LEVEL = ORIG;
});

describe("permissionGate", () => {
  it("defaults to level 1 (read only)", () => {
    delete process.env.AGENT_PERMISSION_LEVEL;
    expect(getPermissionLevel()).toBe(1);
  });

  it("blocks execute action at level 1", () => {
    process.env.AGENT_PERMISSION_LEVEL = "1";
    const decision = checkAgentAction("execute");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/시뮬레이션/);
  });

  it("allows list/read at level 1", () => {
    process.env.AGENT_PERMISSION_LEVEL = "1";
    expect(checkAgentAction("list").allowed).toBe(true);
    expect(checkAgentAction("read").allowed).toBe(true);
  });

  it("allows execute at level 2", () => {
    process.env.AGENT_PERMISSION_LEVEL = "2";
    expect(checkAgentAction("execute").allowed).toBe(true);
  });

  it("describeLevel returns Korean labels", () => {
    expect(describeLevel(1)).toMatch(/읽기 전용/);
    expect(describeLevel(2)).toMatch(/승인 필요/);
    expect(describeLevel(3)).toMatch(/자동/);
  });
});
