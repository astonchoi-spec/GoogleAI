// 단계 7 — Wiki 저장. 신규 frontmatter 스키마, 멱등성 보장.
//
// 저장 경로:
//   ASTON_WIKI_ROOT > WIKI_ROOT > {cwd}/data/test-wiki  (CURRENT_TASK §8.2 합의)
//   - explicit_command 있으면: {ROOT}/projects/{project}/notes/...
//   - 없으면: {ROOT}/inbox/{source_type}/...
// 멱등성:
//   - source_ref + sha256(raw_text)가 동일하면 skip (was_skipped: true 반환)
//   - reprocess_requested: true가 frontmatter에 있으면 skip 해제 (Track A)

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { TaggedDocument, RoutingDecision, WikiEntry } from "../types.ts";

export function resolveWikiRoot(): string {
  const aston = process.env.ASTON_WIKI_ROOT?.trim();
  if (aston) return aston;
  const legacy = process.env.WIKI_ROOT?.trim();
  if (legacy) return legacy;
  // 안전 기본값 — 절대 G 드라이브가 아님
  return path.resolve(process.cwd(), "data", "test-wiki");
}

export function hashRawText(rawText: string): string {
  return crypto.createHash("sha256").update(rawText).digest("hex");
}

function safeSlug(input: string, fallback: string): string {
  const ascii = input
    .replace(/[^a-zA-Z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  if (ascii.length === 0) return fallback;
  // 한글이 많으면 short id로 fallback (영문·숫자만 남기는 더 적극적인 정리)
  const asciiOnly = ascii.replace(/[^a-zA-Z0-9-]/g, "");
  if (asciiOnly.length < 3) return fallback;
  return asciiOnly.toLowerCase();
}

function shortId(): string {
  return crypto.randomBytes(4).toString("hex");
}

function kstDate(now: Date): string {
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = kst.getFullYear();
  const mo = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function escapeYamlString(value: string): string {
  // 안전을 위해 항상 single-quoted로 감싸고 내부 작은따옴표를 ''로 이스케이프.
  // YAML 1.2에서 single-quoted scalar는 escape sequence를 해석하지 않아 가장 단순.
  return `'${value.replace(/'/g, "''")}'`;
}

function yamlList(items: string[]): string {
  if (items.length === 0) return "[]";
  return `[${items.map(escapeYamlString).join(", ")}]`;
}

function yamlActionItems(items: TaggedDocument["action_item_candidates"]): string {
  if (items.length === 0) return "[]";
  return (
    "\n" +
    items
      .map((it) => {
        const parts = [`  - text: ${escapeYamlString(it.text)}`];
        if (it.due_date) parts.push(`    due_date: ${escapeYamlString(it.due_date)}`);
        if (it.assignee) parts.push(`    assignee: ${escapeYamlString(it.assignee)}`);
        return parts.join("\n");
      })
      .join("\n")
  );
}

function buildFrontmatter(
  doc: TaggedDocument,
  rawHash: string,
  filePath: string,
): string {
  const lines: string[] = ["---"];
  // 자유 텍스트 — quote
  lines.push(`id: ${escapeYamlString(deriveId(filePath))}`);
  lines.push(`created_at: ${escapeYamlString(doc.received_at)}`);
  // enum / hash / boolean — quote 불필요
  lines.push(`source_type: ${doc.source_type}`);
  lines.push(`source_ref: ${escapeYamlString(doc.source_ref)}`);
  lines.push(`raw_text_hash: ${rawHash}`);
  lines.push(`title: ${escapeYamlString(doc.title)}`);
  lines.push(`category: ${doc.category}`);
  lines.push(`related_projects: ${yamlList(doc.suggested_projects)}`);
  // 호환성: 기존 wikiStore 검색이 categories를 보므로 함께 채움
  lines.push(`categories: ${yamlList([doc.category, ...doc.tags])}`);
  lines.push(`tags: ${yamlList(doc.tags)}`);
  lines.push(`people: ${yamlList(doc.people)}`);
  lines.push(`companies: ${yamlList(doc.companies)}`);
  lines.push(`importance: ${doc.importance}`);
  lines.push(`permanent_knowledge: ${doc.permanent_knowledge}`);
  lines.push(`privacy_level: ${doc.privacy_level}`);
  lines.push(`status: active`);
  lines.push(`quality: ${doc.quality}`);
  if (doc.step_failures.length > 0) {
    // step_failures는 enum 비슷하나 자유로운 값일 수 있으니 quote 처리
    lines.push(`step_failures: ${yamlList(doc.step_failures)}`);
  }
  lines.push(`action_items: ${yamlActionItems(doc.action_item_candidates)}`);
  lines.push(`saved_path: ${escapeYamlString(filePath)}`);
  lines.push("---");
  return lines.join("\n");
}

function deriveId(filePath: string): string {
  return path
    .basename(filePath)
    .replace(/\.md$/, "");
}

function buildBody(doc: TaggedDocument): string {
  const lines: string[] = [];
  lines.push("## 원문");
  lines.push("");
  lines.push(doc.raw_text);
  lines.push("");
  if (doc.cleaned_text && doc.cleaned_text !== doc.raw_text) {
    lines.push("## 정제본");
    lines.push("");
    lines.push(doc.cleaned_text);
    lines.push("");
  }
  if (doc.summary && doc.summary !== doc.cleaned_text) {
    lines.push("## 요약");
    lines.push("");
    lines.push(doc.summary);
    lines.push("");
  }
  if (doc.key_points.length > 0) {
    lines.push("## 핵심 포인트");
    lines.push("");
    for (const pt of doc.key_points) lines.push(`- ${pt}`);
    lines.push("");
  }
  if (doc.action_item_candidates.length > 0) {
    lines.push("## 액션 아이템");
    lines.push("");
    for (const it of doc.action_item_candidates) {
      let line = `- [ ] ${it.text}`;
      if (it.due_date) line += ` (due: ${it.due_date})`;
      if (it.assignee) line += ` — ${it.assignee}`;
      lines.push(line);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function findExistingBySourceRef(
  rootDir: string,
  sourceRef: string,
): Promise<{ filePath: string; rawHash: string; reprocessRequested: boolean } | null> {
  // 단순 walk — md 파일 frontmatter에서 source_ref 매치 검색.
  // Phase B-1 데이터 규모로는 충분. 추후 인덱스 도입 가능.
  async function walk(dir: string): Promise<string[]> {
    const result: string[] = [];
    let entries: { name: string; isDirectory: boolean; isFile: boolean }[] = [];
    try {
      const items = await fs.readdir(dir, { withFileTypes: true });
      entries = items.map((it) => ({ name: it.name, isDirectory: it.isDirectory(), isFile: it.isFile() }));
    } catch {
      return [];
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory) {
        result.push(...(await walk(full)));
      } else if (entry.isFile && entry.name.endsWith(".md")) {
        result.push(full);
      }
    }
    return result;
  }

  const files = await walk(rootDir);
  for (const file of files) {
    try {
      const content = await fs.readFile(file, "utf8");
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;
      const fm = fmMatch[1];
      const refMatch = fm.match(/^source_ref:\s*(.+)$/m);
      if (!refMatch) continue;
      const refValue = refMatch[1].trim().replace(/^['"]|['"]$/g, "").replace(/''/g, "'");
      if (refValue !== sourceRef) continue;
      const hashMatch = fm.match(/^raw_text_hash:\s*([a-f0-9]+)/m);
      const reprocessMatch = fm.match(/^reprocess_requested:\s*(true|false)/m);
      return {
        filePath: file,
        rawHash: hashMatch?.[1] ?? "",
        reprocessRequested: reprocessMatch?.[1] === "true",
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function saveWikiEntry(
  doc: TaggedDocument,
  route: RoutingDecision,
  options: { now?: Date } = {},
): Promise<WikiEntry> {
  const root = resolveWikiRoot();
  const rawHash = hashRawText(doc.raw_text);

  // 멱등성 검사
  const existing = await findExistingBySourceRef(root, doc.source_ref);
  if (existing && existing.rawHash === rawHash && !existing.reprocessRequested) {
    return {
      id: deriveId(existing.filePath),
      saved_path: existing.filePath,
      raw_text_hash: rawHash,
      was_skipped: true,
    };
  }

  const now = options.now ?? new Date();
  const date = kstDate(now);
  const targetDir = route.target_folder; // 절대 경로
  await fs.mkdir(targetDir, { recursive: true });

  const slug = safeSlug(doc.title, `note-${shortId()}`);
  let fileName = `${date}-${doc.source_type}-${slug}.md`;
  let filePath = path.join(targetDir, fileName);

  // 동일 경로에 다른 source_ref 파일이 있으면 -2, -3 suffix
  let attempt = 2;
  while (true) {
    try {
      await fs.access(filePath);
      // 기존 파일 존재. 같은 source_ref+hash이면 위에서 이미 skip됐으니, 여기 도달했으면 충돌.
      const existingContent = await fs.readFile(filePath, "utf8");
      if (existingContent.includes(`source_ref: ${doc.source_ref}`) && existingContent.includes(`raw_text_hash: ${rawHash}`)) {
        // 동일 항목 이미 존재 (race condition 등) → skip
        return { id: deriveId(filePath), saved_path: filePath, raw_text_hash: rawHash, was_skipped: true };
      }
      fileName = `${date}-${doc.source_type}-${slug}-${attempt}.md`;
      filePath = path.join(targetDir, fileName);
      attempt++;
    } catch {
      break;
    }
  }

  const frontmatter = buildFrontmatter(doc, rawHash, filePath);
  const body = buildBody(doc);
  const content = `${frontmatter}\n\n${body}`;
  await fs.writeFile(filePath, content, "utf8");

  return {
    id: deriveId(filePath),
    saved_path: filePath,
    raw_text_hash: rawHash,
  };
}
