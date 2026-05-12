# PDF/MD/TXT/CSV 인라인 첨부 → LLM 컨텍스트 인젝션 설계

- 작성일: 2026-05-10
- 대상 프로젝트: `구글연동AI` (Google Ecosystem + Telegram 양방향 AI 어시스턴트)
- 브랜치: `claude/blissful-rubin-98d15e`
- 참고: ASTON AI(별도 Electron 앱, archive 결정)에서 검증된 PDF 추출 패턴을 본 워크스테이션으로 이식. ASTON AI 코드는 직접 복사하지 않고 패턴만 차용해 본 프로젝트 컨벤션(tsx/ESM/vitest/tRPC)으로 재작성.

---

## 1. 배경 / 문제

회장님이 사용하는 PF IM, 계약서, 법률 자료가 대부분 PDF인데, 본 워크스테이션의 채팅 진입점(웹 tRPC, 텔레그램 봇)에서 PDF/MD/TXT/CSV 본문을 LLM 컨텍스트로 주입할 수단이 없음. 사용자가 메시지에 절대경로를 적어도 시스템이 읽지 못함.

ASTON AI에서는 동일 문제를 `pdf2json` 기반 추출 + systemPrompt 주입으로 해결했고 운영 검증을 마쳤음. 그 핵심 사양만 가져와 본 워크스테이션의 채팅 경로에 붙임.

ASTON AI에서 발견된 함정: `pdf-parse` v2는 내부적으로 PDF.js를 쓰면서 `DOMMatrix` 글로벌을 요구해 Node 환경에서 실패. 따라서 **반드시 `pdf2json`(pure Node) 사용**.

---

## 2. 범위

### 본 작업 포함

- 사용자 메시지에 `[첨부: <절대경로>]` 패턴이 있으면 본문 추출 후 systemPrompt에 주입
- 두 채팅 진입점 모두 적용:
  1. 웹 tRPC 채팅 — `server/routers/llm.ts` `llmRouter.chat` mutation
  2. 텔레그램 봇 — `server/llm/telegram-bot.ts` 일반 메시지 핸들러
- 지원 확장자: `.pdf` / `.md` / `.txt` / `.csv`

### 본 작업 제외 (필요 시 별도 작업)

- Google Drive API 폴링 / 자동 ingest (본 프로젝트에 watcher 인프라 자체가 없음)
- Chrome Extension Ingest
- OCR (스캔 PDF는 안내 메시지로 fallback만)
- `.docx` / `.xlsx` 등 추가 포맷 (현재 의존성 없음, 필요 시 별도 작업)

---

## 3. 아키텍처 / 모듈 경계

### 신규 파일

| 파일 | 역할 | 예상 줄수 |
|---|---|---|
| `server/llm/attachmentExtract.ts` | 순수 추출 함수. `extractAttachmentText(absPath): Promise<AttachmentExtractResult>`. pdf2json/fs 호출, LRU 캐시, 한도·정규화 포함. | ~150 |
| `server/llm/attachmentInject.ts` | 메시지 텍스트에서 정규식 파싱 → `extractAttachmentText` 호출 → `[첨부 문서]` 섹션을 systemPrompt 끝에 prepend하는 헬퍼. 두 진입점 공용. | ~80 |
| `server/llm/attachmentExtract.test.ts` | vitest 단위 테스트 5~7개. | ~150 |

### 수정 파일

| 파일 | 변경 내용 |
|---|---|
| `server/routers/llm.ts` | `chat` mutation에서 systemPrompt 조립 직후 `injectAttachments()` 호출. 결과 enhancedPrompt를 `userLlmCaller.call`의 4번째 인자로 전달. warnings를 응답 객체에 포함. |
| `server/llm/telegram-bot.ts` | 일반 메시지 핸들러(textHandler 또는 `bot.on('text', ...)`)에서 동일하게 `injectAttachments()` 호출. |
| `package.json` | `pdf2json` 의존성 추가. 타입 정의가 자체 포함되지 않으면 `@types/pdf2json` devDependency 추가, 없으면 모듈 선언 파일 또는 `// @ts-expect-error` 주석. |

### 모듈 경계 설계

- 추출 모듈은 **순수 함수**: 입력은 절대경로, 출력은 결과 객체. tRPC/Telegraf 의존 없음 → 단위 테스트 용이.
- 인젝션 모듈은 추출 결과를 **systemPrompt 문자열 변환**까지만 책임. 호출 측은 결과 문자열만 받아 자기 캐스케이드(call 인자 전달, 응답에 warnings 포함)에 끼워 넣음.
- pdf2json은 `attachmentExtract.ts` 내부에서 **lazy import** (`const PDFParser = (await import('pdf2json')).default`). 콜드 스타트 시 ~수십 MB의 라이브러리를 메모리에 올리지 않음.
- `server/llm/` 디렉토리 안에 모두 두므로 본 프로젝트의 기존 디렉토리 구조와 정합. 별도 경계 검사 도구 불필요.

---

## 4. 데이터 / 인터페이스

### 4.1 `AttachmentExtractResult`

```ts
export interface AttachmentExtractResult {
  ok: boolean;            // 추출 성공 여부 (스캔 PDF 안내도 ok=false)
  text?: string;          // 정규화·캡 적용된 본문
  filename?: string;      // 표시용 basename
  bytes?: number;         // 원본 파일 크기
  truncated?: boolean;    // 60K 캡으로 잘렸는지
  pageCount?: number;     // PDF 한정
  error?: string;         // 실패 사유 (스캔 PDF / 50MB 초과 / 미지원 확장자 / 파일 없음 / IO 에러)
}
```

### 4.2 `injectAttachments`

```ts
export interface InjectResult {
  systemPrompt: string;           // 첨부 섹션이 prepend된 결과 (없으면 입력 그대로)
  attachments: Array<{
    path: string;
    filename: string;
    ok: boolean;
    error?: string;
    bytes?: number;
    truncated?: boolean;
  }>;                             // 응답에 함께 반환할 메타
  warnings: string[];             // "스캔 PDF로 추정됩니다 — OCR 후 재첨부하세요" 등
}

export async function injectAttachments(
  baseSystemPrompt: string,
  userMessage: string,
): Promise<InjectResult>;
```

### 4.3 정규식

```
/\[(?:첨부|Attached|ATTACHMENT)[:：]\s*["'`]?([\s\S]+?\.(?:pdf|md|txt|csv))["'`]?\s*\]/gi
```

- 다중 매치 지원 (한 메시지에 여러 첨부)
- 한국어 콜론(`：`)·영문 콜론(`:`) 모두 허용
- 따옴표(`"`, `'`, `` ` `` ) optional
- 확장자 대소문자 무시(`gi` 플래그)

### 4.4 systemPrompt 주입 형식

```
<기존 systemPrompt>

[첨부 문서]
### [첨부 — PF IM_v1.1.pdf]
<본문 텍스트, 정규화·캡 적용>

---
### [첨부 — 회의록.md]
<본문>
```

- 다중 첨부일 때 `\n\n---\n` 구분
- 추출 실패 항목은 본문 대신 `(추출 실패: <error>)` 한 줄
- 인용 footer(응답 끝의 "📚 참고 자료") 같은 별도 메커니즘 없음 — 본 프로젝트는 RAG/citation 인프라가 없으므로 응답에 `attachments` 메타만 함께 반환해 클라이언트가 알아서 표시

---

## 5. 핵심 사양 (ASTON AI 검증분 그대로 이식)

| 항목 | 값 |
|---|---|
| PDF 파서 | `pdf2json` (pure Node, DOM 의존 없음). `pdf-parse` v2 금지. |
| pdf2json 모드 | `new PDFParser(null, 1)` — 1은 pure text 모드, 시각 데이터 suppress |
| 파일 크기 한도 | 50MB hard cap (초과 시 `error: "파일 크기가 50MB를 초과합니다"` 반환) |
| 텍스트 캡 | 60,000자, 초과 시 끝에 `\n\n...(이하 생략 — 첨부 분량 초과)` 추가, `truncated: true` |
| 지원 확장자 | `.pdf` / `.md` / `.txt` / `.csv` (소문자 비교, 그 외 거부) |
| 스캔 PDF 식별 | 추출 텍스트 길이 0 + ext === '.pdf' → `ok: false`, `error: "스캔 이미지 또는 암호 잠금 가능성. OCR 도구로 변환 후 재첨부하세요."` |
| 정규화 | form-feed `\f` → `\n\n`, 3개 이상 연속 줄바꿈 → `\n\n`, 양끝 trim |
| 캐시 | `path → AttachmentExtractResult` LRU **16 entries**. 키는 `path + ':' + mtimeMs`로 잡아 파일 수정 시 자동 무효화. |
| Lazy import | pdf2json은 `.pdf` 분기 내에서만 `await import('pdf2json')` |
| 경로 가드 | `path.resolve` → 존재 여부 → `fs.statSync().isFile()` 확인. 디렉토리/심볼릭 링크는 거부. |
| 보안 가정 | 본 프로젝트는 회장님 단일사용자 전제 (메모리 + `telegram-bot.ts` `ADMIN_USER_ID = 1`로 확인). 임의 사용자에게 서버 로컬 파일을 읽게 하지 않음. 멀티사용자로 확장 시 `protectedProcedure` + 디렉토리 화이트리스트 필요. 코드에 주석으로 명시. |

---

## 6. 통합 방식

### 6.1 웹 채팅 (`server/routers/llm.ts`)

현재 `chat` mutation의 systemPrompt 조립부([server/routers/llm.ts:169-182](server/routers/llm.ts:169)) 직후, `userLlmCaller.call` 호출(174-182줄) 직전에 헬퍼 호출을 끼워 넣음. 기존 `systemPrompt` 변수명은 그대로 유지하고 결과를 다른 이름으로 받음:

```ts
// 기존 systemPrompt 조립 직후 (현재 169-172줄)
const { injectAttachments } = await import("../llm/attachmentInject");
const injected = await injectAttachments(systemPrompt, input.message);

const response = await userLlmCaller.call(
  session.engine,
  session.modelKey,
  history.map((msg: any) => ({ role: msg.role, content: msg.content })),
  injected.systemPrompt,   // 첨부 섹션 prepend 결과
);

// 기존 187-191줄 return에 필드 추가
return {
  response: response.content,
  model: response.model,
  engine: response.engine,
  attachments: injected.attachments,
  warnings: injected.warnings,
};
```

`return` 객체 확장은 후방 호환(필드 추가뿐). tRPC + superjson 직렬화로 추가 필드 자동 통과. 클라이언트가 무시하면 그대로 무시됨.

### 6.2 텔레그램 봇 (`server/llm/telegram-bot.ts`)

`setupMessageHandler()` 내 `this.bot.on("message", ...)` 핸들러([server/llm/telegram-bot.ts:210-291](server/llm/telegram-bot.ts:210))의 systemPrompt 조립부(251-256줄)와 `this.llmCaller.call` 호출(258-266줄) 사이에 동일 헬퍼 호출:

```ts
// 기존 systemPrompt 조립 직후 (현재 256줄 바로 다음)
const { injectAttachments } = await import("./attachmentInject");
const injected = await injectAttachments(systemPrompt, userMessage);

const response = await this.llmCaller.call(
  session.engine,
  session.modelKey,
  history.map((msg) => ({ role: msg.role, content: msg.content })),
  injected.systemPrompt,
);

// 기존 ctx.reply(response.content, ...) 직후
if (injected.warnings.length > 0) {
  await ctx.reply("⚠️ " + injected.warnings.join("\n"));
}
```

웹과 텔레그램이 같은 `injectAttachments`를 호출하므로 캐시도 공유(모듈 스코프 LRU). 같은 PDF를 양쪽에서 같은 시점에 참조하면 두 번째는 캐시 히트.

---

## 7. 에러 처리 / Fallback

| 케이스 | 동작 |
|---|---|
| 패턴 없음 | `injectAttachments` 입력 그대로 반환, 노옵 |
| 경로가 존재하지 않음 | `attachments[i].error = "파일을 찾을 수 없습니다: <path>"`, 본문엔 `(추출 실패: ...)` 한 줄 삽입, LLM에 다른 첨부는 정상 주입 |
| 50MB 초과 | 동상, error 메시지로 한도 안내 |
| 미지원 확장자 | 정규식 자체가 4종만 매치하므로 도달 불가. 안전망으로 거부 |
| 스캔 PDF (텍스트 0) | `ok: false`, error에 OCR 안내. `warnings`에 동일 메시지 추가하여 응답에서도 노출 |
| pdf2json 파싱 에러 | `error: "PDF 파싱 실패: <원본 메시지>"`, 다른 첨부는 영향 없음 |
| IO 에러 (권한 등) | error에 원본 메시지, 다른 첨부 영향 없음 |
| 모든 첨부 실패 | systemPrompt에 `[첨부 문서]` 섹션 자체 생성하지 않음 (LLM이 빈 섹션을 보고 혼란하지 않도록), warnings에 사유 누적 |

원칙: **부분 실패는 무시하고 가능한 것부터 주입**. 한 PDF가 깨졌다고 다른 MD까지 막지 않음.

---

## 8. 테스트 (`server/llm/attachmentExtract.test.ts`)

vitest 단위 테스트 5~7개:

1. **`.md` / `.txt` 정상 추출** — 임시 파일 생성 → text 일치, `ok: true`, `bytes` 일치
2. **`.csv` 정상 추출** — CSV 원문 그대로 (파싱하지 않음)
3. **`.pdf` 추출** — `tests/fixtures/sample.pdf` 작은 PDF 1개 커밋, 텍스트 포함 검증, `pageCount >= 1`
4. **50MB 초과 거부** — `fs.truncateSync`로 51MB 가짜 파일, `ok: false`, error 메시지 검증
5. **60K 캡 truncate** — 70K 텍스트 파일, `text.length === 60000 + suffix.length`, `truncated: true`
6. **스캔 PDF 식별** — 텍스트 없는 PDF fixture (또는 `pdf2json` 모킹), error에 "OCR" 포함
7. **미지원 확장자 거부** — `.exe` 경로, `ok: false`, error에 "지원하지 않는 확장자"
8. **캐시 히트** — 같은 경로 두 번 호출, 두 번째는 fs.readFile 호출 0회 (mock으로 검증) — 선택

추가로 인젝션 통합 테스트 1~2개 (`server/llm/attachmentInject.test.ts`):

- 정규식 매치 → `[첨부 문서]` 섹션이 systemPrompt에 포함
- 패턴 없음 → 입력 systemPrompt 그대로 반환 (회귀 가드)

---

## 9. 검증 명령

```powershell
pnpm add pdf2json
pnpm run check    # tsc --noEmit
pnpm run test     # vitest 전체 (기존 + 신규 7~9개)
pnpm run build    # vite + esbuild
```

전부 통과 후 PR/머지 검토.

---

## 10. 운영 검증 (회장님 직접, 코드 머지 후)

- 웹 채팅: `다음 PDF 요약해줘 [첨부: G:\내 드라이브\Aston-Wiki\projects\hannam-644\PF IM_v1.1.pdf]` → 응답에 PDF 본문 수치 인용 확인
- 텔레그램: 동일 메시지를 봇에게 전송 → 동일 결과 확인
- 스캔 PDF 1건 시도 → "OCR 후 재첨부" 안내가 응답 또는 warnings로 노출되는지
- 50MB 초과 PDF 시도 → 한도 안내 노출

---

## 11. 작업 단위 / 커밋 계획

| 단계 | 산출물 | 시간 |
|---|---|---|
| 1 | `pnpm add pdf2json` + lockfile | 5분 |
| 2 | `attachmentExtract.ts` 신규 + 단위 테스트 6~7개 | 40분 |
| 3 | `attachmentInject.ts` 신규 + 단위 테스트 1~2개 | 25분 |
| 4 | `llm.ts` chat mutation 통합 | 15분 |
| 5 | `telegram-bot.ts` 메시지 핸들러 통합 | 20분 |
| 6 | `pnpm run check / test / build` 회귀 확인 | 15분 |

**합계 약 2시간.**

커밋 3개:
1. `feat(llm): pdf2json 의존성 추가 및 attachmentExtract 모듈 신설` (Step 1~2)
2. `feat(llm): 웹·텔레그램 채팅에 인라인 첨부 인젝션 적용` (Step 3~5)
3. `test: 첨부 추출/인젝션 회귀 가드 추가` (Step 6 + 부족분)

(2번 커밋이 두 진입점 동시 수정이지만 동일 헬퍼 도입이라 분리하면 중간 상태가 어색해짐 → 단일 커밋이 합리적.)

---

## 12. 위험 / 제약

- **단일사용자 전제 의존**: 서버가 임의 절대경로를 읽음. 멀티사용자로 가면 설계 변경 필요. 코드 주석으로 명시.
- **G:\ 드라이브 경로 의존**: 서버 프로세스에서 G:\ 드라이브가 마운트되어 있어야 함 (회장님 PC에서는 OK). pm2/Windows 서비스로 띄울 때 동일 경로 접근권한 확인 필요.
- **pdf2json 첫 호출 비용**: lazy import이므로 첫 PDF 첨부 시 수백 ms 추가 지연. 이후는 캐시.
- **60K 캡**: 매우 긴 PDF는 잘림. 회장님 PF IM/계약서 길이 분포에 따라 캡 상향(예: 90K) 검토할 수 있음 — 일단 ASTON AI 검증값 유지.

---

## 13. 산출물 체크리스트

- [ ] `package.json` + lockfile 갱신 (pdf2json)
- [ ] `server/llm/attachmentExtract.ts` (신규)
- [ ] `server/llm/attachmentInject.ts` (신규)
- [ ] `server/llm/attachmentExtract.test.ts` (신규)
- [ ] `server/llm/attachmentInject.test.ts` (신규, 선택)
- [ ] `server/routers/llm.ts` (수정)
- [ ] `server/llm/telegram-bot.ts` (수정)
- [ ] `tests/fixtures/sample.pdf` (소형 fixture, 선택 — 또는 pdf2json 모킹)
- [ ] `pnpm run check / test / build` 통과
