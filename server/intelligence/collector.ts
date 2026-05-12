/**
 * Phase 1d — MTProto 텔레그램 채널 수집기
 * 회장이 참여한 채널 메시지를 수집 → Gemini 분류 → Wiki 자동 저장
 */
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import type { NewMessageEvent } from "telegram/events/NewMessage.js";
import * as readline from "node:readline/promises";
import fs from "node:fs/promises";
import path from "node:path";
import { llmAdapter } from "../_core/llmAdapter.ts";
import { writeWiki } from "../_core/wikiProxy.ts";

const SESSION_PATH = path.resolve(process.cwd(), "data", "mtproto-session.txt");
const MIN_MESSAGE_LENGTH = 150;        // 150자 미만은 저장 안 함 (비용 절감)
const MAX_DAILY_CALLS = Number(process.env.COLLECTOR_DAILY_LIMIT ?? "200"); // 일일 Gemini 호출 상한
const RELEVANCE_KEYWORDS = [           // 이 키워드 포함 메시지만 처리 (비어있으면 전체)
  // 부동산
  "부동산", "PF", "매입", "매각", "임대", "토지", "건물", "아파트", "분양", "재개발",
  // 코인/트레이딩
  "비트코인", "BTC", "ETH", "코인", "거래소", "선물", "현물", "알트코인", "온체인",
  // 주식/시장
  "주식", "삼성", "반도체", "금리", "환율", "달러", "나스닥", "코스피", "ETF",
  // 제약/바이오
  "바이오", "제약", "임상", "신약", "FDA", "허가", "임상시험",
  // 중국/글로벌 거시
  "중국", "미중", "관세", "무역", "인플레", "GDP", "경기", "연준", "금리",
  // 기타
  "몽골", "계약", "법무", "소송", "리서치", "공시",
];

let todayCallCount = 0;
let todayDate = new Date().toDateString();

function checkDailyLimit(): boolean {
  const today = new Date().toDateString();
  if (today !== todayDate) { todayDate = today; todayCallCount = 0; }
  if (todayCallCount >= MAX_DAILY_CALLS) {
    console.log(`[collector] 일일 한도 도달 (${MAX_DAILY_CALLS}건) — 오늘은 수집 중단`);
    return false;
  }
  todayCallCount++;
  return true;
}

function isRelevant(text: string): boolean {
  if (RELEVANCE_KEYWORDS.length === 0) return true;
  const lower = text.toLowerCase();
  return RELEVANCE_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

type CollectorConfig = {
  apiId: number;
  apiHash: string;
  phone: string;
  channelIds: string[]; // username 또는 숫자 id
};

function getConfig(): CollectorConfig | null {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH ?? "";
  const phone = process.env.TELEGRAM_PHONE ?? "";
  const channelIds = (process.env.TELEGRAM_CHANNEL_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!apiId || !apiHash) return null;
  return { apiId, apiHash, phone, channelIds };
}

async function loadSession(): Promise<string> {
  try {
    return await fs.readFile(SESSION_PATH, "utf8");
  } catch {
    return "";
  }
}

async function saveSession(session: string): Promise<void> {
  await fs.mkdir(path.dirname(SESSION_PATH), { recursive: true });
  await fs.writeFile(SESSION_PATH, session, "utf8");
}

async function classifyAndSave(text: string, channelName: string): Promise<void> {
  if (text.length < MIN_MESSAGE_LENGTH) return;
  if (!isRelevant(text)) { console.log(`[collector] 관련 없음 — 스킵: ${text.slice(0, 30)}...`); return; }
  if (!checkDailyLimit()) return;

  const prompt = `다음 텔레그램 채널 메시지를 분석해서 JSON만 반환하세요.
채널: ${channelName}

카테고리: realestate, trading, crypto, stock, legal, company, mongolia, research, strategy, macro, ai, general
{"category":"...","summary":"한국어 1~2문장 요약","tags":["키워드1","키워드2"]}`;

  try {
    const result = await llmAdapter.parseJson<{ category: string; summary: string; tags: string[] }>(
      text.slice(0, 1000),
      prompt
    );

    const category = result.category || "general";
    const summary = result.summary || text.slice(0, 100);
    const tags = Array.isArray(result.tags) ? result.tags : [];

    await writeWiki({
      title: summary.slice(0, 50),
      body: `${summary}\n\n[채널: ${channelName}]\n${text.slice(0, 2000)}`,
      categories: [category, ...tags],
      source: `mtproto:${channelName}`,
    });

    console.log(`[collector] 저장 완료: #${category} | ${summary.slice(0, 50)}`);
  } catch (e) {
    console.error("[collector] 분류 실패:", (e as Error).message);
  }
}

let client: TelegramClient | null = null;
let isRunning = false;

export async function startCollector(): Promise<void> {
  if (isRunning) return;

  const config = getConfig();
  if (!config) {
    console.log("[collector] TELEGRAM_API_ID / TELEGRAM_API_HASH 미설정 — 수집기 비활성화");
    return;
  }

  const sessionStr = await loadSession();
  const session = new StringSession(sessionStr);

  client = new TelegramClient(session, config.apiId, config.apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => {
      if (config.phone) return config.phone;
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const num = await rl.question("[MTProto] 전화번호 입력 (+82로 시작): ");
      rl.close();
      return num.trim();
    },
    password: async () => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const pw = await rl.question("[MTProto] 2FA 비밀번호: ");
      rl.close();
      return pw.trim();
    },
    phoneCode: async () => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const code = await rl.question("[MTProto] 텔레그램 인증 코드: ");
      rl.close();
      return code.trim();
    },
    onError: (err: unknown) => console.error("[collector] MTProto 에러:", err),
  });

  await saveSession(String(client.session.save()));
  isRunning = true;
  console.log("[collector] MTProto 연결 완료 — 채널 수집 시작");

  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      const msg = event.message;
      const text = msg.text ?? "";
      if (!text || text.length < MIN_MESSAGE_LENGTH) return;

      const chat = await msg.getChat();
      const channelName = (chat as any)?.title ?? (chat as any)?.username ?? "unknown";

      if (config.channelIds.length > 0) {
        const chatId = String((chat as any)?.id ?? "");
        const username = String((chat as any)?.username ?? "");
        const isTarget = config.channelIds.some(
          (id) => id === chatId || id === username || id === `@${username}`
        );
        if (!isTarget) return;
      }

      console.log(`[collector] 새 메시지 수신: ${channelName} (${text.length}자)`);
      await classifyAndSave(text, channelName);
    } catch (e) {
      console.error("[collector] 이벤트 처리 실패:", (e as Error).message);
    }
  }, new NewMessage({ incoming: true }));
}

export async function stopCollector(): Promise<void> {
  if (client) {
    await client.disconnect();
    client = null;
    isRunning = false;
    console.log("[collector] MTProto 연결 종료");
  }
}

export function isCollectorRunning(): boolean {
  return isRunning;
}
