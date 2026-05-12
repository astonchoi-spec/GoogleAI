import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDeal } from "../deals/dealStore.ts";
import { findMatchingDeal, inferCategory } from "../deals/dealMatcher.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `deal-matcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  process.env.DEALS_ROOT = tmpDir;
});

afterEach(async () => {
  delete process.env.DEALS_ROOT;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("dealMatcher", () => {
  it("matches exact deal names in filenames", async () => {
    await createDeal("용인신대지구");
    const match = await findMatchingDeal("[ABLE] 용인신대지구 역북동 메디컬센터.pdf");
    expect(match.confidence).toBe("exact");
    expect(match.deal?.name).toBe("용인신대지구");
  });

  it("matches whitespace variants as exact", async () => {
    await createDeal("용인 신대지구");
    const match = await findMatchingDeal("용인신대지구_사업계획서.pdf");
    expect(match.confidence).toBe("exact");
    expect(match.deal?.name).toBe("용인 신대지구");
  });

  it("returns partial when only a meaningful token matches", async () => {
    await createDeal("용인 신대지구");
    const match = await findMatchingDeal("용인_사업계획서_제1권.pdf");
    expect(match.confidence).toBe("partial");
    expect(match.deal?.name).toBe("용인 신대지구");
  });

  it("returns none when no deal token matches", async () => {
    await createDeal("한남동644");
    const match = await findMatchingDeal("사업계획서_제1권.pdf");
    expect(match.confidence).toBe("none");
    expect(match.deal).toBeNull();
  });

  it.each([
    ["변경계약서.pdf", "contract"],
    ["사업계획서_사업수지.xlsx", "feasibility"],
    ["법률 검토의견.pdf", "legal"],
    ["수요검토_NICE신용평가.pdf", "market"],
    ["도시계획위원회 심의 공고.pdf", "disclosure"],
    ["참고자료.zip", "misc"],
  ] as const)("infers %s as %s", (fileName, category) => {
    expect(inferCategory(fileName)).toBe(category);
  });
});
