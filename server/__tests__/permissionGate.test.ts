import { afterEach, describe, expect, it } from "vitest";
import { checkAgentAction, describeLevel, getAgentApprovalTimeoutMs, getPermissionLevel } from "../agents/permissionGate.ts";

const ORIG = process.env.AGENT_PERMISSION_LEVEL;
const ORIG_TIMEOUT = process.env.AGENT_APPROVAL_TIMEOUT_MIN;
afterEach(() => {
  if (ORIG === undefined) delete process.env.AGENT_PERMISSION_LEVEL;
  else process.env.AGENT_PERMISSION_LEVEL = ORIG;
  if (ORIG_TIMEOUT === undefined) delete process.env.AGENT_APPROVAL_TIMEOUT_MIN;
  else process.env.AGENT_APPROVAL_TIMEOUT_MIN = ORIG_TIMEOUT;
});

describe("permissionGate", () => {
  it("defaults to level 2 (approval required)", () => {
    delete process.env.AGENT_PERMISSION_LEVEL;
    expect(getPermissionLevel()).toBe(2);
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
    const decision = checkAgentAction("execute");
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
  });

  it("does not require approval at level 3", () => {
    process.env.AGENT_PERMISSION_LEVEL = "3";
    const decision = checkAgentAction("execute");
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBeFalsy();
  });

  it("uses a 5 minute default approval timeout", () => {
    delete process.env.AGENT_APPROVAL_TIMEOUT_MIN;
    expect(getAgentApprovalTimeoutMs()).toBe(5 * 60 * 1000);
  });

  it("reads approval timeout minutes from env", () => {
    process.env.AGENT_APPROVAL_TIMEOUT_MIN = "1";
    expect(getAgentApprovalTimeoutMs()).toBe(60 * 1000);
  });

  it("describeLevel returns Korean labels", () => {
    expect(describeLevel(1)).toMatch(/읽기 전용/);
    expect(describeLevel(2)).toMatch(/승인 필요/);
    expect(describeLevel(3)).toMatch(/자동/);
  });
});
