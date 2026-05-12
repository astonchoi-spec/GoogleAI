// Workspace 스프레드시트 필수 탭 스키마 강제기.
// 기존 탭은 절대 변경하지 않는다. 누락된 탭만 생성하고 결과를 config에 기록한다.
import { google } from "googleapis";
import { getGoogleOAuthClient } from "../_core/googleOAuth.ts";

export type RequiredTab = {
  key: string;
  title: string;
  description: string;
  headers: string[];
};

export const REQUIRED_TABS: RequiredTab[] = [
  {
    key: "deals",
    title: "PF-Deals",
    description: "부동산 PF 딜 파이프라인",
    headers: ["딜명", "단계", "마감일", "노트", "담당자", "익스포저(억)", "수정일"],
  },
  {
    key: "tradingAlerts",
    title: "Trading-Alerts",
    description: "트레이딩 알림 / 리스크 가드 이벤트",
    headers: ["시각", "심볼", "방향", "조건", "트리거가격", "결과", "메모"],
  },
  {
    key: "notes",
    title: "Workspace-Notes",
    description: "워크스페이스 자유 메모 / 회의록",
    headers: ["시각", "주제", "내용", "태그", "작성자"],
  },
  {
    key: "audit",
    title: "Audit-Log",
    description: "주요 명령 / 자동화 실행 감사 로그",
    headers: ["시각", "이벤트", "주체", "대상", "결과", "비고"],
  },
];

export type SchemaCheckResult = {
  spreadsheetId: string;
  existingTabs: string[];
  createdTabs: string[];
  alreadyPresent: string[];
  resolvedTabs: Record<string, string>;
};

export function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

export async function ensureWorkspaceSchema(userId: string, spreadsheetId: string): Promise<SchemaCheckResult> {
  if (!spreadsheetId) throw new Error("spreadsheetId가 비어 있습니다.");
  const auth = await getGoogleOAuthClient(userId);
  if (!auth) throw new Error("Google OAuth 연결이 없습니다.");
  const sheetsApi = google.sheets({ version: "v4", auth: auth.auth });

  const meta = await sheetsApi.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title))",
  });
  const existingTabs = (meta.data.sheets ?? [])
    .map((s) => s.properties?.title?.trim())
    .filter((t): t is string => !!t);

  const createdTabs: string[] = [];
  const alreadyPresent: string[] = [];
  const resolvedTabs: Record<string, string> = {};

  const addRequests: Array<{ addSheet: { properties: { title: string } } }> = [];
  for (const tab of REQUIRED_TABS) {
    if (existingTabs.includes(tab.title)) {
      alreadyPresent.push(tab.title);
      resolvedTabs[tab.key] = tab.title;
    } else {
      addRequests.push({ addSheet: { properties: { title: tab.title } } });
    }
  }

  if (addRequests.length > 0) {
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: addRequests },
    });
    for (const req of addRequests) {
      const title = req.addSheet.properties.title;
      createdTabs.push(title);
      const tab = REQUIRED_TABS.find((t) => t.title === title);
      if (tab) resolvedTabs[tab.key] = tab.title;
    }
    // 새로 만든 탭에 헤더 작성 (한 번만)
    const headerWrites = REQUIRED_TABS
      .filter((t) => createdTabs.includes(t.title))
      .map((t) => ({
        range: `${quoteSheetTitle(t.title)}!A1:${columnLetter(t.headers.length)}1`,
        values: [t.headers],
      }));
    if (headerWrites.length > 0) {
      await sheetsApi.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: "USER_ENTERED", data: headerWrites },
      });
    }
  }

  return { spreadsheetId, existingTabs, createdTabs, alreadyPresent, resolvedTabs };
}

function columnLetter(index1Based: number): string {
  let n = index1Based;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result || "A";
}

export function formatSchemaCheckMessage(result: SchemaCheckResult): string {
  const lines = [`📋 Workspace 시트 스키마 점검`];
  lines.push(`스프레드시트: ${result.spreadsheetId}`);
  if (result.createdTabs.length > 0) {
    lines.push(`✅ 신규 생성: ${result.createdTabs.join(", ")}`);
  }
  if (result.alreadyPresent.length > 0) {
    lines.push(`☑️ 이미 존재: ${result.alreadyPresent.join(", ")}`);
  }
  if (result.createdTabs.length === 0 && result.alreadyPresent.length === REQUIRED_TABS.length) {
    lines.push(`모든 필수 탭 정상.`);
  }
  return lines.join("\n");
}
