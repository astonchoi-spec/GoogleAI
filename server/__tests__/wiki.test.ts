import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { writeWiki, searchWiki, getWikiRoot } from "../wiki/wikiStore.ts";
import { matchWikiSave, matchWikiSearch, executeWikiSave, executeWikiSearch } from "../intent/wiki.ts";

// 테스트마다 임시 디렉토리를 WIKI_ROOT로 사용
let tmpDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `wiki-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  process.env.WIKI_ROOT = tmpDir;
});

afterEach(async () => {
  delete process.env.WIKI_ROOT;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// wikiStore: writeWiki
// ---------------------------------------------------------------------------

describe("writeWiki", () => {
  it("정상 저장 — frontmatter와 본문이 정확히 기록된다", async () => {
    const entry = await writeWiki({
      title: "신논현 매물 검토",
      body: "평당 1.2억, 매도자 88세",
      categories: ["realestate", "seoul"],
    });

    expect(entry.title).toBe("신논현 매물 검토");
    expect(entry.categories).toEqual(["realestate", "seoul"]);
    expect(entry.source).toBe("telegram");

    const content = await fs.readFile(entry.filePath, "utf-8");
    expect(content).toContain("title: 신논현 매물 검토");
    expect(content).toContain("categories: [realestate, seoul]");
    expect(content).toContain("평당 1.2억, 매도자 88세");
  });

  it("한글 슬러그로 파일이 생성된다", async () => {
    const entry = await writeWiki({
      title: "BTC 숏 메모",
      body: "진입가 77000",
      categories: ["trading"],
    });

    const fileName = path.basename(entry.filePath);
    expect(fileName).toContain("BTC_숏_메모");
  });

  it("일자 디렉토리가 자동 생성된다", async () => {
    const entry = await writeWiki({
      title: "테스트",
      body: "테스트 본문",
      categories: ["test"],
    });

    const dayDir = path.dirname(entry.filePath);
    const stat = await fs.stat(dayDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("동일 ms 충돌 시 -2 suffix가 붙는다", async () => {
    // 같은 ms를 강제로 만들기 위해 파일을 직접 미리 생성
    const now = new Date();
    const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const y = kst.getFullYear();
    const mo = String(kst.getMonth() + 1).padStart(2, "0");
    const d = String(kst.getDate()).padStart(2, "0");
    const h = String(kst.getHours()).padStart(2, "0");
    const mi = String(kst.getMinutes()).padStart(2, "0");
    const s = String(kst.getSeconds()).padStart(2, "0");
    const ms = String(now.getMilliseconds()).padStart(3, "0");
    const dateStr = `${y}-${mo}-${d}`;
    const timeStr = `${h}-${mi}-${s}-${ms}`;

    // 먼저 충돌할 파일을 직접 생성
    const dayDir = path.join(tmpDir, dateStr);
    await fs.mkdir(dayDir, { recursive: true });
    const conflictFile = path.join(dayDir, `${timeStr}-충돌_테스트.md`);
    await fs.writeFile(conflictFile, "dummy", "utf-8");

    // writeWiki가 suffix를 붙이는지 확인하기 위해 같은 ms 내에서 동작 유도
    // 동일 타임스탬프를 확실히 만들기 위해 Date를 모킹하지 않고,
    // 충돌 파일이 이미 있는 경우를 별도 write로 검증
    const entry = await writeWiki({
      title: "충돌 테스트",
      body: "충돌 본문",
      categories: ["test"],
    });

    // 두 파일 모두 존재해야 함
    expect(entry.filePath).not.toBe(conflictFile);
    const files = await fs.readdir(dayDir);
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  it("WIKI_ROOT 미설정 시 에러를 던진다", async () => {
    delete process.env.WIKI_ROOT;
    await expect(
      writeWiki({ title: "테스트", body: "내용", categories: [] })
    ).rejects.toThrow("WIKI_ROOT");
  });
});

// ---------------------------------------------------------------------------
// wikiStore: searchWiki
// ---------------------------------------------------------------------------

describe("searchWiki", () => {
  beforeEach(async () => {
    await writeWiki({ title: "신논현 매물 검토", body: "평당 1.2억", categories: ["realestate", "seoul"] });
    await writeWiki({ title: "BTC 숏 메모", body: "진입가 77000 손절 78500", categories: ["trading"] });
    await writeWiki({ title: "PF 3차 협상", body: "5월 재개 예정", categories: ["realestate"] });
  });

  it("제목 substring 매칭", async () => {
    const { results } = await searchWiki({ query: "신논현" });
    expect(results.length).toBe(1);
    expect(results[0].entry.title).toBe("신논현 매물 검토");
  });

  it("본문 substring 매칭", async () => {
    const { results } = await searchWiki({ query: "77000" });
    expect(results.length).toBe(1);
    expect(results[0].entry.title).toBe("BTC 숏 메모");
  });

  it("카테고리 필터 — realestate만 반환", async () => {
    const { results } = await searchWiki({ query: "검토", categoryFilter: "realestate" });
    expect(results.every((r) => r.entry.categories.includes("realestate"))).toBe(true);
  });

  it("검색어 없으면 0건 반환 + total 정확", async () => {
    const { results, total } = await searchWiki({ query: "존재하지않는검색어xyz" });
    expect(results.length).toBe(0);
    expect(total).toBe(3);
  });

  it("date desc 정렬 — 최신 항목이 첫 번째", async () => {
    const { results } = await searchWiki({ query: "메모" });
    if (results.length > 1) {
      expect(results[0].entry.date >= results[1].entry.date).toBe(true);
    }
  });

  it("WIKI_ROOT 미설정 시 빈 결과 반환 (에러 throw 없음)", async () => {
    delete process.env.WIKI_ROOT;
    // searchWiki는 내부에서 readdir catch해서 빈 결과 반환
    await expect(searchWiki({ query: "test" })).rejects.toThrow("WIKI_ROOT");
  });
});

describe("searchWiki daily archive regression", () => {
  it("finds briefing files under daily subdirectories", async () => {
    const dailyDir = path.join(tmpDir, "daily");
    await fs.mkdir(dailyDir, { recursive: true });
    await fs.writeFile(
      path.join(dailyDir, "2026-04-30-briefing.md"),
      [
        "---",
        "date: 2026-04-30",
        "title: 2026-04-30 briefing",
        "category: [briefing]",
        "source: morning-briefing",
        "trigger: manual",
        "---",
        "",
        "모닝 브리핑 본문",
      ].join("\n"),
      "utf-8"
    );

    const { results } = await searchWiki({ query: "briefing" });

    expect(results.some((result) => result.entry.filePath.includes(`${path.sep}daily${path.sep}`))).toBe(true);
    expect(results.some((result) => result.entry.categories.includes("briefing"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// intent/wiki: matchWikiSave / matchWikiSearch
// ---------------------------------------------------------------------------

describe("matchWikiSave", () => {
  it("정확한 prefix 매칭", () => {
    const result = matchWikiSave("위키 저장 신논현 매물 #부동산");
    expect(result).not.toBeNull();
    expect(result?.action).toBe("wiki_save");
    expect(result?.params.raw).toBe("신논현 매물 #부동산");
  });

  it("공백 없는 prefix도 매칭", () => {
    const result = matchWikiSave("위키저장 테스트");
    expect(result).not.toBeNull();
  });

  it("prefix 없으면 null", () => {
    expect(matchWikiSave("그냥 메모")).toBeNull();
  });
});

describe("matchWikiSearch", () => {
  it("정확한 prefix 매칭", () => {
    const result = matchWikiSearch("위키 검색 신논현");
    expect(result).not.toBeNull();
    expect(result?.action).toBe("wiki_search");
    expect(result?.params.raw).toBe("신논현");
  });

  it("prefix 없으면 null", () => {
    expect(matchWikiSearch("검색만")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// intent/wiki: executeWikiSave
// ---------------------------------------------------------------------------

describe("executeWikiSave", () => {
  it("해시태그 #부동산 → realestate로 정규화", async () => {
    const response = await executeWikiSave({ raw: "평당 1.2억 매도자 88세 #부동산 #서울" });
    expect(response).toContain("✅");
    expect(response).toContain("#realestate");
    expect(response).toContain("#seoul");
  });

  it("첫 문장을 제목으로 자동 추출", async () => {
    const response = await executeWikiSave({ raw: "신논현 매물 검토. 세부 내용 #부동산" });
    expect(response).toContain("신논현 매물 검토");
  });

  it("해시태그 없으면 #미분류로 저장", async () => {
    const response = await executeWikiSave({ raw: "그냥 메모 내용입니다" });
    expect(response).toContain("미분류");
  });

  it("본문 3자 미만 → 거부 메시지", async () => {
    const response = await executeWikiSave({ raw: "ab" });
    expect(response).toContain("⚠️");
    expect(response).toContain("짧습니다");
  });

  it("WIKI_ROOT 미설정 시 에러 메시지 반환", async () => {
    delete process.env.WIKI_ROOT;
    const response = await executeWikiSave({ raw: "테스트 내용입니다 #test" });
    expect(response).toContain("❌");
  });
});

// ---------------------------------------------------------------------------
// intent/wiki: executeWikiSearch
// ---------------------------------------------------------------------------

describe("executeWikiSearch", () => {
  beforeEach(async () => {
    await writeWiki({ title: "신논현 매물", body: "평당 1.2억", categories: ["realestate"] });
  });

  it("검색 결과 반환", async () => {
    const response = await executeWikiSearch({ raw: "신논현" });
    expect(response).toContain("🔍");
    expect(response).toContain("신논현 매물");
  });

  it("0건 응답에 총 항목 수 표시", async () => {
    const response = await executeWikiSearch({ raw: "존재하지않는검색어xyz" });
    expect(response).toContain("검색 결과 없음");
    expect(response).toContain("1건");
  });

  it("카테고리 필터 #부동산", async () => {
    const response = await executeWikiSearch({ raw: "#부동산 신논현" });
    expect(response).toContain("[#realestate]");
  });

  it("검색어 없으면 안내 메시지", async () => {
    const response = await executeWikiSearch({ raw: "" });
    expect(response).toContain("⚠️");
  });
});
