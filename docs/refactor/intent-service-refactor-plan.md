# Intent Service 리팩토링 설계서
> 작성일: 2026-05-08 | 브랜치: codex-google-workspace-expansion  
> 참조: Connect AI v2 벤치마킹 분석 (2026-05-08)  
> 상태: **설계 완료 — 구현 미착수**

---

## 1. 현재 문제점

### 1-1. 분류 프롬프트가 TypeScript에 하드코딩되어 있다
`intentService.ts:76–114`에 LLM 시스템 프롬프트가 백틱 문자열로 박혀있다.  
- 프롬프트 수정마다 TypeScript 재컴파일 필요
- diff에서 로직 변경과 프롬프트 튜닝이 섞여 보임
- 새 액션을 추가할 때마다 이 문자열 안의 목록도 같이 수정해야 함

### 1-2. 분류(classify)와 실행(dispatch)이 같은 파일에 있다
`classifyIntent()` → `routeIntentMessage()`가 한 파일(intentService.ts)에 있어서:
- 단일 책임 원칙 위반
- 중간 단계(계획, 파라미터 보강)를 끼워넣을 자리가 없음
- 테스트 시 분류만 단독으로 검증하기 어렵고, 항상 전체 파이프라인을 돌려야 함

### 1-3. 핸들러 응답에 표준 JSON 계약이 없다
`formatIntentRouteMessage()` (line 195~227)가 `data?.fileList`, `data?.emailList`, `data?.eventList`, `data?.briefing`, `data?.report`, `data?.summary` 등을 **순차 if-else로 뒤진다**.  
- 핸들러마다 다른 필드명을 사용 → 텔레그램 응답에서 빈 문자열이나 `data` 객체가 그대로 노출되는 원인
- 새 핸들러를 추가할 때 `formatIntentRouteMessage`도 같이 수정해야 함 (산탄총 수술)

### 1-4. `types.ts`가 라우터를 직접 import한다
`types.ts:1` — `import { googleAuthManager } from "../routers/google-workspace.ts"`  
- 타입 파일이 라우터 인스턴스를 들고 있음 → 도메인 경계 위반
- `types.ts`를 import하는 모든 곳이 암묵적으로 Google 라우터에 의존함

### 1-5. `fallbackIntent.ts`가 도메인 모듈을 import한다
```
import { parsePreCheckMessage } from "../trading/preCheckEngine.ts"
import { parseReviewMessage } from "../trading/reviewReport.ts"
import { isBriefingTestMessage } from "../intelligence/briefing.ts"
```
- intent 레이어가 trading/intelligence 도메인을 직접 참조 → 단방향 의존 원칙 위반
- 이 import가 CLAUDE.md §6-1의 "도메인 간 직접 import 금지" 규칙과 충돌하지 않는지 명시적 검토 필요

### 1-6. "계획" 단계가 없다
복합 요청("BTC 분석하고 리스크 점검해줘")이 들어올 때 단일 액션으로 분류하거나 chat fallback으로 빠진다. Connect AI의 `ceo-planner` 패턴처럼 **멀티스텝 태스크를 분해하는 레이어**가 없다.

---

## 2. 목표 아키텍처

### 2-1. 4단계 파이프라인

```
사용자 메시지
     │
     ▼
┌─────────────────────────────────┐
│  1. parseIntent(message)        │  ← 분류만. LLM or 키워드 매칭.
│     returns: IntentResult       │     프롬프트는 .md 파일에서 읽음
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  2. planIntent(intent, msg)     │  ← 단일/복합 판단 + 파라미터 보강
│     returns: IntentPlan         │     단순 요청 → plan.steps = [intent]
└────────────────┬────────────────┘    복합 요청 → plan.steps = [A, B, ...]
                 │
                 ▼
┌─────────────────────────────────┐
│  3. dispatchIntent(plan)        │  ← 핸들러 실행. registry 경유.
│     returns: DispatchResult[]   │     승인 게이트 포함
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  4. formatReply(results)        │  ← 표준 JSON 스키마 기반 포맷
│     returns: string             │     텔레그램/웹 채팅 공통
└─────────────────────────────────┘
```

### 2-2. 진입점 변경 없음 (하위 호환)

기존 호출자들(`telegram-bot.ts`, `intent.ts` tRPC 라우터)은 `routeIntentMessage(options)`를 그대로 호출한다.  
내부적으로 4단계 파이프라인이 돌고, 기존 시그니처가 유지된다.

```typescript
// 기존 — 변경 없음
export async function routeIntentMessage(options: RouteIntentOptions): Promise<IntentRouteResponse>

// 내부 구현만 4단계로 교체됨
```

---

## 3. 파일 분리안

### 3-1. 신규 생성 파일

```
server/intent/
├── pipeline/
│   ├── parseIntent.ts      ← classifyIntent() 이동 + 프롬프트 파일 로딩
│   ├── planIntent.ts       ← 신규. 단순/복합 판단. 초기엔 단순 pass-through
│   ├── dispatchIntent.ts   ← routeIntentMessage() 핵심 로직 이동
│   └── formatReply.ts      ← formatIntentRouteMessage() 교체. 스키마 기반
├── prompts/
│   ├── classifier.md       ← 현재 intentService.ts:76-114의 프롬프트 이동
│   └── planner.md          ← planIntent용 (복합 요청 분해. 초기엔 stub)
└── schema.ts               ← 신규. HandlerResponse JSON 표준 스키마
```

### 3-2. 기존 파일 변경 범위

| 파일 | 변경 | 이유 |
|------|------|------|
| `intentService.ts` | 내부만 교체, public API 유지 | 하위 호환 |
| `types.ts` | `googleAuthManager` import 제거, `getGoogleAuth` 이동 | 경계 분리 |
| `handlers/*.ts` | 점진적으로 `HandlerResponse` 스키마 적용 | 산탄총 수술 방지 |
| `fallbackIntent.ts` | 도메인 import 제거 방법 검토 (아래 §5 참조) | 경계 위반 해소 |

### 3-3. 삭제하지 않는 파일

- `registry.ts` — 그대로 유지
- `handlers/` 전체 — 그대로 유지 (스키마 적용은 핸들러별 점진 작업)
- `fallbackIntent.ts` — 구조 변경 없이 유지 (§5-3에서 별도 검토)
- `wiki.ts` — 그대로 유지

---

## 4. JSON 스키마 초안

### 4-1. `HandlerResponse` — 핸들러가 반환하는 표준 구조

```typescript
// server/intent/schema.ts

export type HandlerResponseKind =
  | "text"          // 단순 텍스트 응답
  | "list"          // 항목 목록 (일정/메일/파일/딜 등)
  | "report"        // 긴 분석 리포트 (preCheck, 브리핑, 재무)
  | "confirmation"  // 실행 승인 요청
  | "error";        // 처리 실패

export interface HandlerResponse {
  /** 응답 종류 — formatReply가 이 필드만 보고 포맷을 결정한다 */
  kind: HandlerResponseKind;
  /** 사용자에게 보여줄 본문. 이미 한국어 포맷 완료 상태여야 한다 */
  text: string;
  /** list 종류일 때 항목 배열 (텍스트 줄). text와 별도로 구조화 목적 */
  items?: string[];
  /** 메타데이터 — 로깅/디버깅용. 텔레그램 응답에 노출 금지 */
  meta?: Record<string, unknown>;
}
```

### 4-2. `IntentPlan` — planIntent 반환 타입

```typescript
export interface IntentPlan {
  /** 단일 요청이면 steps.length === 1 */
  steps: IntentResult[];
  /** 복합 요청일 때 사용자에게 보여줄 시작 메시지 */
  summary?: string;
}
```

### 4-3. `DispatchResult` — dispatchIntent 반환 타입

```typescript
export interface DispatchResult {
  intent: IntentResult;
  response: HandlerResponse;
  handled: boolean;
  requiresConfirmation: boolean;
}
```

### 4-4. 기존 `IntentRouteResponse`와의 관계

`routeIntentMessage()`는 여전히 `IntentRouteResponse`를 반환한다. 내부적으로 `DispatchResult`를 `IntentRouteResponse`로 변환하는 어댑터 함수를 둔다.

```typescript
// intentService.ts 내부에만 존재
function toLegacyResponse(result: DispatchResult): IntentRouteResponse { ... }
```

외부 API를 바꾸지 않고 내부 구조만 교체하는 전략이다.

---

## 5. 프롬프트 파일 위치 및 내용

### 5-1. `server/intent/prompts/classifier.md`

현재 `intentService.ts:76–114`의 백틱 프롬프트를 그대로 이동.  
파일 로딩은 `parseIntent.ts`에서 `fs.readFileSync`로 시작 시 1회 읽음 (모듈 init 시점).

```markdown
<!-- server/intent/prompts/classifier.md -->
사용자 메시지를 분석해서 JSON으로 응답하세요.

현재 날짜: {{NOW}}
도메인: trading, realestate, finance, google, deals, chat
...
(기존 프롬프트 그대로)
```

`{{NOW}}` 같은 플레이스홀더는 `parseIntent.ts`에서 실행 시점에 치환.

### 5-2. `server/intent/prompts/planner.md`

초기엔 stub — 단일 요청만 통과시킨다. 복합 분해 기능은 trading 안정화 이후 채운다.

```markdown
<!-- server/intent/prompts/planner.md — v0 stub -->
주어진 인텐트가 단일 실행 가능한 액션이면 그대로 반환한다.
복합 요청 분해는 추후 활성화 예정.
```

### 5-3. `fallbackIntent.ts` 도메인 import 처리 방안

현재 위반:
```typescript
import { parsePreCheckMessage } from "../trading/preCheckEngine.ts"
import { parseReviewMessage } from "../trading/reviewReport.ts"
import { isBriefingTestMessage } from "../intelligence/briefing.ts"
```

**권장 방안 (이번 리팩토링 범위 밖, 별도 작업)**:
- `preCheckEngine.ts`, `reviewReport.ts`, `briefing.ts`에서 각각 정규식/판별 함수를 `server/intent/fallbackIntent.ts`가 직접 구현하거나
- `server/_core/intentHelpers.ts`로 판별 로직만 올려 공유
- 이번 설계서의 4단계 파이프라인 구현 완료 후 별도 CURRENT_TASK로 처리

---

## 6. 기존 기능 깨지지 않는 단계별 적용 순서

> 각 단계는 독립 커밋. 이전 단계가 `npm run check && npm run build`를 통과해야 다음 단계 진행.

### Phase 0 — 준비 (코드 수정 없음)
- [ ] 이 설계서를 `docs/refactor/intent-service-refactor-plan.md`로 커밋
- [ ] `server/intent/prompts/` 폴더 생성 (빈 폴더 `.gitkeep`)
- [ ] `server/intent/pipeline/` 폴더 생성 (빈 폴더 `.gitkeep`)

### Phase 1 — 프롬프트 외부화
**영향 범위**: `intentService.ts`만. 동작 변경 없음.
1. `server/intent/prompts/classifier.md` 생성 (기존 프롬프트 문자열 그대로)
2. `intentService.ts`에서 백틱 프롬프트 → `fs.readFileSync('prompts/classifier.md')` 교체
3. `{{NOW}}` 플레이스홀더 치환 로직 추가
4. **검증**: `npm run check && npm run build && npm test`

### Phase 2 — `schema.ts` 도입 + `formatReply` 교체
**영향 범위**: `intentService.ts`, `schema.ts` 신규. 핸들러 변경 없음.
1. `server/intent/schema.ts` 생성 (§4-1 타입만)
2. `formatIntentRouteMessage()` 내부를 `HandlerResponse.kind` 기반으로 교체
3. 기존 핸들러가 `HandlerResponse` 타입을 아직 반환하지 않으므로, **어댑터 레이어**로 기존 `data` 필드를 `HandlerResponse`로 변환하는 `inferKind(data)` 함수를 임시 운용
4. **검증**: 기존 텔레그램 응답 포맷 회귀 없는지 확인

### Phase 3 — `parseIntent` 분리
**영향 범위**: `pipeline/parseIntent.ts` 신규, `intentService.ts` 내부 교체.
1. `pipeline/parseIntent.ts`로 `classifyIntent()` 이동
2. `intentService.ts`는 `parseIntent.ts`를 import해서 위임
3. `normalizeIntent()`도 `pipeline/parseIntent.ts`로 이동
4. **검증**: `npm run check && npm run build && npm test`

### Phase 4 — `planIntent` stub 도입
**영향 범위**: `pipeline/planIntent.ts` 신규, `intentService.ts` 내부 교체.
1. `pipeline/planIntent.ts` 생성. `parseIntent` 결과를 그대로 `IntentPlan`으로 감싸서 반환 (stub)
2. `routeIntentMessage` 내부에서 `planIntent` 호출 삽입
3. `server/intent/prompts/planner.md` 생성 (stub 내용)
4. **검증**: 동작 변경 없음 확인

### Phase 5 — `dispatchIntent` 분리
**영향 범위**: `pipeline/dispatchIntent.ts` 신규, `intentService.ts` 내부 교체.
1. `pipeline/dispatchIntent.ts`로 핸들러 registry 조회 + 승인 게이트 로직 이동
2. `intentService.ts`는 얇은 오케스트레이터로 변환
3. **검증**: `npm run check && npm run build && npm test`

### Phase 6 — 핸들러 스키마 점진 적용 (별도 작업들)
각 핸들러 파일에서 `response` 문자열 대신 `HandlerResponse` 구조체 반환으로 전환.
우선순위: `google.ts` → `trading.ts` → 나머지.  
각 핸들러는 CURRENT_TASK 1건씩 분리.

---

## 7. 테스트 전략

### 7-1. 기존 테스트 회귀 방지

모든 Phase 완료 후 `npm test`의 기존 intent 테스트가 그대로 통과해야 한다.  
특히 아래 테스트 파일들이 핵심 회귀 기준:
- `server/__tests__/fallbackIntent.test.ts` (있다면)
- `server/__tests__/intentService.test.ts` (있다면)

### 7-2. Phase별 테스트 추가 원칙

| Phase | 추가 테스트 |
|-------|-------------|
| Phase 1 | `classifier.md` 로딩 실패 시 fallback 동작 확인 |
| Phase 2 | `inferKind(data)` 단위 테스트: fileList/emailList/eventList/report/summary 각 케이스 |
| Phase 3 | `parseIntent()` 직접 호출 단위 테스트 (LLM mock) |
| Phase 4 | `planIntent()` stub 테스트: 입력 = IntentResult, 출력 = IntentPlan(steps.length===1) |
| Phase 5 | `dispatchIntent()` 단위 테스트: 승인 게이트 on/off 케이스 |

### 7-3. 통합 시나리오 테스트 (수동 QA)

각 Phase 완료 후 텔레그램에서 아래 5가지 확인:
1. `BTC 잔고 조회` → trading_balance 정상 응답
2. `딜 목록` → deals_command 정상 응답
3. `오늘 일정 알려줘` → google_today_events 정상 응답
4. `롱 BTC 5배` → 승인 게이트 정상 작동 (requiresConfirmation=true)
5. `아무 일반 대화` → Gemini fallback 정상

---

## 8. 롤백 전략

### 8-1. 각 Phase는 독립 커밋이므로 git revert 1건으로 롤백 가능

```bash
# Phase 3 도입 후 문제 발생 시
git revert <Phase3_커밋_해시>
# Phase 2 상태로 돌아감, 이후 Phase 2 기능은 유지
```

### 8-2. `intentService.ts` public API는 전 Phase에서 동결

`routeIntentMessage(options: RouteIntentOptions): Promise<IntentRouteResponse>` 시그니처를 전 Phase 동안 절대 변경하지 않는다. 변경 시 `telegram-bot.ts`, tRPC `intent.ts` 라우터 등 호출자 전체가 영향받는다.

### 8-3. 프롬프트 롤백

Phase 1 이후 `classifier.md`를 수정해서 분류 품질이 나빠진다면:
```bash
git checkout HEAD~1 -- server/intent/prompts/classifier.md
pm2 restart aston
```
TypeScript 재컴파일 없이 즉시 이전 프롬프트로 복귀 가능.

### 8-4. 긴급 롤백 스위치 (Phase 5 이후 보험)

`pipeline/dispatchIntent.ts`에 환경 변수 가드:
```typescript
// INTENT_LEGACY_MODE=true 이면 기존 registry 직접 호출 경로 사용
const legacyMode = process.env.INTENT_LEGACY_MODE === "true";
```
운영에서 문제 발생 시 `.env`에 `INTENT_LEGACY_MODE=true` 추가 후 `pm2 restart aston`으로 이전 동작 복귀.

---

## 9. 보류 항목 (이번 설계서 범위 밖)

| 항목 | 이유 | 후속 처리 |
|------|------|-----------|
| `decisions-extract` | Connect AI 벤치마킹 후순위 | Phase 6 이후 별도 CURRENT_TASK |
| `confer` 패턴 | trading 안정화 이후 검토 | trading 운영 QA 완료 후 별도 설계 |
| `fallbackIntent` 도메인 import 제거 | 이번 파이프라인 구현과 독립 | Phase 5 완료 후 별도 CURRENT_TASK |
| `types.ts` → `googleAuthManager` 분리 | 경계 위반이지만 현재 동작 안정 | Phase 3 또는 별도 작업 |

---

## 10. 참조

- `server/intent/intentService.ts` — 현재 구현 (227줄)
- `server/intent/types.ts` — 타입 정의 및 헬퍼
- `server/intent/registry.ts` — 핸들러 맵
- `server/intent/fallbackIntent.ts` — 키워드 기반 분류
- `server/intent/handlers/` — 15개 도메인 핸들러
- `docs/refactor/` — 이 설계서 위치
- Connect AI `assets/prompts/ceo-classifier.md` — 벤치마킹 참조
- Connect AI `assets/prompts/ceo-planner.md` — 벤치마킹 참조
- Connect AI `assets/prompts/secretary-telegram.md` — JSON-mode 응답 벤치마킹 참조

---

## Phase 0~2 Implementation Log

### 변경일
2026-05-08

### 변경 파일 목록
**신규 생성**
- `server/intent/prompts/classifier.md` — 분류 프롬프트 외부화 (40줄)
- `server/intent/promptLoader.ts` — md 파일 로더 + FALLBACK 상수 + `renderPrompt({{KEY}})` (132줄)
- `server/intent/intentSchemas.ts` — `ParsedIntent`/`PlannedIntent`/`DispatchResult`/`FormattedIntentReply` 타입 + zod 스키마 (95줄)
- `server/intent/parseIntent.ts` — 의도 분류 로직 분리, `parseIntent()` + `normalizeIntent()` (113줄)

**수정**
- `server/intent/intentService.ts` — 분류 로직 제거, `parseIntent` 위임. 227줄 → 137줄. public API 시그니처 동결.

### 구현 내용

#### Phase 0 — 준비 파일 생성
- `prompts/` 폴더 생성, 분류 프롬프트를 `classifier.md`로 분리 (`{{NOW}}` 플레이스홀더로 날짜 치환)
- `promptLoader.ts`:
  - `loadIntentPrompt(name)` — 캐시 → 파일 → FALLBACK 순으로 조회, 모두 실패 시 throw
  - `loadIntentPromptSafe(name)` — 실패 시 null 반환
  - `renderPrompt(template, vars)` — `{{KEY}}` 치환
  - `FALLBACK_CLASSIFIER_PROMPT` 상수 — esbuild bundle(prod) 환경에서 .md 파일이 없을 때 사용
  - `_resetPromptCache()` — 테스트 헬퍼
- `intentSchemas.ts`:
  - `ParsedIntent = IntentResult` 타입 별칭 (Phase 2 전방 호환)
  - `PlannedIntent`, `DispatchResult`, `FormattedIntentReply` (후속 Phase placeholder)
  - zod 스키마 (`ParsedIntentSchema`, `PartialParsedIntentSchema`) — 향후 LLM 응답 검증용

#### Phase 1 — 프롬프트 외부화 적용
- `intentService.ts`의 76~114줄 백틱 프롬프트를 제거
- `parseIntent.ts`에서 `loadIntentPromptSafe("classifier.md") ?? FALLBACK_CLASSIFIER_PROMPT` 패턴으로 안전하게 로딩
- 로딩 실패 시 콘솔 경고 후 인메모리 fallback 사용 (운영 중단 없음)

#### Phase 2 — `parseIntent()` 분리
- 분류 로직(키워드 → LLM 폴백)을 `parseIntent.ts`로 이동
- `normalizeIntent()`도 함께 이동 (분류 단계의 일부)
- `intentService.ts`는 `parseIntent`/`normalizeIntent`를 import해서 위임만 수행
- **`classifyIntent`는 backward-compatible alias**로 유지 (5개 파일에서 import 중)
  - `__tests__/dealNameParsing.test.ts`, `__tests__/briefing.test.ts`, `__tests__/dealRouting.test.ts`
  - `routers/intent.ts`, `routers/chat-dedup.test.ts`

### 기존 동작 영향 여부
**없음.** public API(`routeIntentMessage`, `formatIntentRouteMessage`, `classifyIntent`, `normalizeIntent`)의 시그니처와 의미가 모두 동일.
- 키워드 기반 fast path → LLM 폴백 → 폴백 fallback 순서 그대로
- 프롬프트 본문 100% 동일 (md 파일 vs `FALLBACK_CLASSIFIER_PROMPT` 상수에 동일 텍스트 보관)
- `import { ... } from "./intentService.ts"` 형태의 모든 외부 import 경로 보존
- 로그 라인 1개 변경: `[INTENT] classifyIntent called` → `[INTENT] parseIntent called` (사용자 노출 없음, 테스트 영향 없음)

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 통과 — 모듈 경계 위반 0건, `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ 통과 — **564 passed** / 7 skipped / 2 todo (이전 동일 수치) |
| `npm run build` | ✅ 통과 — vite build 5.38s + esbuild dist/index.js 720.9kb 생성 |

### 남은 리스크
1. **prod 환경에서 .md 파일 미동봉**
   - 현재 esbuild bundle(`dist/index.js`)에 `prompts/` 폴더가 복사되지 않음
   - prod에서는 `FALLBACK_CLASSIFIER_PROMPT` 인메모리 상수가 사용됨 (의도된 동작)
   - **md와 인메모리 상수의 동기화 필요** — 둘 다 수정해야 함
   - Phase 3 또는 별도 작업에서 `npm run build` 시 prompts/ 복사하는 esbuild plugin 추가 검토
2. **로그 라인 변경**
   - `classifyIntent called` → `parseIntent called`
   - 외부 모니터링이 이 로그 문자열을 grep하지 않는다는 가정 (회장님 환경 기준 grep 의존 없음 확인 완료)
3. **`fallbackIntent.ts`의 도메인 import는 그대로**
   - 별도 작업으로 후속 처리 예정 (설계서 §5-3, §9 참조)

### 다음 Phase 3에서 할 일
- `pipeline/` 폴더 생성 후 `parseIntent.ts`를 그 안으로 이동 (위치 정리)
- `planIntent.ts` stub 생성 — `ParsedIntent`를 그대로 `PlannedIntent.steps[0]`으로 감싸 반환 (단계 분해는 stub)
- `routeIntentMessage` 내부에 `planIntent` 호출 삽입 (현재 동작 변경 없음, 단지 파이프라인 구조만 도입)
- `prompts/planner.md` stub 생성
- 검증: `npm run check && npm run build && npm test`

---

## Phase 3 Implementation Log

### 변경일
2026-05-08

### 변경 파일 목록
**신규 생성**
- `server/intent/pipeline/parseIntent.ts` — 분류 로직 위치 이동 (이전 `server/intent/parseIntent.ts`의 내용. import 경로만 한 단계 위로 조정)
- `server/intent/pipeline/planIntent.ts` — pass-through stub. `planIntent(intent, context?) → PlannedIntent` (40줄)
- `server/intent/prompts/planner.md` — Phase 3 stub 프롬프트. 코드에서 아직 로드하지 않음

**수정**
- `server/intent/parseIntent.ts` — re-export shim (`export * from "./pipeline/parseIntent.ts"`)으로 교체. 외부 import 경로 보존
- `server/intent/intentSchemas.ts` — `PlannedIntent`에 `source?: PlanSource`, `planningReason?: string` 메타 필드 추가. `ParsedIntent`/`DispatchResult`/`FormattedIntentReply` 호환성 그대로
- `server/intent/intentService.ts` — `routeIntentMessage` 내부에 `planIntent` 호출 삽입. `parsed → planIntent → plan.steps[0] → 기존 실행 로직` 흐름

### planIntent stub 명시
**Phase 3의 `planIntent`는 단순 pass-through다.**
- 입력 `ParsedIntent`를 `{ steps: [intent], source: "pass-through" }` 형태로 감싸 반환
- 멀티스텝 분해, LLM planner 호출, 컨텍스트 분석 모두 **미구현**
- `server/intent/prompts/planner.md`는 작성됐지만 코드에서 로드하지 않음 (Phase 4용)
- `PlanIntentContext` 인자는 정의돼 있으나 본문에서 사용하지 않음 (`_context` prefix로 명시)

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage`/`formatIntentRouteMessage`/`classifyIntent`/`normalizeIntent` 시그니처 동일
- `plan.steps[0] === parsed`이므로 기존 핸들러 실행 인텐트와 동일
- 5개 외부 import 경로(`telegram-bot.ts`, tRPC `intent.ts`/`llm.ts`, 3개 테스트 파일) 모두 그대로 동작
- 기존 `import { parseIntent, normalizeIntent } from "../intent/parseIntent.ts"` 형태도 shim으로 보존
- 추가된 로그 한 줄: `[INTENT] planIntent pass-through, steps= 1 source= pass-through`

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **564 passed** / 7 skipped / 2 todo (Phase 2와 동일 수치) |
| `npm run build` | ✅ vite 4.98s + esbuild `dist/index.js` 721.2kb (Phase 2 720.9kb 대비 +0.3kb, planIntent stub만큼) |

### 남은 리스크
1. **planner.md가 prod 번들에 미동봉** — classifier.md와 동일 이슈. 현재 코드에서 로드하지 않으므로 Phase 3 동작에는 영향 없음
2. **`PlannedIntent.source`/`planningReason` 미사용** — 타입에만 존재. Phase 4에서 LLM planner 도입 시 활용 예정
3. **`PlanIntentContext.channel` 미전달** — `routeIntentMessage`가 호출 채널(텔레그램/웹)을 알지 못함. Phase 4에서 `RouteIntentOptions`에 `channel?` 필드 추가 검토 필요

### Phase 4 제안
**목표**: dispatch 단계 분리 준비 + planIntent를 LLM planner로 진화 (선택적)

작업 후보:
- `server/intent/pipeline/dispatchIntent.ts` 신규 — 현재 `routeIntentMessage` 내부의 핸들러 registry 조회 + 승인 게이트 + try/catch 로직을 함수로 추출
- `routeIntentMessage`는 `parseIntent → planIntent → dispatchIntent → formatReply`(formatReply는 Phase 5) 오케스트레이터로 단순화
- public API 시그니처는 여전히 동결
- `dispatchIntent` 단위 테스트 추가 (승인 게이트 on/off, 핸들러 미존재, `execute_placeholder` 케이스)

선택 작업 (별도 결정 필요):
- `INTENT_LEGACY_MODE=true` 환경변수 가드 도입 (긴급 롤백 스위치, 설계서 §8-4)
- `RouteIntentOptions`에 `channel?: "telegram" | "web" | "cron" | "api"` 추가하여 `PlanIntentContext`에 전달

---

## Phase 4 Implementation Log

### 변경일
2026-05-08

### 변경 파일 목록
**신규 생성**
- `server/intent/pipeline/dispatchIntent.ts` — dispatch 로직 추출. `dispatchIntent(intent, options) → DispatchResult` (95줄)
- `server/__tests__/dispatchIntent.test.ts` — 단위 테스트 6건 (승인 게이트, allowExecute 통과, execute_placeholder, 핸들러 미등록, query 게이트 비작동, intent 보존)

**수정**
- `server/intent/intentService.ts` — dispatch 로직 제거. `parseIntent → planIntent → dispatchIntent` 오케스트레이터로 단순화. `dispatchToRouteResponse()` 어댑터 추가. 137줄 → 130줄

### 구현 내용

#### dispatchIntent.ts
기존 `routeIntentMessage`에서 다음 5가지 책임을 그대로 추출:
1. **승인 게이트** — `intent.type === "execute" && !allowExecute` → `requiresConfirmation: true`
2. **핸들러 조회** — `handlerRegistry[intent.action]` 존재 시 호출
3. **execute_placeholder 단축 응답** — 단계적 연결 중 메시지
4. **Gemini fallback 메시지** — 핸들러 미등록 액션
5. **try/catch 에러 응답** — 한국어 에러 메시지로 변환

핸들러 응답(`IntentRouteResponse`)을 `DispatchResult`로 변환하는 `fromHandlerResponse()` 내부 헬퍼 보유. Phase 4 시점에서는 두 타입이 구조적으로 동일하므로 본질적으로 identity copy다.

#### intentService.ts 단순화
```
routeIntentMessage:
  parseIntent(message)         // Phase 2
  → planIntent(parsed)         // Phase 3 (pass-through stub)
  → dispatchIntent(intent)     // Phase 4 (이번)
  → dispatchToRouteResponse()  // 어댑터: DispatchResult → IntentRouteResponse
```

`dispatchToRouteResponse()` 어댑터는 지시대로 intentService.ts 내부 helper로 둠. 향후 두 타입이 분기되면 이 한 곳에서만 수정.

#### dispatchIntent 단위 테스트 6건
| 테스트 | 검증 대상 |
|--------|-----------|
| execute + allowExecute=false | 승인 게이트 차단 + confirmation 필드 |
| execute + allowExecute=true | 게이트 통과 후 핸들러 미등록 fallback |
| execute_placeholder | 단축 응답 메시지 |
| 미등록 액션 | Gemini fallback 메시지 |
| query + allowExecute=false | 승인 게이트 비작동 |
| 임의 intent | DispatchResult.intent 무손실 전달 |

핸들러 미등록 케이스는 `__phase4_unknown_*__` 형태의 가짜 액션을 `as IntentAction`으로 캐스팅해 사용. 실제 등록 액션과 충돌 없음.

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage` 시그니처 동결 (`(options: RouteIntentOptions) => Promise<IntentRouteResponse>`)
- 5가지 dispatch 분기 로직과 메시지 문자열 100% 동일 (한 글자도 변경 없음)
- 5개 외부 import 경로(`telegram-bot.ts`, tRPC `intent.ts`/`llm.ts`, 3개 테스트 파일) 그대로 동작
- `classifyIntent`/`normalizeIntent`/`formatIntentRouteMessage` 그대로 export 유지
- 기존 564개 테스트 100% 통과 (회귀 0건)

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **570 passed** / 7 skipped / 2 todo (Phase 3 564 + 신규 6) |
| `npm run build` | ✅ vite 4.69s + esbuild `dist/index.js` 722.2kb (Phase 3 721.2kb 대비 +1.0kb) |

### 남은 리스크
1. **`fromHandlerResponse()` / `dispatchToRouteResponse()` 이중 변환** — 두 타입이 구조 동일이므로 현재는 noop. Phase 5에서 `DispatchResult`에 새 필드(예: `kind`, `items`)가 추가될 때 변환이 실제 의미를 갖게 됨
2. **로그 라인 위치 변동 없음** — `[INTENT] no handler for action:` 로그가 dispatchIntent 안으로 이동했으나 출력 시점·내용은 동일
3. **`fallbackIntent.ts` 도메인 import 위반은 그대로** — 별도 작업으로 후순위 (설계서 §5-3)

### Phase 5 제안
**목표**: `formatReply` 분리 + `HandlerResponse` 표준 스키마 도입

작업 후보:
- `server/intent/pipeline/formatReply.ts` 신규 — 현재 `formatIntentRouteMessage()` 로직 이동
- `routeIntentMessage`는 `parseIntent → planIntent → dispatchIntent` 까지만 담당. `formatReply`는 호출자(`telegram-bot.ts`, tRPC)가 직접 호출하거나 별도 헬퍼로 노출
- `HandlerResponse` 표준 스키마 (`kind: "text"|"list"|"report"|"confirmation"|"error"`) 도입. 현재 `data?.fileList`/`data?.emailList` 등 ad-hoc 필드 탐색을 `kind` 기반 분기로 교체
- 기존 핸들러 12개를 점진적으로 `HandlerResponse` 반환으로 마이그레이션 (CURRENT_TASK 1건씩 분리)
- `formatReply` 단위 테스트 추가 (각 `kind`별 포맷 + 빈 응답 fallback + raw object 차단)

선택 작업:
- `INTENT_LEGACY_MODE=true` 긴급 롤백 스위치 도입 (설계서 §8-4)
- `RouteIntentOptions`에 `channel?: "telegram" | "web" | "cron" | "api"` 추가
- `prompts/`/`planner.md`를 prod 번들에 포함하는 esbuild plugin (Phase 3·4 공통 잔여 리스크)

제약 동일:
- `routeIntentMessage` public API 시그니처 동결
- 핸들러 12개 일괄 변경 금지 (점진 마이그레이션 권장)
- planIntent 멀티스텝 분해 구현 금지
- fallbackIntent.ts 수정 금지
- 자동 commit/push 금지

---

## Phase 5 Implementation Log

### 변경일
2026-05-08

### 변경 파일 목록
**신규 생성**
- `server/intent/pipeline/formatReply.ts` — 응답 포맷팅 로직 (170줄). `formatReply(DispatchResult)`, `formatRouteResponse(IntentRouteResponse)` 어댑터, raw object 차단 헬퍼 4종, `inferKind()` Phase 5 초안
- `server/__tests__/formatReply.test.ts` — 단위 테스트 16건 (메인 12 + 헬퍼 4)

**수정**
- `server/intent/intentSchemas.ts` — `HandlerResponseKind` enum + `HandlerResponse` 인터페이스 초안 추가 (핸들러는 아직 미반환)
- `server/intent/intentService.ts` — `containsRawObjectShape`/`safeDisplayBody`/`formatIntentRouteMessage` 본문 제거, `formatReply.ts`로 위임. 130줄 → 99줄. `formatIntentRouteMessage`는 backward-compat alias로 유지

### formatReply 분리 내용

#### 추출된 로직 (intentService.ts → pipeline/formatReply.ts)
1. **승인 게이트 응답** — `ACTION REQUIRES CONFIRMATION` 헤더 + intent 정보 + `next=allowExecute=true` 가이드
2. **handled=false 빈 문자열** — Gemini fallback 트리거
3. **6개 ad-hoc 필드 우선순위 탐색** — `fileList → emailList → eventList → briefing → report → summary`
4. **raw object 차단** — `containsRawObjectShape({method|files})` → 한국어 안내로 대체
5. **safeDisplayBody fallback** — 매칭 실패 시 객체는 빈 문자열, 문자열은 그대로

모든 분기·메시지 문자열 100% 동일. byte-for-byte 동일 동작 보장.

#### Phase 5 추가 헬퍼 (export됨, 단위 테스트 보유)
- `containsRawObjectShape(data)` — 기존 헬퍼 외부 노출
- `isPlainObjectReply(data)` — 일반 객체 판별 (forward-looking, 현재 미사용)
- `safeStringifyForDebug(data, max)` — `stringifyPreview` 별칭, 디버그 전용
- `toUserVisibleText(data)` — `safeDisplayBody`와 동일 로직, 의미가 명확한 새 이름
- `inferKind(routed)` — `confirmation/list/report/text` 분기. **현재 formatReply 본문에서 호출하지 않음**

#### `formatReply` vs `formatRouteResponse`
- `formatReply(result: DispatchResult)` — Phase 5 새 진입점. `intentSchemas.DispatchResult` 사용
- `formatRouteResponse(routed: IntentRouteResponse)` — 기존 타입 어댑터. `formatReply`로 위임만 함
- `intentService.formatIntentRouteMessage(routed)` — 호환성 alias. `formatRouteResponse`로 위임

### HandlerResponse 표준 스키마는 아직 점진 적용
- `HandlerResponseKind = "text" | "list" | "report" | "confirmation" | "error"` 도입
- `HandlerResponse { kind, text, items?, meta? }` 인터페이스 도입
- **현재 12개 핸들러는 여전히 `IntentRouteResponse`를 반환**. 변경 없음
- `formatReply` 본문은 여전히 ad-hoc 필드 탐색을 사용. `inferKind()` 헬퍼만 export
- Phase 6+에서 핸들러를 1건씩 마이그레이션하면서 `formatReply` 본문을 `switch (kind)` 기반으로 점진 교체 가능

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage` 시그니처 동결
- `formatIntentRouteMessage` 시그니처·반환값 100% 동일
- 4개 외부 import(`messageRouter.ts`, tRPC `intent.ts`/`llm.ts`, `dealRouting.test.ts`) 모두 그대로 동작
- 모든 응답 문자열 byte-for-byte 동일
- 기존 570개 테스트 100% 통과 (회귀 0건)
- `dealRouting.test.ts:91-105`의 raw object 차단 회귀 테스트 통과

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **586 passed** / 7 skipped / 2 todo (Phase 4 570 + 신규 16) |
| `npm run build` | ✅ vite 4.96s + esbuild `dist/index.js` 722.5kb (Phase 4 722.2kb 대비 +0.3kb) |

#### 신규 테스트 16건 분포
| 그룹 | 수 | 내용 |
|------|----|------|
| formatReply 메인 | 12 | text/fileList/emailList/eventList/briefing+report+summary/handled=false/confirmation/raw method/raw files/일반 객체/문자열 data/`formatRouteResponse` 어댑터 |
| 헬퍼 함수 | 4 | `containsRawObjectShape`/`isPlainObjectReply`/`toUserVisibleText`/`inferKind` |

### Phase 6 제안
**목표**: 핸들러 점진 마이그레이션 — `IntentRouteResponse` → `HandlerResponse` 반환

작업 후보 (CURRENT_TASK 1건씩 분리 권장):
1. **google.ts 핸들러 마이그레이션**
   - `google_drive_search`/`google_get_emails`/`google_list_events`/`google_today_events` 등 9개 핸들러
   - `data.fileList`/`emailList`/`eventList` 대신 `HandlerResponse { kind: "list", text, items }` 반환
   - `formatReply` 내부에 `kind === "list"` 분기 추가 (기존 ad-hoc 탐색은 유지 — 다른 핸들러는 아직 마이그레이션 전)
2. **trading.ts 핸들러 마이그레이션**
   - `trading_balance`/`trading_pre_check`/`trading_review_report` 등
   - `kind: "report"` 또는 `"text"` 반환
3. **deals.ts 핸들러 마이그레이션**
   - `deals_command`
   - 가장 raw object 노출 위험이 높았던 영역. `kind: "list" | "text"`로 명시적 전환
4. **나머지 핸들러 9개 점진 처리**

각 단계는 독립 커밋·독립 롤백 가능. `formatReply` 본문이 점진적으로 `switch (kind)` 기반으로 변환됨.

선택 작업:
- `INTENT_LEGACY_MODE=true` 긴급 롤백 스위치 (설계서 §8-4)
- `prompts/`/`planner.md`/`classifier.md`를 prod 번들에 포함하는 esbuild plugin (Phase 1·3 공통 잔여 리스크)
- `RouteIntentOptions`에 `channel?: "telegram" | "web" | "cron" | "api"` 추가
- `fallbackIntent.ts` 도메인 import 위반 해소 (설계서 §5-3)

제약:
- `routeIntentMessage`/`formatIntentRouteMessage` public API 시그니처 동결
- 핸들러 일괄 변경 금지 (1건씩 마이그레이션)
- 마이그레이션된 핸들러도 기존 응답 문자열은 byte-for-byte 동일 유지
- planIntent 멀티스텝 분해 구현 금지
- fallbackIntent.ts 수정 금지 (별도 작업)
- 자동 commit/push 금지

---

## Phase 6-A Implementation Log

### 변경일
2026-05-08

### 변경 파일 목록

**수정 (7개) + 문서 (1개)**
- `server/intent/types.ts` — `HandlerResponse`/`HandlerResponseKind` 정의 이동 (intentSchemas.ts → types.ts), `IntentRouteResponse`에 `handlerResponse?: HandlerResponse` 옵션 필드 추가
- `server/intent/intentSchemas.ts` — 중복 정의 제거 후 types.ts에서 re-export. `DispatchResult`에 `handlerResponse?` 추가
- `server/intent/pipeline/dispatchIntent.ts` — `fromHandlerResponse()` 어댑터에서 `handlerResponse` propagate
- `server/intent/intentService.ts` — `dispatchToRouteResponse()` 어댑터에서 `handlerResponse` propagate
- `server/intent/pipeline/formatReply.ts` — `handlerResponse.kind === "list"` 분기 추가 (기존 legacy 탐색 fallback 유지)
- `server/intent/handlers/google.ts` — `driveSearch`/`getEmails`/`listEvents` 3개 핸들러에 `handlerResponse: { kind: "list", text, items, meta }` 필드 추가. **기존 `data.fileList`/`emailList`/`eventList` 유지**
- `server/__tests__/formatReply.test.ts` — Phase 6-A `kind="list"` 단위 테스트 7건 추가
- `docs/refactor/intent-service-refactor-plan.md` — 본 로그

### google.ts 마이그레이션 범위

**대상 핸들러 3개** (모두 `kind: "list"`)
| 핸들러 | text 본문 | items | meta |
|--------|----------|-------|------|
| `google_drive_search` | 줄바꿈 join (`\n`) | 파일 라인 배열 | `{ totalFiles, query }` |
| `google_get_emails` | 빈 줄 join (`\n\n`) | 메일 블록 배열 | `{ totalEmails, searchQuery }` |
| `google_list_events` | 빈 줄 join (`\n\n`) | 이벤트 블록 배열 | `{ totalEvents, maxResults }` |

**미마이그레이션 핸들러 (의도적 제외)** — `google.ts` 내 7개
- `google_create_event` (data.event만, 노출 위험 없음)
- `google_write_sheet` / `google_read_sheet` (response에 본문 통합)
- `google_send_email` (requiresConfirmation 분기)
- `google_today_events` (response에 본문 통합 — eventList 미사용)
- `google_ensure_schema` (response에 본문 통합)
- `google_reauth_guide` (단일 텍스트)

이 7개는 `data.fileList`/`emailList`/`eventList` legacy 키를 사용하지 않고 `response` 필드에 본문이 통합되어 있어 list 분기 마이그레이션 효과가 없음. Phase 6-C에서 `kind: "text"`/`"report"` 분기가 활성화될 때 함께 검토.

### 기존 data.* 필드 유지 여부

**유지.** 마이그레이션된 3개 핸들러 모두 다음 두 경로를 동시 채움:
- `data.fileList`/`emailList`/`eventList` — 기존 legacy 형식 (formatReply의 fallback 경로)
- `handlerResponse: { kind, text, items, meta }` — 신규 표준 형식 (formatReply의 우선 경로)

formatReply 우선순위:
1. `handlerResponse.text` (Phase 6-A 신규, kind === "list" 한정)
2. `data.fileList` → `data.emailList` → `data.eventList` → `data.briefing` → `data.report` → `data.summary`
3. `safeDisplayBody(data)` fallback

핵심 보장: 두 경로의 `text`가 동일 변수에서 파생되므로 출력은 byte-for-byte 동일. 단위 테스트 `kind=list 결과는 legacy fileList 만 있을 때와 byte-for-byte 동일`로 검증 완료.

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage`/`formatIntentRouteMessage` 시그니처 동결
- 마이그레이션된 3개 핸들러 응답 문자열 byte-for-byte 동일
- 미마이그레이션 9개 핸들러 코드 변경 없음
- 기존 통합 테스트(`dealRouting.test.ts` raw object 차단 회귀 포함) 모두 통과
- `IntentRouteResponse`/`DispatchResult`에 옵션 필드만 추가 (기존 호출자 영향 없음)

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **593 passed** / 7 skipped / 2 todo (Phase 5 586 + 신규 7) |
| `npm run build` | ✅ vite 4.70s + esbuild `dist/index.js` 723.5kb (Phase 5 722.5kb 대비 +1.0kb) |

#### 신규 테스트 7건
1. `kind=list + text` → fileList 동등 출력
2. `kind=list 결과 vs legacy fileList only` → byte-for-byte 동일
3. `kind=list + emailList` → `\n\n` separator 보존
4. `kind=list + eventList` → 동일
5. items 빈 배열 + text 빈 문자열 → legacy fileList fallback
6. `kind !== "list"` (예: `report`) → handlerResponse 무시, legacy 경로 사용
7. legacy data.fileList only (미마이그레이션) → 그대로 동작

### 남은 리스크
1. **9개 미마이그레이션 핸들러는 여전히 ad-hoc 응답** — Phase 6-B/6-C에서 1건씩 처리 예정
2. **`HandlerResponse.text` 와 `data.fileList` 동기화 책임** — 마이그레이션된 핸들러가 둘을 모두 채울 때 두 값이 일치해야 함. 현재 코드는 동일 변수에서 파생되어 일치 보장. 향후 핸들러 추가 시 코드 리뷰에서 주의 필요
3. **`kind: "report"`/`"text"` 분기 미활성** — formatReply는 list 분기만 추가. report/text/error는 legacy 경로 그대로. Phase 6-B(trading) / 6-C(나머지)에서 점진 활성화
4. **`google_today_events` 미마이그레이션** — `data.eventList`를 사용하지 않고 `response` 필드에 직접 본문 통합. `kind: "text"` 분기 활성화 시 마이그레이션 검토

### Phase 6-B 제안

**목표**: trading.ts 핸들러를 `kind: "report"` 표준으로 점진 마이그레이션

대상 후보 (실제 trading.ts 분석 후 확정):
- `trading_pre_check` — `formatPreCheck()` 결과. `handlerResponse: { kind: "report", text: response, meta: { symbol, side, leverage } }` 추가
- `trading_review_report` — `formatReviewReport()` 결과. 동일 패턴
- `trading_balance` / `trading_positions` / `trading_technical_analysis` — 출력 길이에 따라 `kind: "text"` 또는 `"report"`

작업 순서:
1. `trading.ts` 에서 report/list/text에 해당하는 핸들러 식별
2. `handlerResponse: { kind: "report", text }` 추가 (기존 `response`와 동일 본문)
3. `formatReply` 에 `kind === "report"` 분기 추가 — `handlerResponse.text` 우선, legacy `data.report`/`briefing`/`summary` fallback 유지
4. `formatReply.test.ts` 에 `kind="report"` 단위 테스트 추가 (legacy 동등 byte-for-byte 검증)
5. trading 통합 테스트 회귀 확인

선택 작업 (Phase 6-A 잔여):
- `inferKind()` 헬퍼를 formatReply 본문에서 실제 호출하도록 변환 (현재 export만 됨)
- `prompts/` 폴더를 prod 번들에 포함하는 esbuild plugin

제약:
- `routeIntentMessage`/`formatIntentRouteMessage` public API 시그니처 동결
- trading.ts 외 핸들러 수정 금지 (deals.ts, realestate.ts 등은 Phase 6-C)
- 마이그레이션된 핸들러도 응답 문자열 byte-for-byte 유지
- planIntent 멀티스텝 분해 구현 금지
- fallbackIntent.ts 수정 금지
- 자동 commit/push 금지

---

## Phase 6-B Implementation Log

### 변경일
2026-05-08

### 변경 파일 목록

**수정 (3개) + 문서 (1개)**
- `server/intent/pipeline/formatReply.ts` — `handlerText` 추출에서 `kind === "list" || kind === "report"` 둘 다 인식하도록 확장. `meta` 필드는 절대 읽지 않음을 주석으로 명시
- `server/intent/handlers/trading.ts` — 4개 핸들러에 `handlerResponse` 추가:
  - `tradingTechnicalAnalysis` — `text: briefing` (data.briefing 와 동일 본문)
  - `tradingPreCheck` — `text: ""` (본문이 response 안에 있어 중복 방지)
  - `tradingReviewReport` — `text: ""` (동일 패턴)
  - `analysisHandler` — `text: briefing` (analysis_indicators / analysis_rsi / analysis_macd / analysis_bollinger 공용 핸들러)
- `server/__tests__/formatReply.test.ts` — Phase 6-B `kind="report"` 단위 테스트 9건 추가, 기존 1건 수정 (kind=report → kind=text 로 비활성 케이스 변경)
- `docs/refactor/intent-service-refactor-plan.md` — 본 로그

### trading.ts 마이그레이션 범위

**대상 핸들러 4개** (모두 `kind: "report"`)

| 핸들러 | text 본문 전략 | meta |
|--------|---------------|------|
| `trading_technical_analysis` | `briefing` (data.briefing 미러) | `{ symbol, timeframe, exchange, candles }` |
| `trading_pre_check` | `""` (본문이 `response`에 통째로 있음) | `{ symbol, side, entryPrice, hasStopLoss, hasTakeProfit }` |
| `trading_review_report` | `""` (동일 패턴) | `{ symbol, side, leverage, hasMoney, hasQuantity, notesCount }` |
| `analysis_*` (4개 액션) | `briefing` (data.briefing 미러) | `{ symbol, timeframe, action }` |

#### 두 패턴이 공존하는 이유
1. **분리형** (`tradingTechnicalAnalysis`, `analysisHandler`):
   - `response`에 짧은 헤더, `data.briefing`에 본문
   - 마이그레이션 후: `handlerResponse.text = briefing` → formatReply가 `response\n\nbriefing` 출력. 기존과 동일
2. **통합형** (`tradingPreCheck`, `tradingReviewReport`):
   - `response`에 본문 통째로, `data` 본문 키 없음
   - 마이그레이션 후: `handlerResponse.text = ""` → formatReply는 `response` 만 출력 (legacy fallback 모두 빈 문자열). 본문 중복 절대 없음
   - kind+meta 신호만 추가됨 (텔레메트리/향후 switch(kind) 전환 대비)

#### 미마이그레이션 핸들러 (의도적 제외)
trading.ts 내 13개 중 9개:
- `tradingBalance`, `tradingPositions` (잔고/포지션, kind=text 성격)
- `tradingRiskCalculation`, `tradingRiskCalculate` (계산 결과, data.method/params 형태 — raw object 차단 영역)
- `tradingRiskStatus`, `tradingRiskLock`, `tradingRiskUnlock`, `tradingRiskSettingsUpdate` (단일 텍스트)
- `tradingAddAlert` (단일 텍스트 + data.alert)

이 9개는 kind=text/error 분기 미활성 또는 raw object 영역이라 Phase 6-B 범위 밖. Phase 6-C/6-D에서 검토.

### 기존 response/data.* 필드 유지 여부

**유지.** 마이그레이션된 4개 핸들러 모두 다음을 보존:
- `response` 필드 — 기존 문자열 그대로 (한 글자도 변경 없음)
- `data.analysis`, `data.briefing` — 기존 형식 유지
- `handlerResponse` — 신규 추가 (옵션 필드)

formatReply 우선순위 (Phase 6-B 갱신):
1. `handlerResponse.text` (kind === "list" || kind === "report" + 비어있지 않을 때)
2. `data.fileList` → `emailList` → `eventList` → `briefing` → `report` → `summary`
3. `safeDisplayBody(data)` fallback

핵심 보장:
- 분리형 (text=briefing): handlerText 와 data.briefing 이 같은 변수에서 파생되어 동일 → 출력 byte-for-byte 동일
- 통합형 (text=""): handlerText 비어 있어 legacy fallback 그대로 → 출력 byte-for-byte 동일
- 단위 테스트로 두 패턴 모두 byte-for-byte 검증 완료

### meta/raw object 사용자 노출 없음
- `formatReply.ts` 본문에서 `result.handlerResponse.meta` 를 절대 읽지 않음 (주석으로 명시)
- 단위 테스트 `kind=report + meta 필드는 사용자 응답에 절대 노출되지 않음` 으로 검증
- meta 에 `secretKey`, `internalToken`, `apiKey`, `BTC/USDT` symbol 등 다양한 값 넣어도 출력에 포함 안 됨

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage`/`formatIntentRouteMessage` 시그니처 동결
- 4개 마이그레이션 핸들러 응답 문자열 byte-for-byte 동일
- 미마이그레이션 9개 trading 핸들러 코드 변경 없음
- trading 관련 기존 테스트 (`technicalAnalysis.test.ts`, `riskGuard.test.ts`, `reviewReport.test.ts`) 회귀 0건 — 이들은 엔진 단위 테스트로 routeIntentMessage 미사용
- 기존 593개 테스트 100% 통과

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **602 passed** / 7 skipped / 2 todo (Phase 6-A 593 + 신규 9) |
| `npm run build` | ✅ vite 5.18s + esbuild `dist/index.js` 724.5kb (Phase 6-A 723.5kb 대비 +1.0kb) |

#### 신규 테스트 9건
1. `kind=report + text` → tradingTechnicalAnalysis 패턴 출력
2. `kind=report + text` 가 legacy `data.briefing` 와 byte-for-byte 동일
3. `kind=report + text` 가 legacy `data.report` 와 byte-for-byte 동일
4. `kind=report + text` 가 legacy `data.summary` 와 byte-for-byte 동일
5. `kind=report + text 빈 문자열` → tradingPreCheck 패턴 (response 만, 중복 없음)
6. `kind=report + text 빈 문자열 + legacy data.briefing` → legacy fallback
7. `kind=report + meta` 필드는 사용자 응답에 절대 노출되지 않음
8. `kind=list` 기존 테스트 회귀 없음 (Phase 6-A 정상 동작)
9. `kind=report + text undefined` → legacy fallback

기존 테스트 1건 수정: 기존 "kind=report 미지원" 시나리오를 "kind=text 미지원"으로 변경 (Phase 6-B에서 report 가 지원 kind 로 승격됐기 때문).

### 남은 리스크
1. **`analysisHandler` 의 응답 본문 중복은 그대로 유지** — `response = briefing` + `data.briefing = briefing` → 출력 `briefing\n\nbriefing`. 기존 버그를 보존했고 Phase 6-B 범위 밖. 향후 별도 작업으로 수정 가능
2. **9개 미마이그레이션 trading 핸들러** — Phase 6-C/6-D에서 1건씩 검토
3. **`meta` 필드 신뢰성** — 핸들러가 의도적으로 노출 위험 데이터를 meta 에 넣지 않는다는 운영 약속에 의존. 코드는 meta 를 읽지 않지만, 향후 `kind: "error"` 분기 등에서 meta 사용 시 노출 검증 필요
4. **kind=text/error/confirmation 분기 미활성** — Phase 6-C 에서 deals.ts 마이그레이션 후 함께 검토

### Phase 6-C 제안

**목표**: deals.ts 핸들러 마이그레이션 — raw object 노출 위험이 가장 높았던 영역

대상 후보:
- `deals_command` — 단일 dispatcher 안에서 7개 sub-command 처리 (`딜 추가/목록/상세/노트북/저장/마감/이정표`)
- 일부 sub-command 는 list 성격 (`딜 목록`), 일부는 text/text+report (`딜 추가`, `딜 마감`), 일부는 carrier 가 다른 형태

작업 순서:
1. `deals.ts` (또는 `handlers/deals.ts`) 분석 — 어떤 sub-command 가 어떤 kind 인지 식별
2. sub-command 별 분기에서 `handlerResponse: { kind, text, items?, meta }` 추가
3. 가장 raw object 노출 위험 높았던 케이스 (예: `dealMeta` 객체) 가 `data` 에 들어갈 때 차단되는지 회귀 검증
4. `formatReply.test.ts` 에 `kind="text"` 분기 추가 단위 테스트 (deals.ts 가 사용하면 활성화)
5. `dealRouting.test.ts` raw object 차단 회귀 100% 통과 확인

선택 작업 (Phase 6-A/6-B 잔여):
- `inferKind()` 헬퍼를 formatReply 본문에서 실제 호출 (현재 export만)
- `prompts/` 폴더를 prod 번들에 포함하는 esbuild plugin
- `analysisHandler` 본문 중복 버그 수정 (Phase 6-B 보존 항목)
- google.ts 미마이그레이션 7개 핸들러 검토 (kind: "text" 분기 활성 후)

제약:
- `routeIntentMessage`/`formatIntentRouteMessage` public API 시그니처 동결
- deals.ts 외 핸들러 수정 금지 (realestate.ts, finance.ts, intelligence.ts, wiki.ts, agents.ts 등은 Phase 6-D)
- 마이그레이션된 sub-command 도 응답 문자열 byte-for-byte 유지
- planIntent 멀티스텝 분해 구현 금지
- fallbackIntent.ts 수정 금지
- 자동 commit/push 금지

---

## Phase 6-C Implementation Log

### 변경일
2026-05-08

### 변경 파일 목록

**수정 (3개) + 문서 (1개)**
- `server/intent/pipeline/formatReply.ts` — `handlerText` 추출에 `kind === "text"` 추가 (`list || report || text`). raw object 방어 흐름은 그대로 유지. 주석에 Phase 6-C 도입 의도 명시
- `server/intent/handlers/deals.ts` — `parseDealCommand` 재호출로 sub-command 식별 후 `handlerResponse: { kind, text: "", meta }` 추가. 본문 중복 방지를 위해 `text=""` 전략 사용
- `server/__tests__/formatReply.test.ts` — Phase 6-C `kind="text"` 단위 테스트 9건 추가, 기존 1건 수정 (kind=text → kind=error 비활성 케이스로 이동)
- `docs/refactor/intent-service-refactor-plan.md` — 본 로그

### deals.ts sub-command 매핑 결과

`handlers/deals.ts`는 단 한 개의 핸들러(`deals_command`)로 14개 sub-command를 dispatcher 패턴으로 처리한다. 실제 응답 본문 조립은 `server/deals/telegramDealFileHandler.ts`의 `executeDealCommandText` 안에서 이루어지며, 반환값은 **단일 string**이다 (data 필드 없음).

| sub-command | parseDealCommand 의 action | 매핑 kind | text 전략 |
|-------------|--------------------------|-----------|-----------|
| 딜 목록 | `list` | `list` | `""` (본문은 response 안) |
| 딜 추가 | `create` | `text` | `""` |
| 딜 상세 | `detail` | `text` | `""` |
| 딜 노트북 | `notebook` | `text` | `""` |
| 딜 저장 (텍스트만) | (handler fallthrough) | `text` | `""` |
| 딜 시트 / 딜 시트 서식 | `sheet` / `sheet_format` | `text` | `""` |
| 딜 상태 | `status` | `text` | `""` |
| 딜 마감일 등록/해제 | `deadline_set` / `deadline_clear` | `text` | `""` |
| 이정표 추가/완료/삭제 | `milestone_add` / `_complete` / `_remove` | `text` | `""` |
| 알 수 없는 명령 | `unknown` | `text` | `""` (Phase 6-D에서 `error` 검토) |

**핵심 결정**: 모든 sub-command가 `text=""` 전략을 사용한다. 응답 본문이 통째로 `response` 필드에 들어 있고 별도 헤더가 없기 때문이다. `handlerResponse`는 `kind` + `meta`(action, dealName, reason) 마커 역할만 수행하며, formatReply의 출력은 byte-for-byte 변동 없음.

### kind=text 활성화 내용

formatReply.ts 의 `handlerText` 추출 조건을 다음과 같이 확장:
```ts
(handlerKind === "list" || handlerKind === "report" || handlerKind === "text")
  && typeof result.handlerResponse?.text === "string"
```

활성화 효과:
- 마이그레이션된 deals 핸들러(text=""): handlerText="" → primaryBody fallback → 출력 = response 만 → 기존 동작 동일
- 향후 핸들러가 `kind: "text"` + 비어있지 않은 `text`를 반환하면 `response\n\ntext` 패턴으로 결합 출력 (kind=list/report와 동일 join)
- `kind: "error"` / `"confirmation"` 분기는 여전히 비활성 (Phase 6-D 이후 검토)

방어적 가드:
- `typeof === "string"` 체크 — text 필드에 객체가 잘못 들어와도 출력 누출 차단
- `meta` 필드는 절대 읽지 않음 (코드와 주석으로 명시)

### raw object 방어 검증 결과

deals_command는 구조적으로 raw object 노출 위험이 매우 낮다:
1. `dealTextHandler.execute()`가 string을 반환 → `handlers/deals.ts`에서 `response: string`으로 명시
2. `data` 필드를 설정하지 않음 → formatReply의 raw object 차단 분기 자체가 발화하지 않음
3. `meta`는 `action` + `dealName` + `reason` (모두 사용자 입력 또는 enum) — 토큰/시크릿/내부 객체 없음

추가 검증 (formatReply 단위 테스트로 보장):
- `kind=text + meta { internalToken, apiKey, secret, dealMeta }` → 출력에 절대 미노출
- `kind=text + data { method, params }` → 한국어 차단 안내로 대체, JSON/`{`/`internalRpc` 모두 미노출
- `kind=text + text 비어있지 않음 + data raw object` → text 우선 사용, raw object 잠묵
- `kind=text + text 가 객체` (방어적 케이스) → typeof 가드로 legacy fallback, `[object Object]`/`{` 미노출

기존 `dealRouting.test.ts:48-52` 회귀 검증:
- `routeIntentMessage({ message: "딜 추가 한남동644", allowExecute: true })` → 신규 handlerResponse 추가됨에도 출력 동일
- `formatIntentRouteMessage(create)` → "{" 미포함 (raw object 차단 정상)

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **611 passed** / 7 skipped / 2 todo (Phase 6-B 602 + 신규 9) |
| `npm run build` | ✅ vite 4.54s + esbuild `dist/index.js` 725.0kb (Phase 6-B 724.5kb 대비 +0.5kb) |

#### 신규 테스트 9건 (formatReply Phase 6-C 그룹)
1. `kind=text + 비어있지 않은 text` → `response\n\ntext` 결합
2. `kind=text + text 빈 문자열` → legacy fallback (deals 마이그레이션 패턴, 본문 중복 방지)
3. `kind=text + meta { secret/internalToken/apiKey/dealMeta }` → 사용자 응답 절대 미노출
4. `kind=text + data raw object` → `[object Object]`/JSON 미노출 + 한국어 안내
5. `kind=text + text 비어있지 않음 + data raw object` → text 우선, raw object 잠묵
6. `kind=text + text 가 객체` (방어 케이스) → typeof 가드 + legacy fallback
7. `kind=list` 회귀 검증 (Phase 6-A 정상)
8. `kind=report` 회귀 검증 (Phase 6-B 정상)
9. 마이그레이션 vs 미마이그레이션 byte-for-byte 동일

기존 테스트 1건 수정: 비활성 kind 검증을 `kind=text` → `kind=error`로 이동 (Phase 6-C에서 text 가 활성 kind로 승격됐기 때문).

회귀 검증 (기존 통합 테스트 모두 통과):
- `dealRouting.test.ts` — `formatIntentRouteMessage(create)` 의 "{" 차단 + `📋 딜 목록 (1건)` 응답 형식 + 노트북 등록/상세 출력 모두 통과
- `dealNameParsing.test.ts` — 8개 PF 진행상황 라우팅 케이스 전부 통과
- `dispatchIntent.test.ts` — execute_placeholder/handler 미등록/승인 게이트 케이스 전부 통과

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage`/`formatIntentRouteMessage` 시그니처 동결
- 14개 sub-command 응답 문자열 byte-for-byte 동일 (text="" 전략)
- 미마이그레이션 핸들러 코드 변경 없음
- google.ts / trading.ts / 기타 모든 도메인 핸들러 수정 없음
- 기존 602개 테스트 100% 통과

### 남은 리스크
1. **`unknown` action 응답이 `text` kind로 분류됨** — `⚠️ ${command.reason}` 형태의 에러 메시지가 `kind: "text"`로 마킹됨. 사용자 출력은 변동 없으나, 향후 `kind: "error"` 분기 활성화 시 재분류 필요 (Phase 6-D)
2. **`list` action에 items 배열 미설정** — `handlerResponse.items`는 undefined. 본문은 `response`에 통째로 있으므로 출력에 영향 없으나, 향후 telegramDealFileHandler가 구조화된 데이터를 반환하면 items 채우기 가능
3. **`parseDealCommand` 재호출 비용** — 동일 메시지를 두 번 파싱 (한 번은 `dealTextHandler.execute` 내부, 한 번은 handlers/deals.ts). 정규식 기반 가벼운 파싱이라 무시 가능한 수준이나, 향후 telegramDealFileHandler가 `{ response, command }` 구조화된 결과를 반환하도록 리팩토링하면 제거 가능
4. **`meta.dealName`이 사용자 입력 한글 문자열** — 현재 코드는 meta를 절대 읽지 않으므로 안전. 향후 `kind: "error"` 분기에서 meta를 사용자 응답에 포함시킨다면 sanitize 필요
5. **Phase 6-C 누적 미해결**: `prompts/` 폴더 prod 번들 미동봉, `inferKind()` 헬퍼 미사용, `analysisHandler` 본문 중복 버그

### Phase 6-D 제안

**목표**: 나머지 도메인 핸들러 마이그레이션 + `kind: "error"` 분기 활성화

대상 후보 (1건씩 분리 권장):

#### 우선순위 1: realestate.ts
- `realestate_portfolio_summary` / `realestate_feasibility` / `realestate_simple_feasibility` — report 성격
- `realestate_land_use` — `data.method` raw object 노출 위험 영역 (`dealRouting.test.ts:91` 차단 회귀 테스트 대상)
- `realestate_real_transaction` / `realestate_land_price` — list 또는 report
- `realestate_add_deal` / `realestate_update_deal_stage` — text

#### 우선순위 2: finance.ts
- `finance_dart_disclosures` — list 성격 (공시 목록)

#### 우선순위 3: intelligence.ts / wiki.ts / agents.ts / approval.ts / chat.ts / knowledgePipeline.ts / notebooklm.ts
- `intelligence_morning_briefing` — report
- `wiki_save` / `wiki_search` / `wiki_auto_classify` — text + list
- `agent_command` — text
- `chat_telegram_recent` — list
- `nb_command` / `nb_save` / `meet_save` / `kakao_paste` / `tg_pipeline_capture` — text + list

#### 우선순위 4: kind="error" 분기 활성화
- 현재 deals.ts의 `unknown` action 등 에러 케이스를 `kind: "error"`로 재분류
- formatReply에 `kind === "error"` 분기 추가:
  - 에러 메시지를 그대로 응답 (response 또는 handlerResponse.text)
  - 공통 에러 prefix 추가 검토 (`⚠️ ` 등)
  - 에러 종류별 사용자 가이드 추가 검토

#### 우선순위 5: kind="confirmation" 분기 정리 (선택)
- 현재 confirmation은 `requiresConfirmation: true` 필드로 처리되고 있음
- `kind: "confirmation"`을 추가로 활성화할지, 아니면 기존 필드를 유지할지 결정

선택 작업 (Phase 6-A/6-B/6-C 누적 잔여):
- `inferKind()` 헬퍼를 formatReply 본문에서 실제 호출
- `prompts/` 폴더를 prod 번들에 포함하는 esbuild plugin
- `analysisHandler` 본문 중복 버그 수정
- `telegramDealFileHandler` 가 `{ response, command }` 구조화된 결과를 반환하도록 리팩토링 (parseDealCommand 재호출 제거)
- google.ts / trading.ts / deals.ts 미마이그레이션 잔여 핸들러 검토

제약 (Phase 6-A 이후 동일):
- `routeIntentMessage`/`formatIntentRouteMessage` public API 시그니처 동결
- 도메인 1개씩 마이그레이션 (한 번에 하나씩)
- 마이그레이션된 핸들러도 응답 문자열 byte-for-byte 유지
- planIntent 멀티스텝 분해 구현 금지
- fallbackIntent.ts 수정 금지
- 자동 commit/push 금지

---

## Phase 6-D-1 구현 로그

### 변경일
2026-05-09

### 변경 파일 목록

**수정 (2개) + 문서 (1개)**
- `server/intent/handlers/realestate.ts` — 8개 핸들러 모두에 `handlerResponse` 추가. `formatReply.ts` 무수정
- `server/__tests__/formatReply.test.ts` — Phase 6-D-1 realestate 회귀 단위 테스트 9건 추가
- `docs/refactor/intent-service-refactor-plan.md` — 본 로그

### realestate.ts 액션 목록 + kind 매핑

총 8개 액션 식별 — 모두 마이그레이션 완료. `formatReply.ts`는 손대지 않음 (이미 list/report/text 분기 활성).

| 액션 | response 본문 위치 | data 형태 | kind | text 전략 | meta 키 |
|------|-------------------|----------|------|-----------|--------|
| `realestate_portfolio_summary` | response (헤더만) | `{ summary }` 객체 | `text` | `""` | `action` |
| `realestate_simple_feasibility` | data.report (분리형) | `{ result, report }` | `report` | `report` 미러 | `action`, `projectName`, `totalUnits`, `projectMonths` |
| `realestate_feasibility` | data.report (분리형) | `{ result, report }` | `report` | `report` 미러 | `action`, `projectName`, `floors`, `loanLTV` |
| `realestate_land_use` | response (raw object 차단 영역) | `{ method, params }` | `text` | `""` | `action`, `pnu` |
| `realestate_land_price` | response (raw object 차단) | `{ method, params }` | `text` | `""` | `action`, `pnu`, `year` |
| `realestate_real_transaction` | response (raw object 차단) | `{ method, params }` | `text` | `""` | `action`, `regionCode`, `yearMonth` |
| `realestate_add_deal` | response (헤더만) | `{ deal }` 객체 | `text` | `""` | `action`, `projectName`, `stage` |
| `realestate_update_deal_stage` | response (헤더만) | `{ deal }` 객체 | `text` | `""` | `action`, `id`, `stage` |

#### 두 패턴이 공존하는 이유
- **분리형** (feasibility 2종): `response`는 짧은 헤더, `data.report`에 본문. `text=report` 미러로 신/구 경로 동일 출력.
- **통합형** (나머지 6종): `response`에 모든 사용자용 정보, `data`는 구조화된 객체(`summary`/`deal`) 또는 raw object(`{method,params}`). 본문 중복 방지 위해 `text=""`. formatReply의 legacy 경로가 그대로 처리.

### 기존 response/data.* 필드 유지 여부

**모두 유지.** 8개 핸들러 전부 다음 보존:
- `response` 필드 — 한 글자도 변경 없음 (인코딩 깨진 헤더 `?ъ뾽??遺꾩꽍...`도 그대로 byte-for-byte 보존)
- `data` 필드 — 기존 키(`summary`/`result`/`report`/`method`/`params`/`deal`) 그대로
- `handlerResponse` — 신규 추가만 (옵션 필드)

formatReply 우선순위 그대로 (Phase 6-C 결과):
1. `handlerResponse.text` (kind ∈ {list, report, text} + 비어있지 않을 때)
2. legacy `data.fileList → emailList → eventList → briefing → report → summary`
3. `safeDisplayBody(data)` fallback (raw object 차단 + 객체 → 빈 문자열)

핵심 보장:
- `feasibility`/`simple_feasibility`: `handlerResponse.text === data.report` (같은 변수에서 파생) → 신/구 경로 동일 → byte-for-byte 동등
- `land_use`/`land_price`/`real_transaction`: `text=""` → handlerText="" → legacy fallback → `safeDisplayBody({method,...})` → "⚠️ 내부 데이터..." 안내 → 차단 동작 유지
- 나머지 3개: `text=""` + `data` 객체 → `safeDisplayBody` 빈 문자열 → response만 → 동등

### raw object 방어 검증 결과

**realestate가 raw object 노출 위험이 가장 높았던 영역**(원래 `dealRouting.test.ts:91-105` 차단 회귀 테스트가 `realestate_land_use` 형태를 직접 사용). 마이그레이션 후에도 차단 동작 유지를 단위 테스트 6건으로 검증:

1. `realestate_land_use` 패턴 → "내부 데이터" 안내 + `"method"`/JSON/`{`/PNU 미노출
2. `realestate_land_price` 패턴 → 동일 + meta의 `pnu`/`year` 미노출 (formatReply가 meta 미참조 검증)
3. `realestate_real_transaction` 패턴 → 동일 + `regionCode`/`yearMonth` 미노출
4. `realestate_portfolio_summary`(`{summary:{...}}`) → response만, `totalDeals`/`totalLoan`/`[object Object]` 미노출
5. `realestate_add_deal`(`{deal:{...}}`) → response만, `deal-uuid`/`은행A` 미노출
6. `realestate_update_deal_stage` + meta에 `secret`/`internalToken`/`apiKey` → 모두 미노출

기존 `dealRouting.test.ts:91-105` (raw object 차단 회귀) 100% 통과 확인.

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **620 passed** / 7 skipped / 2 todo (Phase 6-C 611 + 신규 9) |
| `npm run build` | ✅ vite 4.99s + esbuild `dist/index.js` 726.5kb (Phase 6-C 725.0kb 대비 +1.5kb) |

#### 신규 단위 테스트 9건 (formatReply Phase 6-D-1 그룹)
1. `realestate_simple_feasibility` 패턴 — kind=report + text=report 가 legacy `data.report`와 byte-for-byte 동일
2. `realestate_feasibility` 패턴 — 인코딩 깨진 헤더 보존 + report 미러
3. `realestate_land_use` 패턴 — raw object 차단 + PNU 미노출
4. `realestate_land_price` 패턴 — meta `pnu`/`year` 미노출
5. `realestate_real_transaction` 패턴 — `regionCode`/`yearMonth` 미노출
6. `realestate_portfolio_summary` 패턴 — `data.summary` 객체 → response만
7. `realestate_add_deal` 패턴 — `data.deal` 객체 → response만
8. `meta.secret/internalToken/apiKey` 사용자 응답 미노출
9. `dealRouting.test.ts:91` 회귀 시나리오 — 미마이그레이션 vs 마이그레이션 byte-for-byte 동일

#### 통합 테스트 회귀 검증
- `dealRouting.test.ts` 전체 (raw object 차단 + 딜 라우팅) — 통과
- `dealNameParsing.test.ts` 8개 PF 라우팅 — 통과
- `dealPipeline.test.ts`, `feasibilityEngine.test.ts` 도메인 단위 테스트 — `routeIntentMessage` 미사용이라 회귀 무관, 통과
- 기존 611건 중 회귀 0건

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage`/`formatIntentRouteMessage` 시그니처 동결
- 8개 마이그레이션 핸들러 응답 문자열 byte-for-byte 동일 (인코딩 깨진 헤더 포함 보존)
- `formatReply.ts` 무수정 — 다른 도메인(google/trading/deals) 회귀 영향 0
- 미마이그레이션 도메인(finance/intelligence/wiki/agents/chat/knowledge/notebooklm/approval) 변경 없음
- raw object 차단 동작 100% 유지 (PNU/regionCode/method 등 모두 미노출)

### 남은 리스크
1. **`feasibility` 핸들러 response 문자열 인코딩 깨짐 보존** — `?ъ뾽??遺꾩꽍???꾨즺?덉뒿?덈떎.`. byte-for-byte 보존 원칙으로 손대지 않음. 별도 작업(인코딩 정상화) 필요 시 응답 문자열이 변경되므로 영향 분석 필요
2. **`portfolio_summary`/`add_deal`/`update_deal_stage` 본문 미노출** — `data.summary`/`data.deal`이 객체라 사용자에게는 response 한 줄만 보임. 기존 동작 그대로지만, 사용자 입장에서 정보 부족 가능. 향후 `kind: "report"` 풀 마이그레이션 시 본문 추출 검토
3. **`land_use`/`land_price`/`real_transaction` 응답에 "⚠️ 내부 데이터..." 안내 표시** — 외부 API 미연결 상태에서 raw object 차단으로 인한 안내. 실제 API 연동 시 응답 형식 재검토 필요 (현재 동작 보존 우선)
4. **`unknown` 액션 미존재** — realestate.ts에는 unknown 액션이 없어 error kind 검토 대상 아님
5. **누적 잔여**: `prompts/` prod 번들 미동봉, `inferKind()` 미사용, `analysisHandler` 본문 중복 버그, `telegramDealFileHandler` 구조화 리팩토링

### Phase 6-D-2 제안

**다음 단계는 finance.ts 또는 intelligence.ts 중 하나만 선택 권장.**

#### 옵션 A: finance.ts (추천 — 작업량 작음)
- 대상: `finance_dart_disclosures` 1개 핸들러 추정
- DART 공시 목록 → kind: "list" 후보
- 작업량 작아 빠른 마이그레이션 가능
- list 분기 회귀 검증에 유리

#### 옵션 B: intelligence.ts (작업량 중간)
- 대상: `intelligence_morning_briefing` 1개 (또는 그 이상) 핸들러 추정
- 모닝 브리핑 → kind: "report" 후보
- 시장/DART/위키/RiskGuard 섹션 통합 본문 → 분리형 vs 통합형 결정 필요
- briefing 본문에 섹션이 많아 마이그레이션 검증 복잡도 중간

#### 옵션 C: chat.ts / wiki.ts / agents.ts / approval.ts / knowledgePipeline.ts / notebooklm.ts
- 각 도메인 1개씩 별도 Phase(6-D-3, 6-D-4, ...)로 분리 권장

#### 권장: Phase 6-D-2 = finance.ts
- 핸들러 1개만 → 작업 단위 작음
- list 분기 추가 검증 — google.ts 이후 두 번째 list 도메인
- DART API 응답이 raw object 형태일 가능성 높아 차단 회귀 검증 가치 있음

#### Phase 6-D 후반부 (6-D-X 이후) 작업
- kind="error" 분기 활성화 — deals.ts `unknown` action 등 재분류
- kind="confirmation" 정리 (선택)
- 누적 잔여 작업 처리

제약 (Phase 6 동일):
- `routeIntentMessage`/`formatIntentRouteMessage` public API 시그니처 동결
- 도메인 1개씩 마이그레이션
- 마이그레이션된 핸들러도 응답 문자열 byte-for-byte 유지
- planIntent 멀티스텝 분해 구현 금지
- fallbackIntent.ts 수정 금지
- 자동 commit/push 금지

---

## Phase 6-D-2 구현 로그

### 변경일
2026-05-09

### 변경 파일 목록

**수정 (2개) + 문서 (1개)**
- `server/intent/handlers/finance.ts` — 단일 핸들러 `dartDisclosures`에 `handlerResponse` 추가. `formatReply.ts` 무수정
- `server/__tests__/formatReply.test.ts` — Phase 6-D-2 finance 회귀 단위 테스트 9건 추가
- `docs/refactor/intent-service-refactor-plan.md` — 본 로그

### finance.ts 액션 목록 + kind 매핑

총 1개 액션 식별 — 마이그레이션 완료. `formatReply.ts` 무수정.

| 액션 | response 본문 위치 | data 형태 | kind | text 전략 | meta 키 |
|------|-------------------|----------|------|-----------|--------|
| `finance_dart_disclosures` | response (인코딩 깨진 헤더) | `{ corpCode, startDate, endDate, disclosures[] }` | `list` | `""` | `action`, `corpCode`, `startDate`, `endDate`, `disclosureCount` |

#### 마이그레이션 패턴
- **통합형(text="")** 채택. `response`에는 헤더 한 줄(`DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.` — 인코딩 깨짐 포함 byte-for-byte 보존), 본문은 따로 없음
- `data.disclosures`는 DART API 원본 객체 배열. 기존 `formatReply` 의 `safeDisplayBody` 가 빈 문자열로 처리하여 사용자 응답에 노출되지 않음
- `kind: "list"` 마커 + `meta`(공시 건수 등 디버그 정보)만 추가. 출력 byte-for-byte 동일

#### 본문 포맷팅 미수행 결정 근거
- 현재 finance 핸들러는 `disclosures` 배열을 사용자용 텍스트로 포맷팅하지 않음 (도메인 모듈에 별도 포맷터 부재)
- 향후 본문 포맷팅 도입 시 `data.fileList` 형태로 추가하거나 `handlerResponse.text`에 직접 작성하면 자연스럽게 활성화됨
- Phase 6-D-2 범위는 **HandlerResponse 마이그레이션**이고 응답 풍부화는 별도 작업이므로 보류

### 기존 response/data.* 필드 유지 여부

**모두 유지.**
- `response` 필드 — 인코딩 깨진 헤더 포함 한 글자도 변경 없음
- `data` 필드 — `corpCode`/`startDate`/`endDate`/`disclosures` 모두 그대로
- `handlerResponse` — 신규 추가만 (옵션 필드)

formatReply 흐름:
1. `handlerResponse.text === ""` → handlerText="" → fall through
2. legacy `data.fileList`/`emailList`/... → 모두 미존재 → primaryBody=""
3. `safeDisplayBody({corpCode, ..., disclosures})` → 객체이고 raw object shape(`method`/`files`) 아님 → `console.warn` 후 빈 문자열 반환
4. 출력 = `response` 한 줄

마이그레이션 전후 byte-for-byte 동일 (단위 테스트로 검증).

### raw object 방어 검증 결과

`finance_dart_disclosures` 는 raw object 위험 영역(`data.disclosures` 가 DART API 원본 배열). 마이그레이션 후에도 차단 동작 유지를 단위 테스트 4건으로 검증:

1. `data.disclosures` 배열 안의 `rceptNo`/`reportNm` 등 DART 식별자 → 사용자 응답에 절대 미노출
2. `[object Object]`/JSON/`{` 출력 절대 금지
3. `meta.apiKey`/`internalToken`/`secret`/`password` → 모두 미노출
4. 빈 배열(`disclosures: []`) → `[]` 문자열도 미노출, response 한 줄만

`containsRawObjectShape` 의 `method`/`files` 키 매칭은 finance 응답에 해당 안 됨 (그래서 "내부 데이터" 안내는 뜨지 않음). 대신 `safeDisplayBody` 의 객체 → 빈 문자열 fallback 으로 차단되어 사용자에겐 헤더만 노출. 기존 동작이며 Phase 6-D-2 변경 없음.

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **629 passed** / 7 skipped / 2 todo (Phase 6-D-1 620 + 신규 9) |
| `npm run build` | ✅ vite 6.06s + esbuild `dist/index.js` 726.7kb (Phase 6-D-1 726.5kb 대비 +0.2kb) |

#### 신규 단위 테스트 9건 (formatReply Phase 6-D-2 그룹)
1. `finance_dart_disclosures` 패턴 — `data.disclosures` 배열 + `kind=list` + `text=""` → response 한 줄만
2. 미마이그레이션 vs 마이그레이션 byte-for-byte 동일
3. `kind=list` + 비어있지 않은 text — `response\n\ntext` 패턴 (향후 본문 추출 시 동작 검증)
4. `meta` 의 `apiKey`/`secret`/`internalToken` 사용자 응답 미노출
5. 빈 배열(`disclosures: []`) → `[]` 미노출
6. **회귀 검증 4건** — google `kind=list` / trading `kind=report` / deals `kind=text` / realestate `kind=report` 모두 정상 동작 유지

#### 통합 테스트 회귀 검증
- `dartAPI.test.ts` — DART API 단위 테스트, `routeIntentMessage` 미사용이라 회귀 무관
- `dealRouting.test.ts` 전체 (raw object 차단 + 딜 라우팅) — 통과
- `dealNameParsing.test.ts` — 통과
- 기존 620건 중 회귀 0건

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage`/`formatIntentRouteMessage` 시그니처 동결
- `dartDisclosures` 응답 문자열 byte-for-byte 동일 (인코딩 깨진 헤더 보존)
- `formatReply.ts` 무수정 — 다른 도메인(google/trading/deals/realestate) 회귀 영향 0
- `data.disclosures` raw 배열의 사용자 노출 차단 동작 그대로 유지
- 미마이그레이션 도메인(intelligence/wiki/agents/chat/knowledge/notebooklm/approval) 변경 없음

### 남은 리스크
1. **finance 응답 헤더 인코딩 깨짐 보존** — `DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.`. byte-for-byte 보존 원칙으로 손대지 않음. realestate `feasibility` 와 동일 이슈 — 일괄 인코딩 정상화 별도 작업 권장
2. **본문 미노출 (사용자 정보 부족)** — `data.disclosures` 가 사용자에게 보이지 않아 헤더 한 줄만 노출. 기존 동작 그대로지만 정보 부족. 향후 별도 포맷팅 함수(`formatDartDisclosures`) 추가 + `handlerResponse.text` 채우기로 풀 마이그레이션 가능
3. **`text=""` 마커만으로는 사용자 가치 즉시 추가 없음** — Phase 6-D-2 의 핵심 가치는 **타입 일관성 + 향후 본문 추출 발판**. 사용자 응답 변화 없음
4. **`unknown`/`error` 액션 없음** — finance 도메인은 단일 핸들러 + 성공 경로뿐. error kind 검토 대상 아님
5. **누적 잔여**: `prompts/` prod 번들 미동봉, `inferKind()` 미사용, `analysisHandler` 본문 중복 버그, `feasibility`/`finance` 헤더 인코딩 깨짐, finance 본문 포맷팅 부재

### Phase 6-D-3 제안

**다음 단계는 intelligence.ts 또는 wiki.ts 중 하나만 선택 권장.**

#### 옵션 A: intelligence.ts (추천)
- 대상: `intelligence_morning_briefing` 1개 핸들러 추정
- 모닝 브리핑 → kind: "report" 자연스러운 매핑
- 시장/DART/위키/RiskGuard 통합 본문 → 분리형 vs 통합형 결정 필요
- briefing 본문이 풍부해 사용자 가치 즉시 검증 가능 (text 미러 또는 text="")

#### 옵션 B: wiki.ts (작업량 큼)
- 대상: `wiki_save` / `wiki_search` / `wiki_auto_classify` 3개 추정
- save → kind: "text", search → kind: "list", auto_classify → kind: "text"
- 작업 단위가 finance 보다 크지만 list/text 혼합 검증 가치 있음

#### 옵션 C: chat.ts / agents.ts / approval.ts / knowledgePipeline.ts / notebooklm.ts
- 각 도메인 1개씩 별도 Phase(6-D-4, 6-D-5, ...)로 분리 권장
- 각 도메인 응답 구조에 따라 list/text/report 매핑

#### 권장: Phase 6-D-3 = intelligence.ts
- 핸들러 1~2개로 작업량 finance 보다 약간 큼
- 모닝 브리핑이 이미 풍부한 본문을 만들고 있어 풀 마이그레이션 시 사용자 가치 즉시 발생
- 분리형 vs 통합형 결정이 학습 가치 있음 (긴 본문 처리 패턴)

#### Phase 6-D 후반부 (6-D-X 이후)
- 잔여 도메인(wiki/chat/agents/approval/knowledgePipeline/notebooklm) 1개씩 별도 Phase
- kind="error" 분기 활성화 — deals.ts `unknown`, 각 도메인 에러 응답 재분류
- kind="confirmation" 정리 (선택)
- 누적 잔여 작업 처리 (인코딩 정상화, 본문 포맷팅, esbuild plugin 등)

제약 (Phase 6 동일):
- `routeIntentMessage`/`formatIntentRouteMessage` public API 시그니처 동결
- 도메인 1개씩 마이그레이션
- 마이그레이션된 핸들러도 응답 문자열 byte-for-byte 유지
- planIntent 멀티스텝 분해 구현 금지
- fallbackIntent.ts 수정 금지
- kind="error" 분기 활성화 금지 (Phase 6-D 후반부 별도 작업)
- 자동 commit/push 금지

---

## Phase 6-D-3 구현 로그

### 변경일
2026-05-09

### 변경 파일 목록

**수정 (2개) + 문서 (1개)**
- `server/intent/handlers/intelligence.ts` — 3개 핸들러(`morningBriefing` / `notebookLmQuery` / `monitoringStatus`)에 `handlerResponse` 추가. notebookLmQuery 와 monitoringStatus 는 분기별로 다른 kind 적용. `formatReply.ts` 무수정
- `server/__tests__/formatReply.test.ts` — Phase 6-D-3 intelligence 회귀 단위 테스트 9건 추가
- `docs/refactor/intent-service-refactor-plan.md` — 본 로그

### intelligence.ts 액션 목록 + kind 매핑

총 3개 액션 + 5개 응답 분기 식별 — 모두 마이그레이션 완료. `formatReply.ts` 무수정.

| 액션 | 분기 | response 본문 위치 | data 형태 | kind | text 전략 | meta 키 |
|------|------|-------------------|----------|------|-----------|--------|
| `intelligence_morning_briefing` | 정상 | response 헤더만 | `{ briefing, archivePath }` | `report` | `briefing` 미러 | `action`, `trigger`, `delivered`, `hasArchivePath`, `briefingLength` |
| `notebooklm_query` | 정상 | response (answer + sources 통합) | `{ question, answer, sources }` | `report` | `""` | `action`, `hasQuestion`, `sourcesCount`, `answerLength` |
| `notebooklm_query` | 질문 누락 | response 한 줄 안내 | (data 없음) | `text` | `""` | `action`, `hasQuestion: false` |
| `monitoring_status` | 정상 | response 다중 라인 | `{ uptimeSeconds, ..., apiUsage }` | `report` | `""` | `action`, `status: "ok"`, `sessionCount`, `totalCalls`, `successRate`, `lastEngine` |
| `monitoring_status` | 에러 | response 한 줄 | (data 없음) | `text` | `""` | `action`, `status: "error"`, `errorType` |

#### 분리형 vs 통합형 결정 근거
- **분리형(`text=briefing` 미러)**: `morning_briefing` — `data.briefing` 에 본문이 분리되어 있고, formatReply 의 legacy 경로가 `data.briefing` 을 본문으로 채택. handlerResponse.text 도 동일 변수에서 파생되어 신/구 동일 출력
- **통합형(`text=""`)**: `notebooklm_query` 정상 / `monitoring_status` 정상·에러 — response 안에 본문이 통째 들어 있어 `text=""` 로 본문 중복 방지. data 의 raw 객체는 `safeDisplayBody` 가 빈 문자열로 처리
- **짧은 안내(`kind=text`)**: notebooklm 질문 누락, monitoring 에러 — 단순 한 줄 응답이라 `report` 보다 `text` 가 의미적으로 자연스러움

#### kind="error" 사용 안 함 (제약 준수)
- monitoring 에러 분기는 `kind: "error"` 가 의미적으로 맞지만 Phase 6-D-3 제약상 **error 분기 활성화 금지**
- 대안으로 `kind: "text"` + `meta.status: "error"` + `meta.errorType` 사용. Phase 6-D 후반부 error 분기 활성화 시 일괄 재분류

### 기존 response/data.* 필드 유지 여부

**모두 유지.** 5개 분기 전부 다음 보존:
- `response` 필드 — 한 글자도 변경 없음
- `data` 필드 — 기존 키(`briefing`/`archivePath`/`question`/`answer`/`sources`/`uptimeSeconds`/`memoryRssMb`/`heapUsedMb`/`sessionCount`/`apiUsage`) 모두 그대로
- `handlerResponse` — 신규 추가만 (옵션 필드)

formatReply 흐름:
- 분리형(`morning_briefing`): handlerText=briefing → primaryBody=briefing → 출력 = response\n\nbriefing (legacy 와 동일)
- 통합형(`notebooklm_query` 정상, `monitoring_status` 정상): handlerText="" → legacy fallback → 출력 = response 한 줄 (data 객체는 `safeDisplayBody` 가 빈 문자열로)
- 짧은 안내(`notebooklm_query` 질문 누락, `monitoring_status` 에러): handlerText="" + data 없음 → 출력 = response 한 줄

`briefing.test.ts:481-491` 의 `routeIntentMessage` 회귀 테스트는 `routed.data` 를 `toMatchObject` 로 검증하여 신규 `handlerResponse` 필드 추가 영향 없음.

### raw object 방어 검증 결과

intelligence 도메인은 raw object 위험 영역이 다수:
- `morning_briefing` `data.archivePath` — 파일 시스템 경로
- `notebooklm_query` `data.{question, answer, sources}` — NotebookLM API 응답
- `monitoring_status` `data.apiUsage` — LLM API 통계 객체 (totalTokens 등)

마이그레이션 후에도 차단 동작 유지를 단위 테스트 4건으로 검증:

1. `morning_briefing` `meta` 의 `archivePath`/`briefingLength`/`internalToken` → 사용자 응답 미노출
2. `notebooklm_query` `data.{question,answer,sources}` 중 question/answer 키 명·sources 배열 객체화 → 미노출 (`"question"`/`"answer"`/`[object Object]` 모두 차단)
3. `monitoring_status` `data.apiUsage` 의 `totalCalls`/`successfulCalls`/`apiUsage` 키명 → 미노출
4. `monitoring_status` `data.apiUsage.secret`/`apiKey` → 미마이그레이션 vs 마이그레이션 byte-for-byte 동일 + 모두 미노출
5. `intelligence` 종합 — `meta.apiKey`/`internalToken`/`secret` 모두 사용자 응답 미노출

기존 `dealRouting.test.ts:91-105` raw object 차단 회귀 100% 통과.

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **638 passed** / 7 skipped / 2 todo (Phase 6-D-2 629 + 신규 9) |
| `npm run build` | ✅ vite 5.07s + esbuild `dist/index.js` 728.0kb (Phase 6-D-2 726.7kb 대비 +1.3kb) |

#### 신규 단위 테스트 9건 (formatReply Phase 6-D-3 그룹)
1. `intelligence_morning_briefing` 분리형 — kind=report + text=briefing 가 legacy `data.briefing` 와 byte-for-byte 동일
2. `intelligence_morning_briefing` meta — `archivePath`/`briefingLength`/`internalToken` 사용자 응답 미노출
3. `notebooklm_query` 정상(통합형) — kind=report + text="" + answer/sources 통합, 객체 raw 미노출
4. `notebooklm_query` 질문 누락 — kind=text + 짧은 안내, 본문 중복 없음
5. `monitoring_status` 정상(통합형) — kind=report + 다중 라인, `apiUsage` 객체 raw 미노출
6. `monitoring_status` 에러 분기 — kind=text + 한 줄 에러 메시지
7. `monitoring_status` `data.apiUsage` 안의 `secret`/`apiKey` 차단 (legacy vs 마이그레이션 동일)
8. intelligence kind=report + meta 의 `apiKey`/`internalToken` 사용자 응답 미노출
9. **5개 도메인 종합 회귀 검증** — google `kind=list` / trading `kind=report` / deals `kind=text` / realestate `kind=report` / finance `kind=list` 모두 정상 동작 유지

#### 통합 테스트 회귀 검증
- `briefing.test.ts:481-491` `routeIntentMessage("브리핑")` → `intelligence_morning_briefing` 라우팅 + `routed.response`/`routed.data.archivePath` 검증 통과 (toMatchObject 라 신규 필드 영향 없음)
- `briefingSources.test.ts` — `routeIntentMessage` 미사용, 회귀 무관
- `dealRouting.test.ts` raw object 차단 — 통과
- 기존 629건 중 회귀 0건

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage`/`formatIntentRouteMessage` 시그니처 동결
- 3개 핸들러 5개 분기 응답 문자열 byte-for-byte 동일
- `formatReply.ts` 무수정 — 다른 도메인(google/trading/deals/realestate/finance) 회귀 영향 0
- `data.apiUsage`/`data.briefing`/`data.{question,answer,sources}` raw 객체 차단 동작 그대로
- `briefing.test.ts` `routeIntentMessage` 회귀 테스트 통과
- 미마이그레이션 도메인(wiki/agents/chat/knowledge/notebooklm/approval) 변경 없음

### 남은 리스크
1. **monitoring 에러 분기 임시 `kind="text"`** — 의미적으로 `kind="error"` 가 맞으나 제약상 활성화 금지. Phase 6-D 후반부 error 분기 활성화 시 `meta.status: "error"` + `meta.errorType` 기반으로 재분류 예정
2. **`monitoring_status` `data.apiUsage` 가 raw 객체** — 사용자 응답에는 노출되지 않으나 console.warn 로그에 객체 일부가 stringifyPreview 로 찍힘. 운영상 문제 없으나 향후 `apiUsage` 명시적 토큰/시크릿 제거 검토 (현재 totalTokens 등 통계만 있어 위험 낮음)
3. **`notebookLmQuery` 정상 응답에서 `data.sources` URL 사용자 노출은 의도된 동작** — sources 배열은 `response` 안에 이미 `📎 출처\n1. URL` 형식으로 포함됨. 사용자 가치 있는 정보라 차단 대상 아님
4. **`unknown` 액션 없음** — intelligence 도메인은 모든 분기가 명시적이라 unknown 폴백 불필요
5. **누적 잔여**: `prompts/` prod 번들 미동봉, `inferKind()` 미사용, `analysisHandler` 본문 중복 버그, `feasibility`/`finance` 헤더 인코딩 깨짐, finance 본문 포맷팅 부재, monitoring 에러 → error 분기 재분류 대기

### Phase 6-D-4 제안

**다음 단계는 wiki.ts 또는 chat.ts 중 하나만 선택 권장.**

#### 옵션 A: wiki.ts (추천)
- 대상: `wiki_save` / `wiki_search` / `wiki_auto_classify` 3개 추정
- save → kind: "text" / search → kind: "list" / auto_classify → kind: "text" 혼합
- list 와 text 분기 동시 검증 가치 (Phase 6-A google list 와 다른 도메인의 list 패턴)
- Aston Wiki 가 Knowledge Core 본진이라 마이그레이션 가치 높음

#### 옵션 B: chat.ts (작업량 작음)
- 대상: `chat_telegram_recent` 1개 추정
- 텔레그램 최근 메시지 조회 → kind: "list" 후보
- 작업 단위 작아 빠른 마이그레이션

#### 옵션 C: agents.ts / approval.ts / knowledgePipeline.ts / notebooklm.ts
- 각 도메인 1개씩 별도 Phase 분리 권장

#### 권장: Phase 6-D-4 = wiki.ts
- 핸들러 3개로 작업량 중간
- list/text 혼합 매핑 — 다양한 패턴 검증
- Knowledge Core 본진 도메인이라 마이그레이션 우선순위 높음
- 위키 데이터에 사용자 입력 텍스트가 많아 raw 노출 위험 검증 가치 있음

#### Phase 6-D 후반부 (6-D-X 이후)
- 잔여 도메인(chat/agents/approval/knowledgePipeline/notebooklm) 1개씩 별도 Phase
- kind="error" 분기 활성화 — deals.ts `unknown`, monitoring 에러, 각 도메인 에러 응답 재분류
- kind="confirmation" 정리 (선택)
- 누적 잔여 작업 처리 (인코딩 정상화, 본문 포맷팅, esbuild plugin 등)

제약 (Phase 6 동일):
- `routeIntentMessage`/`formatIntentRouteMessage` public API 시그니처 동결
- 도메인 1개씩 마이그레이션
- 마이그레이션된 핸들러도 응답 문자열 byte-for-byte 유지
- planIntent 멀티스텝 분해 구현 금지
- fallbackIntent.ts 수정 금지
- kind="error" 분기 활성화 금지 (Phase 6-D 후반부 별도 작업)
- 자동 commit/push 금지

---

## Phase 6-D-4 구현 로그

### 변경일
2026-05-09

### 변경 파일 목록

**수정 (2개) + 문서 (1개)**
- `server/intent/handlers/wiki.ts` — 3개 핸들러(`wikiAutoClassify` / `wikiSave` / `wikiSearch`)에 `handlerResponse` 추가. wikiAutoClassify는 분기별로 다른 메타. `formatReply.ts` 무수정
- `server/__tests__/formatReply.test.ts` — Phase 6-D-4 wiki 회귀 단위 테스트 9건 추가
- `docs/refactor/intent-service-refactor-plan.md` — 본 로그

### wiki.ts 액션 목록 + kind 매핑

총 3개 액션 + 5개 응답 분기 식별 — 모두 마이그레이션 완료. `formatReply.ts` 무수정.

| 액션 | 분기 | response 본문 위치 | data 형태 | kind | text 전략 | meta 키 |
|------|------|-------------------|----------|------|-----------|--------|
| `wiki_auto_classify` | 빈 내용 | response 한 줄 | (없음) | `text` | `""` | `action`, `hasContent: false` |
| `wiki_auto_classify` | 정상 | response 다중 라인 (카테고리/태그/요약 통합) | (없음) | `text` | `""` | `action`, `hasContent: true`, `category`, `tagsCount`, `summaryLength`, `contentLength`, `source` |
| `wiki_auto_classify` | 에러 | response 한 줄 | (없음) | `text` | `""` | `action`, `status: "error"`, `errorType` |
| `wiki_save` | (단일 분기) | response (executeWikiSave 결과) | (없음) | `text` | `""` | `action`, `source: "telegram"` |
| `wiki_search` | (단일 분기) | response (executeWikiSearch 결과, list 형식) | (없음) | `list` | `""` | `action` |

#### 모두 통합형(`text=""`) 전략 채택 근거
- `wikiSave`/`wikiSearch`가 `executeWikiSave`/`executeWikiSearch`를 호출해 string 한 개를 받아 `response`에 통째로 넣음. data 필드 없음
- `wikiAutoClassify`도 `response`에 모든 사용자용 정보 통합. data 필드 없음
- 본문이 따로 분리되어 있지 않아 `text=""` 마커만 추가 — 출력은 byte-for-byte 변동 없음
- `wiki_search`는 의미적으로 list라 `kind: "list"` 매핑. 향후 검색 결과 구조화 시 `handlerResponse.text`/`items`에 본문 분리하는 풀 마이그레이션 가능 (단위 테스트로 동작 검증 완료)

#### kind="error" 사용 안 함 (제약 준수)
- `wiki_auto_classify` 에러 분기는 의미상 `kind: "error"`가 맞으나 Phase 6-D-4 제약상 **error 분기 활성화 금지**
- `kind: "text"` + `meta.status: "error"` + `meta.errorType` 사용. Phase 6-D 후반부 error 분기 활성화 시 일괄 재분류 (`monitoring_status` 에러와 동일 패턴)

#### 사용자 입력 노출 방어
- `wikiAutoClassify` `intent.params.content`(사용자 입력 원문)는 meta에 절대 미포함 — `contentLength`(숫자)만 기록
- `wikiSave`/`wikiSearch` `intent.params.raw`(사용자 입력 원문)도 meta 미포함 — `action` 마커와 `source`만
- LLM이 생성한 `summary`도 meta에 길이만(`summaryLength`) 기록, 본문 미포함

### 기존 response/data.* 필드 유지 여부

**모두 유지.** 5개 분기 전부 다음 보존:
- `response` 필드 — 한 글자도 변경 없음
- `data` 필드 — 원래 모든 분기에서 미사용(undefined). 변경 없음
- `handlerResponse` — 신규 추가만 (옵션 필드)

formatReply 흐름:
- 모든 분기: `handlerText=""` → `primaryBody=""` (legacy 키 모두 미존재) → `fallbackBody=""` (data undefined) → 출력 = response 그대로

마이그레이션 전후 byte-for-byte 동일 (단위 테스트 5건으로 검증).

### raw object 방어 검증 결과

wiki 도메인은 사용자 입력 원문이 핸들러 안에서 흘러다니는 영역(`content`/`raw`/`title`):
- LLM이 생성한 `summary`/`tags`/`category`는 `response`에 직접 작성됨 (사용자 가치)
- 사용자 입력 원문(`content`)은 `body`로 wikiStore에 저장만 하고 응답에는 노출 안 함
- 검색 결과 안의 frontmatter/path/uuid는 `executeWikiSearch` 내부에서 차단

마이그레이션 후에도 차단 동작 유지를 단위 테스트 1건으로 검증:
- `meta`에 `rawContent`(회장님 비밀 메모 원문), `apiKey`(GEMINI-LEAK), `internalToken`, `secret`, `uuid`, `path` 등 노출 위험 키 다수 → **사용자 응답에 단 하나도 노출되지 않음** (formatReply가 meta 미참조)
- `[object Object]`/JSON/`{` 출력 절대 금지 — 모든 분기 검증

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **647 passed** / 7 skipped / 2 todo (Phase 6-D-3 638 + 신규 9) |
| `npm run build` | ✅ vite 4.63s + esbuild `dist/index.js` 729.1kb (Phase 6-D-3 728.0kb 대비 +1.1kb) |

#### 신규 단위 테스트 9건 (formatReply Phase 6-D-4 그룹)
1. `wiki_save` 패턴 — kind=text + 다중 라인 통합형, byte-for-byte 동일
2. `wiki_search` 패턴 — kind=list + 검색 결과 list 그대로 출력
3. `wiki_search` 빈 검색 결과 — byte-for-byte 동일
4. `wiki_auto_classify` 정상 분기 — kind=text + 다중 라인 통합형, 본문 중복 없음
5. `wiki_auto_classify` 빈 내용 분기 — kind=text + 짧은 안내
6. `wiki_auto_classify` 에러 분기 — kind=text (error 활성화 금지) + meta.status="error"
7. `wiki kind=list + 비어있지 않은 text` (향후 검색 분리형 대비) — `header\n\nlistBody` 출력
8. `wiki meta`의 `rawContent`/`apiKey`/`internalToken`/`secret`/`uuid`/`path` 사용자 응답 미노출
9. **6개 도메인 종합 회귀 검증** — google `kind=list` / trading `kind=report` / deals `kind=text` / realestate `kind=report` / finance `kind=list` / intelligence `kind=report` 모두 정상 동작 유지

#### 통합 테스트 회귀 검증
- `wiki.test.ts` — `matchWikiSave`/`matchWikiSearch`/`fallbackIntent` 매칭 로직 검증, 핸들러 응답 미검증, 회귀 무관 통과
- `wikiAutoClassify.test.ts` — `fallbackIntent` 액션 분류 검증, 회귀 무관 통과
- `briefing.test.ts` `routeIntentMessage` 통합 케이스 — wiki 미관여, 통과
- `dealRouting.test.ts` raw object 차단 — 통과
- 기존 638건 중 회귀 0건

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage`/`formatIntentRouteMessage` 시그니처 동결
- 3개 핸들러 5개 분기 응답 문자열 byte-for-byte 동일
- `formatReply.ts` 무수정 — 다른 도메인(google/trading/deals/realestate/finance/intelligence) 회귀 영향 0
- `data` 필드 원래 미사용이라 raw object 노출 위험 부재 (구조적으로 안전한 도메인)
- 사용자 입력 원문(`content`/`raw`)은 meta에서 명시적으로 제외되어 노출 위험 차단
- 미마이그레이션 도메인(chat/agents/approval/knowledge/notebooklm) 변경 없음

### 남은 리스크
1. **`wiki_auto_classify` 에러 분기 임시 `kind="text"`** — 의미적으로 `kind="error"`가 맞으나 제약상 활성화 금지. Phase 6-D 후반부 error 분기 활성화 시 `meta.status: "error"` 기반 재분류 (`monitoring_status` 에러와 동일 패턴)
2. **`wiki_search` 결과가 list임에도 `text=""`** — `kind="list"` 의미적 매핑은 했으나 본문은 `response`에 통합. 향후 `executeWikiSearch`가 구조화된 결과 반환 시 `handlerResponse.text`/`items` 채우면 풀 마이그레이션 가능 (단위 테스트로 동작 검증 완료)
3. **`executeWikiSave`/`executeWikiSearch` 내부 응답 형식 의존** — 핸들러는 string만 받음. 내부 포맷 변경 시 핸들러 마이그레이션도 같이 검토 필요 (특히 검색 결과 list 형식)
4. **`wiki_auto_classify` `meta.category`는 LLM 출력값** — 영문 enum으로 제한되지만 LLM이 임의 값 반환 가능성. 현재 코드는 meta 미참조라 노출 위험 없음
5. **누적 잔여**: `prompts/` prod 번들 미동봉, `inferKind()` 미사용, `analysisHandler` 본문 중복 버그, `feasibility`/`finance` 헤더 인코딩 깨짐, finance 본문 포맷팅 부재, monitoring/wiki_auto_classify 에러 → error 분기 재분류 대기

### Phase 6-D-5 제안

**다음 단계는 chat.ts 또는 agents.ts 중 하나만 선택 권장.**

#### 옵션 A: chat.ts (추천 — 작업량 작음)
- 대상: `chat_telegram_recent` 1개 핸들러 추정
- 텔레그램 최근 메시지 조회 → kind: "list" 후보
- 작업 단위 작아 빠른 마이그레이션
- 텔레그램 raw 메시지 객체(`from`/`chat`/`text`/`date`) 노출 위험 검증 가치 있음

#### 옵션 B: agents.ts (작업량 중간)
- 대상: `agent_command` 1개 추정 (단일 dispatcher 패턴 가능성)
- OpenClaw 에이전트 커맨드 → kind: "text" 또는 "report"
- 에이전트 결과 객체 raw 노출 위험 검증 가치 있음
- deals.ts 패턴(parseDealCommand 재호출)과 유사 가능성

#### 옵션 C: approval.ts / knowledgePipeline.ts / notebooklm.ts
- 각 도메인 1개씩 별도 Phase 분리 권장

#### 권장: Phase 6-D-5 = chat.ts
- 핸들러 1개로 작업량 finance와 비슷
- list 분기 추가 검증 — google/finance/wiki 이후 네 번째 list 도메인
- 텔레그램 메시지 raw 객체가 사용자 노출되지 않는지 검증 가치 있음

#### Phase 6-D 후반부 (6-D-6 이후)
- 잔여 도메인(agents/approval/knowledgePipeline/notebooklm) 1개씩 별도 Phase
- `kind="error"` 분기 활성화 — deals.ts `unknown`, monitoring/wiki_auto_classify 에러, 각 도메인 에러 응답 재분류
- `kind="confirmation"` 정리 (선택)
- 누적 잔여 작업 처리 (인코딩 정상화, 본문 포맷팅, esbuild plugin 등)

제약 (Phase 6 동일):
- `routeIntentMessage`/`formatIntentRouteMessage` public API 시그니처 동결
- 도메인 1개씩 마이그레이션
- 마이그레이션된 핸들러도 응답 문자열 byte-for-byte 유지
- planIntent 멀티스텝 분해 구현 금지
- fallbackIntent.ts 수정 금지
- kind="error" 분기 활성화 금지 (Phase 6-D 후반부 별도 작업)
- 자동 commit/push 금지

---

## Phase 6-D-5 구현 로그

### 변경일
2026-05-09

### 변경 파일 목록

**수정 (2개) + 문서 (1개)**
- `server/intent/handlers/chat.ts` — 단일 핸들러 `recentTelegram`(`chat_telegram_recent`)에 `handlerResponse` 추가. 4개 분기 모두 마이그레이션. `formatReply.ts` 무수정
- `server/__tests__/formatReply.test.ts` — Phase 6-D-5 chat 회귀 단위 테스트 8건 추가
- `docs/refactor/intent-service-refactor-plan.md` — 본 로그

### chat.ts 액션 목록 + kind 매핑

총 1개 액션 + 4개 응답 분기 식별 — 모두 마이그레이션 완료. `formatReply.ts` 무수정.

| 액션 | 분기 | response 본문 위치 | data 형태 | kind | text 전략 | meta 키 |
|------|------|-------------------|----------|------|-----------|--------|
| `chat_telegram_recent` | userId 미식별 | response 한 줄 안내 | (없음) | `text` | `""` | `action`, `status: "no_user_id"`, `userIdValid: false` |
| `chat_telegram_recent` | 빈 메시지 | response 한 줄 | `{ messages: [] }` | `list` | `""` | `action`, `status: "ok"`, `messageCount: 0`, `isEmpty: true`, `limit` |
| `chat_telegram_recent` | 정상 (메시지 있음) | response 헤더 + lines 통합 | `{ conversationId, messages: [{id,role,content,createdAt}] }` | `list` | `""` | `action`, `status: "ok"`, `messageCount`, `isEmpty: false`, `limit`, `source: "telegram"` |
| `chat_telegram_recent` | 에러 | response 한 줄 | (없음) | `text` | `""` | `action`, `status: "error"`, `errorType` |

#### 분기별 매핑 결정 근거
- **list 분기 2개** (정상 / 빈 메시지): 의미적으로 텔레그램 메시지 list 조회. 빈 결과도 의미상 list 도메인 ("빈 list")
- **text 분기 2개** (userId 미식별 / 에러): 짧은 안내·에러 메시지. list 분기로 마킹할 의미 없음
- 정상 분기 본문은 `response`에 헤더 + `lines.join("\n")`으로 통합되어 있어 `text=""` 채택 (분리형 미러 시 중복 발생)

#### kind="error" 사용 안 함 (제약 준수)
- 에러 분기는 의미상 `kind: "error"`가 맞으나 Phase 6-D-5 제약상 **error 분기 활성화 금지**
- `kind: "text"` + `meta.status: "error"` + `meta.errorType` 사용 (`monitoring_status` / `wiki_auto_classify` 에러 분기와 동일 패턴). Phase 6-D 후반부 일괄 재분류

#### 사용자 입력 / 내부 식별자 노출 방어
- `data.conversationId`(내부 DB id)는 **meta에 절대 미포함**. response에도 노출 없음
- `data.messages[].id`(DB row id), `createdAt`(raw Date 객체) 모두 meta 미포함
- `intent.params.limit`(사용자 입력)은 meta에 포함 (숫자 1개라 노출 위험 없음)

### 기존 response/data.* 필드 유지 여부

**모두 유지.** 4개 분기 전부 다음 보존:
- `response` 필드 — 한 글자도 변경 없음
- `data` 필드 — 빈 메시지(`{messages: []}`), 정상(`{conversationId, messages: [...]}`), userId 미식별/에러(미설정) 모두 그대로
- `handlerResponse` — 신규 추가만 (옵션 필드)

formatReply 흐름:
- 모든 분기: `handlerText=""` → `primaryBody=""` (legacy 키 모두 미존재) → `fallbackBody=""` (data가 객체이지만 `safeDisplayBody`가 빈 문자열 처리) → 출력 = response 그대로

마이그레이션 전후 byte-for-byte 동일 (단위 테스트 2건으로 검증: 정상 / 빈 메시지).

### raw object 방어 검증 결과

chat 도메인은 텔레그램 raw 메시지 객체 노출 위험이 가장 높은 영역:
- `data.conversationId` — 내부 DB id (12345 형태)
- `data.messages[].{id, role, content, createdAt}` — DB row 객체
- 향후 핸들러가 텔레그램 원본 메시지(`from`/`chat`/`message_id`/`date`)를 그대로 data에 넣을 가능성

마이그레이션 후에도 차단 동작 유지를 단위 테스트 3건으로 검증:

1. 정상 분기 — `data.messages` 배열 안의 `id`/`role`/`content`/`createdAt` 키명·`conversationId`(12345) 모두 사용자 응답 미노출
2. 가상 텔레그램 raw 객체 — `from.{id, username, first_name}`/`chat.id`/`message_id`/`date`(unix timestamp) 모두 사용자 응답 미노출 (`safeDisplayBody`가 객체 차단)
3. `meta`에 `apiKey`/`botToken`(`1234567890:AAA-secret-bot-token` 형태)/`internalSession`/`sessionId`/`secret`/`internal.{dbId,hash}` 다수 노출 위험 키 → 사용자 응답에 단 하나도 노출되지 않음

추가 검증:
- 정상 응답의 `lines` 본문(시장 브리핑 보여줘`/`BTC 65000 상승` 등 사용자 메시지 미리보기)은 `response`에 통합되어 정상 노출됨 (사용자 가치)
- 단, raw 객체 키명(`"id":`/`"createdAt":`) 자체는 노출 안 됨

기존 `dealRouting.test.ts:91-105` raw object 차단 회귀 100% 통과.

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **655 passed** / 7 skipped / 2 todo (Phase 6-D-4 647 + 신규 8) |
| `npm run build` | ✅ vite 4.95s + esbuild `dist/index.js` 730.0kb (Phase 6-D-4 729.1kb 대비 +0.9kb) |

#### 신규 단위 테스트 8건 (formatReply Phase 6-D-5 그룹)
1. 정상 분기 — kind=list + text="" + `data.messages` 객체 배열 raw 차단 + byte-for-byte 동일
2. 빈 메시지 분기 — kind=list + `data.messages: []`, byte-for-byte 동일
3. userId 미식별 분기 — kind=text + 짧은 안내
4. 에러 분기 — kind=text (error 활성화 금지) + meta.status="error"
5. 가상 텔레그램 raw 객체(`from`/`chat`/`message_id`/`date`) 차단
6. meta `apiKey`/`botToken`/`internalSession`/`sessionId`/`secret`/`internal.{dbId,hash}` 미노출
7. 정상 응답 lines 본문 사용자 노출 + raw 객체 키명 미노출
8. **7개 도메인 종합 회귀** — google `kind=list` / trading `kind=report` / deals `kind=text` / realestate `kind=report` / finance `kind=list` / intelligence `kind=report` / wiki `kind=text` 모두 정상 동작 유지

#### 통합 테스트 회귀 검증
- chat 관련 기존 테스트 파일 없음 → 회귀 영향 없음 (빈 영역 신규 마이그레이션)
- `dealRouting.test.ts` raw object 차단 — 통과
- `dealNameParsing.test.ts` — 통과
- `briefing.test.ts` `routeIntentMessage` — 통과
- 기존 647건 중 회귀 0건

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage`/`formatIntentRouteMessage` 시그니처 동결
- 1개 핸들러 4개 분기 응답 문자열 byte-for-byte 동일
- `formatReply.ts` 무수정 — 다른 도메인(google/trading/deals/realestate/finance/intelligence/wiki) 회귀 영향 0
- `data.conversationId`/`data.messages` raw 객체 차단 동작 그대로 유지
- 사용자 입력 텍스트(메시지 본문)는 `response`의 `previewContent`로 80자 제한된 형태로 정상 노출 (기존 동작)
- 미마이그레이션 도메인(agents/approval/knowledge/notebooklm) 변경 없음

### 남은 리스크
1. **`chat_telegram_recent` 에러 분기 임시 `kind="text"`** — 의미상 `kind="error"`가 맞으나 제약상 활성화 금지. Phase 6-D 후반부 error 분기 활성화 시 `meta.status: "error"` 기반 일괄 재분류 (`monitoring_status` / `wiki_auto_classify` 에러와 동일 패턴)
2. **`data.conversationId`/`data.messages[].id`/`createdAt` raw 객체** — `safeDisplayBody`의 일반 객체 fallback에 의존해 차단됨. `containsRawObjectShape`(method/files 키 검사)에는 미해당이라 한국어 안내 메시지가 뜨지 않음. 사용자에겐 response 한 줄만 노출 (기존 동작 그대로). 향후 한국어 안내까지 노출하려면 `containsRawObjectShape` 확장 필요
3. **`data.messages[].content` 미리보기는 `previewContent(content, 80)`로 80자 제한** — 사용자 메시지 본문이 길면 `…`으로 잘림. 기존 동작이며 raw 노출 위험 없음
4. **`data.conversationId` 노출 가능성 (이론적)** — 현재 코드는 사용자 응답에 직접 노출하지 않으나 향후 `formatReply` 변경 시 객체 dump가 발생하면 위험. 보수적으로 `meta`에는 미포함
5. **누적 잔여**: `prompts/` prod 번들 미동봉, `inferKind()` 미사용, `analysisHandler` 본문 중복 버그, `feasibility`/`finance` 헤더 인코딩 깨짐, finance 본문 포맷팅 부재, monitoring/wiki_auto_classify/chat 에러 → error 분기 재분류 대기

### Phase 6-D-6 제안

**다음 단계는 agents.ts 또는 approval.ts 중 하나만 선택 권장.**

#### 옵션 A: agents.ts (추천)
- 대상: `agent_command` 1개 추정 (deals.ts 와 유사한 단일 dispatcher 패턴 가능성)
- OpenClaw 에이전트 커맨드 → kind: "text" 또는 "report"
- 에이전트 결과 객체 raw 노출 위험 검증 가치 있음 (OpenClaw 응답 형식)
- deals.ts 의 `parseDealCommand` 재호출 패턴 적용 가능성

#### 옵션 B: approval.ts (작업량 작음)
- 대상: 승인 큐 관련 핸들러 (`trading_approval_list` 등 추정)
- 승인 대기 항목 → kind: "list" 후보
- 빠른 마이그레이션 가능

#### 옵션 C: knowledgePipeline.ts / notebooklm.ts
- 각 도메인 1개씩 별도 Phase 분리 권장

#### 권장: Phase 6-D-6 = agents.ts
- 핸들러 1개~소수로 작업량 중간
- text/report 혼합 가능성 검증
- OpenClaw 에이전트 결과 raw 객체(execution result, agent state) 노출 검증 가치 있음
- chat.ts 와 비슷한 dispatcher 패턴(파싱 후 실행)일 가능성

#### Phase 6-D 후반부 (6-D-7 이후)
- 잔여 도메인(approval/knowledgePipeline/notebooklm) 1개씩 별도 Phase
- `kind="error"` 분기 활성화 — deals.ts `unknown`, monitoring/wiki_auto_classify/chat 에러, 각 도메인 에러 응답 재분류 (현재까지 4개 도메인 5개 에러 분기 누적)
- `kind="confirmation"` 정리 (선택)
- 누적 잔여 작업 처리 (인코딩 정상화, 본문 포맷팅, esbuild plugin 등)

제약 (Phase 6 동일):
- `routeIntentMessage`/`formatIntentRouteMessage` public API 시그니처 동결
- 도메인 1개씩 마이그레이션
- 마이그레이션된 핸들러도 응답 문자열 byte-for-byte 유지
- planIntent 멀티스텝 분해 구현 금지
- fallbackIntent.ts 수정 금지
- kind="error" 분기 활성화 금지 (Phase 6-D 후반부 별도 작업)
- 자동 commit/push 금지

---

## Phase 6-D-6 구현 로그

### 변경일
2026-05-09

### 변경 파일 목록

**수정 (2개) + 문서 (1개)**
- `server/intent/handlers/agents.ts` — 단일 핸들러 `handleAgentCommand`(`agent_command`) dispatcher의 7개 sub-command 분기 + 세부 분기에 `handlerResponse` 추가. `formatReply.ts` 무수정
- `server/__tests__/formatReply.test.ts` — Phase 6-D-6 agents 회귀 단위 테스트 10건 추가
- `docs/refactor/intent-service-refactor-plan.md` — 본 로그

### agents.ts 액션 + sub-command 매핑

총 1개 액션(`agent_command`) + 7개 sub-command 분기 + 세부 분기 식별 — 모두 마이그레이션 완료. `formatReply.ts` 무수정.

| sub-command | 분기 | response 본문 위치 | data 형태 | kind | text 전략 | meta 핵심 키 |
|-------------|------|-------------------|----------|------|-----------|-------------|
| `목록` (또는 빈 입력) | 단일 | response 통합형 (헤더 + 템플릿 list) | 없음 | `list` | `""` | `subCommand: "list"` |
| `상태` | 단일 | response 통합형 (헤더 + 진행 중/최근) | 없음 | `list` | `""` | `subCommand: "status"` |
| `결과 <id>` | found | response (단일 작업 결과) | 없음 | `text` | `""` | `subCommand: "result"`, `taskId`, `status: "found"` |
| `결과 <id>` | not_found | response 한 줄 안내 | 없음 | `text` | `""` | `subCommand: "result"`, `taskId`, `status: "not_found"` |
| `취소 <id>` | cancelled | response 통합형 | 없음 | `text` | `""` | `subCommand: "cancel"`, `taskId`, `status: "cancelled"` |
| `취소 <id>` | not_found | response 한 줄 | 없음 | `text` | `""` | `subCommand: "cancel"`, `taskId`, `status: "not_found"` |
| `실행 ...` | invalid_args | response 한 줄 사용법 | 없음 | `text` | `""` | `subCommand: "execute"`, `status: "invalid_args"` |
| `실행 ...` | queued | response 통합형 (등록 + 헤더 + 결과 안내) | 없음 | `text` | `""` | `subCommand: "execute"`, `taskId`, `templateId`, `status: "queued"` |
| `실행 ...` | error | response 한 줄 에러 | 없음 | `text` | `""` | `subCommand: "execute"`, `status: "error"`, `errorType` |
| (fallthrough) | help | response 다중 라인 사용법 | 없음 | `text` | `""` | `subCommand: "help"` |

#### 매핑 결정 근거
- **list 분기 2개** (목록 / 상태): 의미적으로 list 도메인 (템플릿 리스트, 작업 리스트). `kind: "list"`
- **text 분기 8개** (결과 found/not_found, 취소 cancelled/not_found, 실행 invalid_args/queued/error, help): 단일 응답·짧은 안내·에러. `kind: "text"`
- 모든 분기 `text=""` 채택 — `data` 필드 원래 미사용이라 본문은 `response`에 통합. legacy 경로가 그대로 처리

#### kind="error" 사용 안 함 (제약 준수)
- "실행 등록 실패" / "결과 not_found" / "취소 not_found" 등은 의미상 `kind: "error"`가 맞으나 Phase 6-D-6 제약상 **error 분기 활성화 금지**
- `kind: "text"` + `meta.status: "error" | "not_found" | "invalid_args"` + `meta.errorType` 사용
- Phase 6-D 후반부 error 분기 활성화 시 `meta.status` 기반 일괄 재분류 (`monitoring_status` / `wiki_auto_classify` / `chat_telegram_recent` 에러와 동일 패턴, 누적 5개 도메인 9개 분기 대기)

#### 사용자 입력 / 내부 식별자 노출 방어
- `taskId`(사용자에게는 `🆔 task-001`로 표시되어 정상 가치)는 meta에도 포함 — 보안 위험 없음
- `templateId`(사용자가 입력한 영문 템플릿 ID, 영문 enum)도 meta에 포함 — 안전
- OpenClaw `jobId`/`sessionId`/`token` 등은 핸들러 자체에서 사용하지 않음 (data 미설정)
- 사용자 입력 `target`(예: 한남동644)은 meta에 미포함

### 기존 response/data.* 필드 유지 여부

**모두 유지.** 10개 분기 전부 다음 보존:
- `response` 필드 — 한 글자도 변경 없음
- `data` 필드 — **원래 모든 분기에서 미사용(undefined)**. 변경 없음
- `handlerResponse` — 신규 추가만 (옵션 필드)

formatReply 흐름:
- 모든 분기: `handlerText=""` → `primaryBody=""` (legacy 키 미존재) → `fallbackBody=""` (data undefined) → 출력 = response 그대로

마이그레이션 전후 byte-for-byte 동일 (단위 테스트 7건으로 검증: 목록/상태/결과 found/실행 queued + 5개 분기 직접 검증).

### raw object 방어 검증 결과

agents 도메인은 **구조적으로 raw object 노출 위험 부재** (`data` 필드 원래 미사용). 단, 향후 핸들러가 OpenClaw 응답 객체를 data에 통째 넣을 가능성 대비 단위 테스트로 차단 동작 검증:

1. `meta`에 `jobId`/`sessionId`/`apiKey`/`openclawToken`(`Bearer secret-token-xyz` 형태)/`internalState.{phase, workerId}`/`secret` 다수 노출 위험 키 → **사용자 응답에 단 하나도 노출되지 않음** (formatReply가 meta 미참조)
2. **방어 시나리오** — 가상의 `data.execution.{jobId, agent.{sessionId, token}, state.phase, result}` 객체 → `safeDisplayBody`가 객체 차단해 빈 문자열 처리, `[object Object]`/JSON 미노출
3. 모든 분기에서 `[object Object]`/`{`/JSON dump 미노출 검증

기존 `dealRouting.test.ts:91-105` raw object 차단 회귀 100% 통과.

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **665 passed** / 7 skipped / 2 todo (Phase 6-D-5 655 + 신규 10) |
| `npm run build` | ✅ vite 4.92s + esbuild `dist/index.js` 731.7kb (Phase 6-D-5 730.0kb 대비 +1.7kb) |

#### 신규 단위 테스트 10건 (formatReply Phase 6-D-6 그룹)
1. `목록` sub-command — kind=list + 헤더+템플릿 list 통합형, byte-for-byte 동일
2. `상태` sub-command — kind=list + 진행 중/최근 결과 list
3. `결과 <id>` found — kind=text + 단일 작업 결과 다중 라인
4. `결과 <id>` not_found — kind=text + 짧은 안내
5. `실행` 등록 성공 — kind=text + 헤더 + 결과 안내 통합형
6. `실행` 실패 — kind=text (error 활성화 금지) + meta.status="error"
7. help fallthrough — kind=text + 사용법 다중 라인
8. meta `jobId`/`sessionId`/`apiKey`/`openclawToken`/`internalState`/`secret` 미노출
9. 가상 `data.execution` raw 객체 방어 시나리오 차단
10. **8개 도메인 종합 회귀** — google `kind=list` / trading `kind=report` / deals `kind=text` / realestate `kind=report` / finance `kind=list` / intelligence `kind=report` / wiki `kind=text` / chat `kind=list` 모두 정상 동작 유지

#### 통합 테스트 회귀 검증
- `agentQueue.test.ts` / `agentExecutor.test.ts` / `agentTemplates.test.ts` / `agentHealth.test.ts` / `agentResultLoader.test.ts` / `openclawClient.test.ts` / `openclawRuntime.test.ts` — `routeIntentMessage` / `formatIntentRouteMessage` / `handlerResponse` 미사용, 회귀 무관 통과
- `dealRouting.test.ts` raw object 차단 — 통과
- 기존 655건 중 회귀 0건

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage`/`formatIntentRouteMessage` 시그니처 동결
- 1개 액션 10개 분기 응답 문자열 byte-for-byte 동일
- `formatReply.ts` 무수정 — 다른 도메인(google/trading/deals/realestate/finance/intelligence/wiki/chat) 회귀 영향 0
- `data` 필드 원래 미사용이라 raw object 노출 위험 구조적 부재
- 기존 agent 관련 단위 테스트 7개 파일 전부 통과
- 미마이그레이션 도메인(approval/knowledge/notebooklm) 변경 없음

### 남은 리스크
1. **agents 에러/not_found 분기 임시 `kind="text"`** — 의미상 `kind="error"`가 맞으나 제약상 활성화 금지. Phase 6-D 후반부 일괄 재분류 (현재 누적 5개 도메인 9개 분기 대기: deals.ts unknown, monitoring 에러, wiki_auto_classify 에러, chat 에러, agents.ts execute error / result not_found / cancel not_found / invalid_args)
2. **agents.ts에 `data` 필드 미설정** — 향후 OpenClaw 응답 객체를 `data`에 직접 넣을 가능성 대비 단위 테스트로 방어 시나리오 검증 완료. 실제 추가 시점에 `safeDisplayBody`가 자동 차단
3. **`상태` sub-command 응답에 OpenClaw 헤더(URL, modelHint) 포함** — 사용자 가치 있는 정보. raw 노출 아님. 단 헤더 안의 모델 힌트가 내부 정보일 수 있어 향후 `getAgentHealthSnapshot()` 출력 점검 필요
4. **`실행 등록 성공` 분기에서 `header()` 두 번 호출** — sub-command가 헤더를 출력하기 위해 `header()`를 호출하고, 메타에는 따로 사용 안 함. 비용 무시 가능
5. **누적 잔여**: `prompts/` prod 번들 미동봉, `inferKind()` 미사용, `analysisHandler` 본문 중복 버그, `feasibility`/`finance` 헤더 인코딩 깨짐, finance 본문 포맷팅 부재, monitoring/wiki_auto_classify/chat/agents 에러·not_found → error 분기 재분류 대기

### Phase 6-D-7 제안

**다음 단계는 approval.ts 또는 knowledgePipeline.ts / notebooklm.ts 중 하나만 선택 권장.**

#### 옵션 A: approval.ts (추천 — 작업량 작음)
- 대상: 승인 큐 관련 핸들러 (`trading_approval_list` 등 추정)
- 승인 대기 항목 → kind: "list" 후보
- 승인 게이트와 연관된 도메인이라 `kind="confirmation"` 검토 가치 있음 (단 Phase 6-D-7 활성화 금지)
- 빠른 마이그레이션 가능

#### 옵션 B: knowledgePipeline.ts (작업량 중간)
- 대상: `tg_pipeline_capture` 등 (`/tg ...` 명령 처리) 추정
- 텔레그램 → Wiki 파이프라인 → kind: "text" 또는 "list"
- chat/wiki와 연관된 도메인

#### 옵션 C: notebooklm.ts (작업량 중간)
- 대상: `nb_command` / `nb_save` / `meet_save` / `kakao_paste` 4개 추정
- NotebookLM/회의록/카카오 → kind: "list" 또는 "text"
- intelligence.ts notebooklm_query와 별개의 핸들러 도메인

#### 권장: Phase 6-D-7 = approval.ts
- 핸들러 1개로 작업 단위 작음
- list 분기 추가 검증 — google/finance/wiki/chat/agents 이후 다섯 번째 list 도메인
- Phase 6-D-8 또는 후반부에 kind="confirmation" 정리 작업 시 approval 영역이 핵심이라 우선 마이그레이션 가치 있음

#### Phase 6-D 후반부 (6-D-8 이후)
- 잔여 도메인(knowledgePipeline/notebooklm) 1개씩 별도 Phase
- `kind="error"` 분기 활성화 — 누적 5개 도메인 9개 분기 일괄 재분류
- `kind="confirmation"` 정리 (선택, approval 마이그레이션 후 검토)
- 누적 잔여 작업 처리 (인코딩 정상화, 본문 포맷팅, esbuild plugin 등)

제약 (Phase 6 동일):
- `routeIntentMessage`/`formatIntentRouteMessage` public API 시그니처 동결
- 도메인 1개씩 마이그레이션
- 마이그레이션된 핸들러도 응답 문자열 byte-for-byte 유지
- planIntent 멀티스텝 분해 구현 금지
- fallbackIntent.ts 수정 금지
- kind="error" 분기 활성화 금지 (Phase 6-D 후반부 별도 작업)
- 자동 commit/push 금지

---

## Phase 6-D-7 구현 로그

### 변경일
2026-05-09

### 변경 파일 목록

**수정 (2개) + 문서 (1개)**
- `server/intent/handlers/approval.ts` — 3개 핸들러(`tradingBuySignal` / `tradingSellSignal` / `tradingApprovalList`)에 `handlerResponse` 추가. 각 핸들러 내부 분기별로 다른 kind/meta. `formatReply.ts` 무수정. `handleApprovalCallback`(텔레그램 callback)은 IntentHandler 아니므로 마이그레이션 대상 제외
- `server/__tests__/formatReply.test.ts` — Phase 6-D-7 approval 회귀 단위 테스트 10건 추가
- `docs/refactor/intent-service-refactor-plan.md` — 본 로그

### approval.ts 액션 + 분기별 kind 매핑

총 3개 액션 + 10개 응답 분기 식별 — 모두 마이그레이션 완료. `formatReply.ts` 무수정.

| 액션 | 분기 | response 본문 위치 | data | kind | text 전략 | meta 핵심 키 |
|------|------|-------------------|------|------|-----------|-------------|
| `trading_buy_signal` | 한도 초과 | response 한 줄 | 없음 | `text` | `""` | `status: "limit_exceeded"`, `market`, `requestedKrw`, `maxOrderKrw` |
| `trading_buy_signal` | 검토 모드 (review_mode) | response (긴 리뷰 리포트) | 없음 | `report` | `""` | `status: "review_mode"`, `market`, `amountKrw` |
| `trading_buy_signal` | 발송 성공 | response 다중 라인 | 없음 | `text` | `""` | `status: "dispatched"`, `market`, `amountKrw`, `approvalIdPrefix`, `hasMessageId` |
| `trading_buy_signal` | 발송 실패(warning) | response 다중 라인 | 없음 | `text` | `""` | `status: "dispatch_warning"`, 동일 |
| `trading_sell_signal` | 수량 부정확 | response 한 줄 | 없음 | `text` | `""` | `status: "invalid_volume"`, `market`, `volume` |
| `trading_sell_signal` | 검토 모드 | response (긴 리포트) | 없음 | `report` | `""` | `status: "review_mode"`, `market`, `volume` |
| `trading_sell_signal` | 발송 성공 | response 다중 라인 | 없음 | `text` | `""` | `status: "dispatched"`, 동일 |
| `trading_sell_signal` | 발송 실패(warning) | response 다중 라인 | 없음 | `text` | `""` | `status: "dispatch_warning"`, 동일 |
| `trading_approval_list` | 빈 큐 | response 한 줄 | 없음 | `list` | `""` | `queueLength: 0`, `isEmpty: true` |
| `trading_approval_list` | 항목 있음 | response 다중 라인 list | 없음 | `list` | `""` | `queueLength`, `isEmpty: false` |

#### 매핑 결정 근거
- **list 분기 2개** (승인 큐 빈/항목): 의미적으로 list 도메인. `kind: "list"`
- **report 분기 2개** (검토 모드 buy/sell): `buildReviewModeResponse`가 긴 매매 리뷰 리포트 반환. `kind: "report"`
- **text 분기 6개** (한도 초과 / 수량 부정확 / 발송 성공·실패 4개): 단순 안내·통보. `kind: "text"`
- 모든 분기 `text=""` 채택 — `data` 필드 원래 미사용이라 본문은 `response`에 통합. legacy 경로 그대로 처리

#### kind="confirmation" 사용 안 함 (제약 준수)
- approval 도메인은 의미상 confirmation과 가장 가깝지만 Phase 6-D-7 제약상 **kind="confirmation" 활성화 금지**
- 텔레그램 인라인 키보드 confirmation 흐름은 `handleApprovalCallback`(IntentHandler 아님)에서 처리되며 intent 라우팅 경로 밖
- 기존 `requiresConfirmation: false` 필드는 모든 분기에서 그대로 유지 (Phase 6-D-8 이후 confirmation 정리 시 재검토)

#### kind="error" 사용 안 함 (제약 준수)
- "한도 초과", "수량 부정확", "발송 실패" 등은 의미상 `kind: "error"`가 맞으나 Phase 6-D-7 제약상 활성화 금지
- `kind: "text"` + `meta.status: "limit_exceeded" | "invalid_volume" | "dispatch_warning"` 사용
- Phase 6-D 후반부 error 분기 활성화 시 일괄 재분류. 누적 **6개 도메인 12개 분기 대기** (이전 5개 도메인 9개 + approval 3개)

#### 사용자 입력 / 내부 식별자 노출 방어
- `req.id`(full UUID) → `req.id.slice(0, 8)`로 8자 접두사만 response/meta에 사용 (의도된 동작)
- `req.reason`(사용자 입력 또는 LLM 유도)은 response에 노출되지만 meta에는 미포함
- `dispatch.chatId`(OWNER_TELEGRAM_CHAT_ID)는 메타 미포함, `hasMessageId: boolean`만 기록
- `req.amountKrw`/`req.volume`/`market`은 사용자 입력값으로 response에 노출되어 meta에 동일 값 기록 안전

### 기존 response/data.* 필드 유지 여부

**모두 유지.** 10개 분기 전부 다음 보존:
- `response` 필드 — 한 글자도 변경 없음
- `data` 필드 — **원래 모든 분기에서 미사용(undefined)**. 변경 없음
- `requiresConfirmation: false` — 모든 분기 그대로 (kind="confirmation" 활성화 안 함)
- `handlerResponse` — 신규 추가만 (옵션 필드)

formatReply 흐름:
- 모든 분기: `handlerText=""` → `primaryBody=""` (legacy 키 미존재) → `fallbackBody=""` (data undefined) → 출력 = response 그대로

마이그레이션 전후 byte-for-byte 동일 (단위 테스트 4건으로 검증: 빈 큐 / 항목 list / 검토 모드 report / 발송 성공).

### raw object 방어 검증 결과

approval 도메인은 **구조적으로 raw object 노출 위험 부재** (`data` 필드 원래 미사용). 단, 향후 핸들러가 `ApprovalRequest` 객체 배열을 `data`에 통째 넣을 가능성 대비 방어 시나리오 단위 테스트 1건으로 검증:

1. **방어 시나리오** — 가상의 `data.approvals[]` 객체에 `id`(full UUID), `requesterId`, `messageId`, `expiresAt`, `createdAt` 같은 내부 식별자 다수 포함 → `safeDisplayBody`가 객체 차단해 빈 문자열 처리, 사용자 응답에 단 하나도 노출되지 않음
2. **meta 노출 방어** — `apiKey`(`UPBIT-API-KEY-LEAK`), `secret`, `sessionId`, `requesterId`, `internalUuid`(`approval-full-uuid-DO-NOT-LEAK`), `botToken`(`1234567890:AAA-bot-token-secret`), `internal.{workerId, queueDepth}` 다수 노출 위험 키 → 사용자 응답에 단 하나도 노출되지 않음
3. 모든 분기에서 `[object Object]`/`{`/JSON dump 미노출 검증
4. `req.id` 8자 접두사만 `meta.approvalIdPrefix`에 기록 (full UUID 노출 위험 차단)

기존 `dealRouting.test.ts:91-105` raw object 차단 회귀 100% 통과.

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **675 passed** / 7 skipped / 2 todo (Phase 6-D-6 665 + 신규 10) |
| `npm run build` | ✅ vite 4.56s + esbuild `dist/index.js` 733.8kb (Phase 6-D-6 731.7kb 대비 +2.1kb) |

#### 신규 단위 테스트 10건 (formatReply Phase 6-D-7 그룹)
1. `trading_approval_list` 빈 큐 — kind=list + text="", byte-for-byte 동일
2. `trading_approval_list` 항목 있음 — kind=list + 본문 통합, byte-for-byte 동일
3. `trading_buy_signal` 한도 초과 — kind=text + meta.status="limit_exceeded"
4. `trading_buy_signal` 검토 모드 — kind=report + 긴 리뷰 리포트, byte-for-byte 동일
5. `trading_buy_signal` 발송 성공 — kind=text + 안내, meta 미노출
6. `trading_buy_signal` 발송 실패 — kind=text + meta.status="dispatch_warning"
7. `trading_sell_signal` 수량 부정확 — kind=text + meta.status="invalid_volume"
8. **`data.approvals` raw 객체 방어 시나리오** — `id` full UUID / `requesterId` / `messageId` / `expiresAt` 모두 차단
9. **meta 노출 방어** — `apiKey`/`secret`/`sessionId`/`requesterId`/`internalUuid`/`botToken`/`internal.{workerId,queueDepth}` 미노출
10. **9개 도메인 종합 회귀** — google `kind=list` / trading `kind=report` / deals `kind=text` / realestate `kind=report` / finance `kind=list` / intelligence `kind=report` / wiki `kind=text` / chat `kind=list` / agents `kind=list` 모두 정상 동작 유지

#### 통합 테스트 회귀 검증
- `approvalQueue.test.ts` — 큐 단위 테스트, `routeIntentMessage` 미사용, 회귀 무관 통과
- `dealRouting.test.ts` raw object 차단 — 통과
- `dealNameParsing.test.ts` — 통과
- `briefing.test.ts` `routeIntentMessage` — 통과
- 기존 665건 중 회귀 0건

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage`/`formatIntentRouteMessage` 시그니처 동결
- 3개 핸들러 10개 분기 응답 문자열 byte-for-byte 동일
- `formatReply.ts` 무수정 — 다른 도메인(google/trading/deals/realestate/finance/intelligence/wiki/chat/agents) 회귀 영향 0
- `requiresConfirmation: false` 모든 분기 유지 — 기존 confirmation gate 흐름 영향 없음
- `handleApprovalCallback`(텔레그램 callback) 함수 무수정 — IntentHandler 경로 밖
- 미마이그레이션 도메인(knowledge/notebooklm) 변경 없음

### 남은 리스크
1. **approval 한도 초과/수량 부정확/발송 실패 분기 임시 `kind="text"`** — 의미상 `kind="error"`가 맞으나 제약상 활성화 금지. Phase 6-D 후반부 일괄 재분류. 현재 누적 **6개 도메인 12개 분기 대기**: deals.ts unknown, monitoring 에러, wiki_auto_classify 에러, chat 에러, agents.ts execute error / result not_found / cancel not_found / invalid_args, approval.ts limit_exceeded / invalid_volume / dispatch_warning(buy) / dispatch_warning(sell)
2. **approval 도메인은 confirmation 의미가 가장 강하지만 `kind="confirmation"` 미활성** — Phase 6-D-7 제약 준수. Phase 6-D 후반부 confirmation 정리 작업 시 approval이 핵심 영역이 될 것
3. **`req.id` 8자 접두사 정책 일관성 의존** — approval 큐 항목의 short id 표시 방식이 변경되면 byte-for-byte 깨질 수 있음. 현재는 `req.id.slice(0, 8)`로 일관 유지
4. **`buildReviewModeResponse` 내부 응답 형식 의존** — 검토 모드 분기는 `formatReviewReport(report)` 결과를 통째로 받음. trading.ts(`tradingReviewReport`)와 동일 포맷터 사용. 포맷터 변경 시 양쪽 핸들러 모두 영향
5. **누적 잔여**: `prompts/` prod 번들 미동봉, `inferKind()` 미사용, `analysisHandler` 본문 중복 버그, `feasibility`/`finance` 헤더 인코딩 깨짐, finance 본문 포맷팅 부재, error 분기 재분류 대기 (6개 도메인 12개 분기), confirmation 정리 대기

### Phase 6-D-8 제안

**다음 단계는 knowledgePipeline.ts 또는 notebooklm.ts 중 하나만 선택 권장.**

#### 옵션 A: knowledgePipeline.ts (추천)
- 대상: `tg_pipeline_capture` 등 (`/tg ...` 명령) 추정
- 텔레그램 → Wiki 파이프라인 → kind: "text" 또는 "list"
- chat/wiki와 연관된 도메인 — 회귀 영향 검증 가치

#### 옵션 B: notebooklm.ts (작업량 가장 큼)
- 대상: `nb_command` / `nb_save` / `meet_save` / `kakao_paste` 4개 추정
- NotebookLM/회의록/카카오 → kind: "list" / "text" 혼합
- 작업량은 deals.ts/agents.ts 수준이거나 더 큼

#### 권장: Phase 6-D-8 = knowledgePipeline.ts
- 핸들러 1~2개로 작업량 finance/chat 수준
- 텔레그램 메시지 raw 객체 노출 위험 영역 (chat.ts와 유사)
- 잔여 도메인 마지막 2개 중 가벼운 것 먼저 처리 권장

#### Phase 6-D 후반부 (6-D-9 이후)
- 잔여 도메인(notebooklm) 별도 Phase
- `kind="error"` 분기 활성화 — 누적 6개 도메인 12개 분기 일괄 재분류
- `kind="confirmation"` 정리 — approval 도메인 중심 검토
- 누적 잔여 작업 처리 (인코딩 정상화, 본문 포맷팅, esbuild plugin 등)

제약 (Phase 6 동일):
- `routeIntentMessage`/`formatIntentRouteMessage` public API 시그니처 동결
- 도메인 1개씩 마이그레이션
- 마이그레이션된 핸들러도 응답 문자열 byte-for-byte 유지
- planIntent 멀티스텝 분해 구현 금지
- fallbackIntent.ts 수정 금지
- kind="error" 분기 활성화 금지 (Phase 6-D 후반부 별도 작업)
- kind="confirmation" 분기 활성화 금지 (Phase 6-D 후반부 별도 작업)
- 자동 commit/push 금지

---

## Phase 6-D-8 구현 로그

### 변경일
2026-05-09

### 변경 파일 목록

**수정 (2개) + 문서 (1개)**
- `server/intent/handlers/knowledgePipeline.ts` — 단일 핸들러 `tgPipelineCapture`(`tg_pipeline_capture`) 4개 분기 모두에 `handlerResponse` 추가. `formatReply.ts` 무수정
- `server/__tests__/formatReply.test.ts` — Phase 6-D-8 knowledgePipeline 회귀 단위 테스트 10건 추가
- `docs/refactor/intent-service-refactor-plan.md` — 본 로그

### knowledgePipeline.ts 액션 + 분기별 kind 매핑

총 1개 액션(`tg_pipeline_capture`) + 4개 응답 분기 식별 — 모두 마이그레이션 완료. `formatReply.ts` 무수정.

| 분기 | response 본문 위치 | data 형태 | kind | text 전략 | meta 핵심 키 |
|------|-------------------|----------|------|-----------|-------------|
| 빈 본문 (rawText 빈 문자열) | response 한 줄 | 없음 | `text` | `""` | `action`, `status: "empty_text"` |
| 명령만 있고 본문 없음 (after adapter) | response 한 줄 | 없음 | `text` | `""` | `action`, `status: "missing_body"` |
| 저장 실패 (pipeline result.ok=false) | response 한 줄 + pending_path | `{ pending_path }` | `text` | `""` | `action`, `status: "error"`, `stage: "pipeline_run"` |
| 저장 성공 (skip / suggested / project / inbox 라우팅) | response 다중 라인 통합형 | `{ saved_path, was_skipped, quality, step_failures }` | `text` | `""` | `action`, `status: "saved"`, `wasSkipped`, `quality`, `routingMode`, `hasTitle`, `stepFailureCount` |

#### 매핑 결정 근거
- 모든 분기 `kind: "text"` 단일 매핑 — 응답이 모두 짧은 안내 또는 다중 라인 저장 안내. list/report 의미 없음
- 모든 분기 `text=""` 채택 — 본문은 `response`에 통합되어 있고 data는 디버그용 메타데이터
- `routingMode` enum (`"suggested" | "project" | "inbox"`)으로 라우팅 결과를 구조화하여 meta에 기록

#### kind="error" 사용 안 함 (제약 준수)
- "저장 실패" / "빈 본문" / "명령만 있음" 분기는 의미상 `kind: "error"`가 적합하나 Phase 6-D-8 제약상 **error 분기 활성화 금지**
- `kind: "text"` + `meta.status` 임시 사용 (`empty_text` / `missing_body` / `error`)
- Phase 6-D 후반부 error 분기 활성화 시 일괄 재분류. 누적 **7개 도메인 15개 분기 대기** (이전 6개 도메인 12개 + knowledgePipeline 3개)

#### 사용자 입력 / 내부 식별자 노출 방어
- `rawText`(사용자 입력 원문)는 meta에 절대 미포함
- `result.doc.title`(LLM 추출 또는 사용자 입력 일부)도 meta 미포함 — `hasTitle: boolean`만
- `result.doc.suggested_projects[]`(LLM 추출 카테고리)도 meta 미포함 — `routingMode` enum만
- `source_ref`(`tg:user:{id}:hash:{16자}`)는 meta 미포함 — userId 노출 위험 차단
- `saved_path`/`pending_path`는 response에 이미 노출되어 사용자 가치 있는 정보 — 별도 차단 불필요

### 기존 response/data.* 필드 유지 여부

**모두 유지.** 4개 분기 전부 다음 보존:
- `response` 필드 — 한 글자도 변경 없음
- `data` 필드 — 빈 본문/명령 누락(미설정), 저장 실패(`{pending_path}`), 저장 성공(`{saved_path, was_skipped, quality, step_failures}`) 모두 그대로
- `handlerResponse` — 신규 추가만 (옵션 필드)

formatReply 흐름:
- 모든 분기: `handlerText=""` → `primaryBody=""` (legacy 키 미존재) → `fallbackBody=""` (data가 객체이지만 `safeDisplayBody`가 빈 문자열 처리, `containsRawObjectShape`는 method/files 키 검사라 미해당) → 출력 = response 그대로

마이그레이션 전후 byte-for-byte 동일 (단위 테스트 4건으로 검증: 저장 성공 / skip / suggested / 저장 실패).

### raw object 방어 검증 결과

knowledgePipeline 도메인은 텔레그램 raw 메시지 객체 + wiki 내부 구조 노출 위험 영역:
- 현재 `data`에는 `saved_path`/`pending_path`/`was_skipped`/`quality`/`step_failures`만 — 안전한 형태
- `result.doc.suggested_projects`, `result.doc.title`은 핸들러 안에서만 사용, data 미포함
- `event.chat_id`/`event.message_id`/`source_ref`는 핸들러 변수에 머물고 data/response 노출 안 함

마이그레이션 후에도 차단 동작 유지를 단위 테스트 3건으로 검증 (현재 미사용이지만 향후 추가 시 대비):

1. **방어 시나리오 1** — 가상의 `data.telegram.{chat_id, message_id, from.{id, username, first_name}, date}` raw 텔레그램 객체 → 모두 사용자 응답 미노출
2. **방어 시나리오 2** — 가상의 `data.frontmatter.{uuid, categories, absolutePath}` + `data.rawMarkdown` (wiki 내부 구조) → uuid `internal-uuid-abc-123`, 절대 경로 `C:\Users\internal\path.md`, 내부 마크다운 모두 미노출
3. **meta 노출 방어** — `apiKey` (`GEMINI-API-KEY-LEAK`), `secret`, `botToken` (`1234567890:AAA-bot-token-secret`), `sessionId`, `internalUserId`, `internalPath`, `sourceRefRaw` (`tg:user:1:hash:abc123def456`) 다수 → 사용자 응답에 단 하나도 노출되지 않음

기존 `dealRouting.test.ts:91-105` raw object 차단 회귀 100% 통과.

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **685 passed** / 7 skipped / 2 todo (Phase 6-D-7 675 + 신규 10) |
| `npm run build` | ✅ vite 4.71s + esbuild `dist/index.js` 734.8kb (Phase 6-D-7 733.8kb 대비 +1.0kb) |

#### 신규 단위 테스트 10건 (formatReply Phase 6-D-8 그룹)
1. 저장 성공 — kind=text + text="" + data 객체 raw 차단 + byte-for-byte 동일
2. 저장 성공 skip 케이스 — kind=text + skipNote 통합형
3. 저장 성공 suggested 라우팅 — kind=text + 안내 통합형
4. 저장 실패 (pending 큐) — kind=text + meta.status="error"
5. 빈 본문 — kind=text + meta.status="empty_text"
6. 명령만 있는 경우 — kind=text + meta.status="missing_body"
7. **방어 시나리오 1**: 가상 `data.telegram.*` raw 객체 차단 (`chat_id`/`message_id`/`from`/`date` 모두 미노출)
8. **방어 시나리오 2**: 가상 `data.frontmatter.{uuid,absolutePath}` + `data.rawMarkdown` 차단 (wiki 내부 구조 미노출)
9. **meta 노출 방어**: `apiKey`/`secret`/`botToken`/`sessionId`/`internalUserId`/`internalPath`/`sourceRefRaw` 미노출
10. **10개 도메인 종합 회귀** — google `kind=list` / trading `kind=report` / deals `kind=text` / realestate `kind=report` / finance `kind=list` / intelligence `kind=report` / wiki `kind=text` / chat `kind=list` / agents `kind=list` / approval `kind=list` 모두 정상 동작 유지

#### 통합 테스트 회귀 검증
- `tgPipelineRouting.test.ts` — `fallbackIntent` 매칭 검증, `routeIntentMessage` 미사용, 회귀 무관 통과
- `pipelineRunner.test.ts` / `pendingQueue.test.ts` / `wikiWriter.test.ts` / `telegramAdapter.test.ts` / `tokenDispatcher.test.ts` / `llmStages.test.ts` — 도메인 단위 테스트, `routeIntentMessage` 미사용, 회귀 무관 통과
- `dealRouting.test.ts` raw object 차단 — 통과
- 기존 675건 중 회귀 0건

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage`/`formatIntentRouteMessage` 시그니처 동결
- 1개 핸들러 4개 분기 응답 문자열 byte-for-byte 동일
- `formatReply.ts` 무수정 — 다른 도메인(google/trading/deals/realestate/finance/intelligence/wiki/chat/agents/approval) 회귀 영향 0
- `data.{saved_path, pending_path, was_skipped, quality, step_failures}` 차단 동작 그대로 (formatReply의 `safeDisplayBody`가 객체 차단)
- `runner.run(input)`, `telegramAdapter.toPipelineInput(event)` 등 도메인 모듈 호출 경로 무수정
- 미마이그레이션 도메인(notebooklm) 변경 없음

### 남은 리스크
1. **knowledgePipeline 빈 본문/명령 누락/저장 실패 분기 임시 `kind="text"`** — 의미상 `kind="error"`가 맞으나 제약상 활성화 금지. Phase 6-D 후반부 일괄 재분류. 현재 누적 **7개 도메인 15개 분기 대기**: deals.ts unknown, monitoring 에러, wiki_auto_classify 에러, chat 에러, agents.ts 4건, approval.ts 4건, knowledgePipeline.ts 3건 (`empty_text`/`missing_body`/`error`)
2. **`data.suggested_projects`/`doc.title` 등 LLM 출력 필드** — 현재 핸들러는 data에 미포함하지만 향후 디버그용으로 추가 가능성. 추가 시 사용자 입력 원문이 meta에 누출되지 않도록 boolean/enum 형태로만 기록 (Phase 6-D-8 정책 준수)
3. **`source_ref` 형식 의존** — `tg:user:{id}:hash:{16자}` 포맷이 메시지 멱등성 키. response/data에 노출되지 않으나 향후 변경 시 단위 테스트 영향 가능
4. **`routingMode` enum 일관성** — `"suggested" | "project" | "inbox"` 3개 값으로 라우팅 결과를 구조화. 향후 라우팅 분기가 추가되면 enum도 같이 확장 필요
5. **누적 잔여**: `prompts/` prod 번들 미동봉, `inferKind()` 미사용, `analysisHandler` 본문 중복 버그, `feasibility`/`finance` 헤더 인코딩 깨짐, finance 본문 포맷팅 부재, error 분기 재분류 대기 (7개 도메인 15개 분기), confirmation 정리 대기

### Phase 6-D-9 제안

**다음 단계는 notebooklm.ts 마이그레이션 (잔여 마지막 도메인).**

#### Phase 6-D-9 = notebooklm.ts
- 대상: `nb_command` / `nb_save` / `meet_save` / `kakao_paste` 4개 추정
- 작업량 가장 큼 (Phase 6-D 시리즈에서 마지막 미마이그레이션 도메인)
- NotebookLM/회의록/카카오 → kind: "list" / "text" 혼합 매핑 가능성
- intelligence.ts `notebooklm_query`(이미 마이그레이션 완료)와는 별개 핸들러
- nb_save / meet_save / kakao_paste 는 위키/딜 폴더 저장 결과 — frontmatter / path 노출 위험 영역

작업 순서:
1. `server/intent/handlers/notebooklm.ts` 분석 — 4개 핸들러 식별 (실제 코드 확인 필수)
2. 각 핸들러 응답 구조 확인 (response 통합형 vs data 분리형)
3. 카카오 raw 메시지 / 회의록 frontmatter / wiki 저장 결과 객체 노출 위험 검증
4. handlerResponse 추가 (kind 매핑 + meta 마커, 사용자 입력 원문 미포함)
5. formatReply.test.ts에 notebooklm 회귀 단위 테스트 추가 (4개 핸들러 각각 + raw 객체 방어 + 11개 도메인 종합 회귀)
6. 검증: `npm run check && npm test && npm run build`

#### Phase 6-D 시리즈 마무리 (6-D-9 완료 후)
- **모든 11개 도메인 핸들러 마이그레이션 완료** 상태 도달
- `kind="error"` 분기 활성화 작업 — 누적 7개 도메인 15개 분기 일괄 재분류 (별도 Phase)
- `kind="confirmation"` 정리 — approval 도메인 중심 검토 (별도 Phase)
- 누적 잔여 작업 처리 (인코딩 정상화, 본문 포맷팅, esbuild plugin 등)

제약 (Phase 6 동일):
- `routeIntentMessage`/`formatIntentRouteMessage` public API 시그니처 동결
- notebooklm.ts 외 핸들러 수정 금지 (기 마이그레이션 10개 도메인 모두 동결)
- 마이그레이션된 핸들러도 응답 문자열 byte-for-byte 유지
- planIntent 멀티스텝 분해 구현 금지
- fallbackIntent.ts 수정 금지
- kind="error" 분기 활성화 금지 (Phase 6-D 후반부 별도 작업)
- kind="confirmation" 분기 활성화 금지 (Phase 6-D 후반부 별도 작업)
- 자동 commit/push 금지

---

## Phase 6-D-9 구현 로그

### 변경일
2026-05-09

### 변경 파일 목록

**수정 (2개) + 문서 (1개)**
- `server/intent/handlers/notebooklm.ts` — 4개 핸들러(`nbCommand` / `nbSave` / `meetSave` / `kakaoPaste`) 13개 분기 모두에 `handlerResponse` 추가. `formatReply.ts` 무수정
- `server/__tests__/formatReply.test.ts` — Phase 6-D-9 notebooklm 회귀 단위 테스트 11건 추가
- `docs/refactor/intent-service-refactor-plan.md` — 본 로그 + Phase 6-D 시리즈 완료 선언

### notebooklm.ts 액션 + 분기별 kind 매핑

총 4개 액션 + 13개 응답 분기 식별 — 모두 마이그레이션 완료. `formatReply.ts` 무수정.

| 액션 | 분기 | data 형태 | kind | text 전략 | meta 핵심 키 |
|------|------|----------|------|-----------|-------------|
| `nb_command` | 단일 (handleNbCommand 결과) | 없음 | `text` | `""` | `action`, `rawLength` |
| `nb_save` | 형식 오류 | 없음 | `text` | `""` | `status: "invalid_format"`, `rawLength` |
| `nb_save` | project 없음 | 없음 | `text` | `""` | `status: "project_not_found"`, `requestedProject`, `suggestionCount` |
| `nb_save` | 저장 실패 (pending) | 없음 | `text` | `""` | `status: "error"`, `stage: "pipeline_run"`, `project` |
| `nb_save` | 저장 성공 | `{saved_path, was_skipped, quality}` | `text` | `""` | `status: "saved"`, `project`, `wasSkipped`, `quality`, `hasTitle`, `bodyLength` |
| `meet_save` | 형식 오류 | 없음 | `text` | `""` | 동일 패턴 (`action: "meet_save"`) |
| `meet_save` | project 없음 | 없음 | `text` | `""` | 동일 |
| `meet_save` | 저장 실패 | 없음 | `text` | `""` | 동일 |
| `meet_save` | 저장 성공 | `{saved_path, was_skipped, quality}` | `text` | `""` | 동일 + `attendeesCount` |
| `kakao_paste` | 형식 오류 | 없음 | `text` | `""` | 동일 패턴 (`action: "kakao_paste"`) |
| `kakao_paste` | project 없음 | 없음 | `text` | `""` | 동일 |
| `kakao_paste` | 저장 실패 | 없음 | `text` | `""` | 동일 |
| `kakao_paste` | 저장 성공 | `{saved_path, was_skipped, quality}` | `text` | `""` | 동일 + `hasChatRoom` |

#### 매핑 결정 근거
- 모든 분기 `kind: "text"` 단일 매핑 — 응답이 모두 짧은 안내(에러/검증 실패) 또는 다중 라인 저장 안내
- 모든 분기 `text=""` 채택 — 본문은 `response`에 통합, data는 디버그용 메타데이터(저장 성공 분기만)
- nb_save / meet_save / kakao_paste 가 거의 동일 4분기 패턴이라 일관성 유지

#### kind="error" 사용 안 함 (제약 준수)
- 9개 에러성 분기(nb_save/meet_save/kakao_paste 각 3개씩: invalid_format / project_not_found / error)는 의미상 `kind: "error"` 적합하나 Phase 6-D-9 제약상 **error 분기 활성화 금지**
- `kind: "text"` + `meta.status` 임시 사용
- Phase 6-D 후반부 error 분기 활성화 시 일괄 재분류. 누적 **8개 도메인 24개 분기 대기** (이전 7개 도메인 15개 + notebooklm 9개)

#### 사용자 입력 / 내부 식별자 노출 방어
- `parsed.body`(사용자 입력 NotebookLM/회의록/카톡 원문) — meta에 절대 미포함 (`bodyLength`만)
- `parsed.attendees`(회의 참석자 이름) — meta에 미포함 (`attendeesCount`만)
- `parsed.chatRoom`(카톡방 이름) — meta에 미포함 (`hasChatRoom: boolean`만)
- `result.doc.title`(LLM 추출 제목) — meta에 미포함 (`hasTitle: boolean`만)
- `result.doc.body`(LLM 처리된 본문) — meta에 미포함
- `parsed.project`(영문 enum project ID) — response에 노출되어 사용자 가치, meta 포함 안전
- `sourceRef`/`textHash`/`userId` — 핸들러 내부 변수, response/meta 미노출

### 기존 response/data.* 필드 유지 여부

**모두 유지.** 13개 분기 전부 다음 보존:
- `response` 필드 — 한 글자도 변경 없음
- `data` 필드 — 저장 성공 분기 4개만 `{saved_path, was_skipped, quality}` 보유, 나머지 9개 분기는 미설정. 변경 없음
- `handlerResponse` — 신규 추가만 (옵션 필드)

formatReply 흐름:
- 모든 분기: `handlerText=""` → `primaryBody=""` (legacy 키 미존재) → `fallbackBody=""` (data가 객체이지만 `safeDisplayBody`가 빈 문자열 처리) → 출력 = response 그대로

마이그레이션 전후 byte-for-byte 동일 (단위 테스트 4건으로 검증: nb_command 정상 / nb_save 저장 성공 / meet_save 참석자 포함 / kakao_paste chatRoom 포함).

### raw object 방어 검증 결과

notebooklm 도메인은 카카오 raw 메시지 + 회의록 frontmatter + wiki 내부 구조 노출 위험 영역:
- 현재 `data`에는 `saved_path`/`was_skipped`/`quality`만 — 안전한 형태
- `parsed.body` / `result.doc.body` / `result.doc.title` 모두 핸들러 안에만 머묾, data 미포함
- `sourceRef`/`textHash`/`userId` 핸들러 내부 변수, data 미포함

마이그레이션 후에도 차단 동작 유지를 단위 테스트 3건으로 검증 (현재 미사용이지만 향후 추가 시 대비):

1. **방어 시나리오 1** — 가상 `data.kakaoRaw.{chatRoomId, messageId, from.{id,username,first_name}, text, date}` raw 카카오 객체 → 모두 사용자 응답 미노출
2. **방어 시나리오 2** — 가상 `data.frontmatter.{uuid, absolutePath}` + `data.rawMarkdown` + `data.internalPath` (wiki 내부 구조) → uuid `internal-uuid-DO-NOT-LEAK-001`, 절대 경로 `C:\Users\internal\wiki...`, 내부 마크다운 본문, 서버 경로 `/var/lib/aston/internal/path` 모두 미노출
3. **meta 노출 방어** — `apiKey`(`GEMINI-API-KEY-LEAK`), `secret`, `botToken`(`1234567890:AAA-bot-token-secret`), `sessionId`, `internalUserId`, `rawBody`(`회장님 비밀 NotebookLM 답변 원문`), `attendeeNames`, `chatRoomName`(`PF사업단톡`), `sourceRefRaw` 다수 → 사용자 응답에 단 하나도 노출되지 않음

기존 `dealRouting.test.ts:91-105` raw object 차단 회귀 100% 통과.

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **696 passed** / 7 skipped / 2 todo (Phase 6-D-8 685 + 신규 11) |
| `npm run build` | ✅ vite 4.86s + esbuild `dist/index.js` 738.3kb (Phase 6-D-8 734.8kb 대비 +3.5kb) |

#### 신규 단위 테스트 11건 (formatReply Phase 6-D-9 그룹)
1. `nb_command` 정상 — kind=text byte-for-byte
2. `nb_save` 저장 성공 — kind=text + data 객체 raw 차단
3. `nb_save` 형식 오류 — meta.status="invalid_format"
4. `nb_save` project 없음 — meta.status="project_not_found" + suggestions 미노출
5. `nb_save` 저장 실패 — meta.status="error" + stage 미노출
6. `meet_save` 저장 성공 (참석자 포함) — 다중 라인, 참석자 이름은 response 노출 / meta 키 미노출
7. `kakao_paste` 저장 성공 (chatRoom 포함) — 다중 라인, chatRoom은 response 노출 / meta 키 미노출
8. **방어 시나리오 1**: 가상 카카오 raw 객체 차단 (`kakaoRaw.{chatRoomId,messageId,from,text,date}`)
9. **방어 시나리오 2**: 가상 wiki 내부 구조 차단 (`frontmatter`/`uuid`/`absolutePath`/`rawMarkdown`/`internalPath`)
10. **meta 노출 방어**: `apiKey`/`secret`/`botToken`/`sessionId`/`rawBody`(회장님 비밀 원문)/`attendeeNames`/`chatRoomName`/`sourceRefRaw` 미노출
11. **11개 도메인 종합 회귀** — google/trading/deals/realestate/finance/intelligence/wiki/chat/agents/approval/knowledgePipeline 모두 정상

#### 통합 테스트 회귀 검증
- `kakaoFileHandler.test.ts` / `kakaoManualAdapter.test.ts` / `mappingLoader.test.ts` / `meetingAdapter.test.ts` / `notebookLmAdapter.test.ts` / `notebookQuery.test.ts` — 모두 도메인 단위 테스트, `routeIntentMessage` 미사용, 회귀 무관 통과
- `dealRouting.test.ts` raw object 차단 — 통과
- 기존 685건 중 회귀 0건

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage`/`formatIntentRouteMessage` 시그니처 동결
- 4개 핸들러 13개 분기 응답 문자열 byte-for-byte 동일
- `formatReply.ts` 무수정 — 다른 도메인 회귀 영향 0
- `data.{saved_path, was_skipped, quality}` 차단 동작 그대로 (`safeDisplayBody`가 객체 → 빈 문자열)
- `runner.run(input)`, `notebookLmAdapter`/`meetingAdapter`/`kakaoManualAdapter`/`loadMapping` 등 도메인 모듈 호출 경로 무수정
- 사용자 입력 원문(body/attendees/chatRoom)은 meta에서 명시적으로 제외되어 노출 위험 차단

### 남은 리스크
1. **notebooklm 9개 에러성 분기 임시 `kind="text"`** — 의미상 `kind="error"`가 맞으나 제약상 활성화 금지. Phase 6-D 후반부 일괄 재분류. 현재 누적 **8개 도메인 24개 분기 대기**: deals.ts unknown(1) + monitoring 에러(1) + wiki_auto_classify 에러(1) + chat 에러(1) + agents.ts(4) + approval.ts(4) + knowledgePipeline.ts(3) + notebooklm.ts(9)
2. **`parsed.project` 영문 enum 가정** — `loadMapping()`이 반환하는 영문 ID 형식에 의존. 한글이나 특수 문자 포함 시 meta 노출 위험 검토 필요
3. **`bodyLength` 메타** — 사용자 입력 원문 길이만 기록. 길이 자체로 사용자 행동 추론 가능성은 있으나 raw 노출보다 안전. 운영상 문제 없음
4. **`runner.run` 결과 객체 의존** — `result.doc.title`/`result.doc.quality`/`result.entry.saved_path` 필드 형식에 의존. PipelineRunner 내부 변경 시 핸들러 마이그레이션도 같이 검토 필요
5. **누적 잔여**: `prompts/` prod 번들 미동봉, `inferKind()` 미사용, `analysisHandler` 본문 중복 버그, `feasibility`/`finance` 헤더 인코딩 깨짐, finance 본문 포맷팅 부재, error 분기 재분류 대기 (8개 도메인 24개 분기), confirmation 정리 대기

---

## ✅ Phase 6-D 시리즈 완료 선언

**2026-05-09 — Phase 6-D 시리즈 (점진 마이그레이션) 완료.**

### 마이그레이션된 11개 도메인 핸들러 전체 목록

| Phase | 파일 | 핸들러 수 | 분기 수 | 신규 테스트 |
|-------|------|----------|--------|-------------|
| 6-A | `handlers/google.ts` | 3 (driveSearch/getEmails/listEvents 부분) | 3 | 7 |
| 6-B | `handlers/trading.ts` | 4 (preCheck/reviewReport/techAnalysis/analysisHandler) | 4 | 9 |
| 6-C | `handlers/deals.ts` | 1 (deals_command, 14 sub-command) | 14 | 9 |
| 6-D-1 | `handlers/realestate.ts` | 8 | 8 | 9 |
| 6-D-2 | `handlers/finance.ts` | 1 | 1 | 9 |
| 6-D-3 | `handlers/intelligence.ts` | 3 | 5 | 9 |
| 6-D-4 | `handlers/wiki.ts` | 3 | 5 | 9 |
| 6-D-5 | `handlers/chat.ts` | 1 | 4 | 8 |
| 6-D-6 | `handlers/agents.ts` | 1 (10 sub-command) | 10 | 10 |
| 6-D-7 | `handlers/approval.ts` | 3 | 10 | 10 |
| 6-D-8 | `handlers/knowledgePipeline.ts` | 1 | 4 | 10 |
| 6-D-9 | `handlers/notebooklm.ts` | 4 | 13 | 11 |
| **합계** | **11개 도메인** | **약 33개 핸들러** | **약 91개 분기** | **110건** |

### 누적 테스트 통과 추이
- Phase 5 시작: 586 passed
- Phase 6-A 종료: 593 passed (+7)
- Phase 6-B 종료: 602 passed (+9)
- Phase 6-C 종료: 611 passed (+9)
- Phase 6-D-1 종료: 620 passed (+9)
- Phase 6-D-2 종료: 629 passed (+9)
- Phase 6-D-3 종료: 638 passed (+9)
- Phase 6-D-4 종료: 647 passed (+9)
- Phase 6-D-5 종료: 655 passed (+8)
- Phase 6-D-6 종료: 665 passed (+10)
- Phase 6-D-7 종료: 675 passed (+10)
- Phase 6-D-8 종료: 685 passed (+10)
- **Phase 6-D-9 종료: 696 passed (+11)** ← 최종

### 빌드 크기 추이
- Phase 5 시작: `dist/index.js` 722.5kb
- **Phase 6-D-9 종료: `dist/index.js` 738.3kb (+15.8kb 누적)**

### 핵심 성과
1. **public API 시그니처 100% 동결** — `routeIntentMessage` / `formatIntentRouteMessage` 한 글자도 변경 없음
2. **응답 문자열 byte-for-byte 100% 보존** — 모든 91개 분기 출력 동일
3. **`formatReply.ts` 무수정** — Phase 6-A/6-B/6-C에서 list/report/text 분기 활성화 후 11개 도메인 마이그레이션 모두 추가 수정 없이 처리
4. **raw object 노출 방어 100% 유지** — `dealRouting.test.ts:91-105` 회귀 + 추가 단위 테스트 다수
5. **사용자 입력 원문 / 내부 식별자 / 토큰 / 시크릿 사용자 응답 미노출** — meta 정책 일관 적용 (length/boolean/enum/count만)

---

## 다음 Phase 제안

**Phase 6-D 시리즈 완료 후 별도 Phase로 다음 두 작업 중 하나만 선택 권장.**

### 옵션 A: kind="error" 분기 활성화 (추천)
- 누적 **8개 도메인 24개 분기**가 임시 `kind="text"` + `meta.status="error"`로 마킹된 상태
- formatReply에 `kind === "error"` 분기 추가 (예: 에러 메시지 prefix 통일, 색상 마커, 또는 그대로 표시)
- 24개 분기를 일괄 `kind="error"`로 재분류
- meta.status 기반 식별이 이미 일관적이라 작업 효율적

#### 작업 후보:
1. formatReply.ts에 `kind === "error"` 분기 추가 (구체 디자인 결정 필요)
2. 8개 핸들러에서 `kind: "text"` + `meta.status` 사용하는 24개 분기를 `kind: "error"`로 변경
3. formatReply.test.ts에 error 분기 단위 테스트 추가
4. 응답 문자열 byte-for-byte 보존 (Phase 6-D 원칙 동일)

### 옵션 B: kind="confirmation" 정리
- approval 도메인이 핵심 영역 (현재 모든 분기 `requiresConfirmation: false`)
- `requiresConfirmation: true` 흐름과 `kind="confirmation"` 의 역할 분리 결정 필요
- 작업량은 옵션 A보다 작으나 설계 결정 비중이 큼

### 옵션 C: 누적 잔여 작업 처리
- `prompts/` prod 번들 미동봉 → esbuild plugin
- `inferKind()` formatReply 본문 활성화
- `analysisHandler` 본문 중복 버그 수정
- `feasibility`/`finance` 헤더 인코딩 깨짐 정상화
- finance 본문 포맷팅 (`formatDartDisclosures` 추가)

#### 권장: 옵션 A → 옵션 B → 옵션 C 순서
- 옵션 A는 Phase 6-D 시리즈에서 누적된 24개 분기를 정리하는 자연스러운 다음 단계
- 옵션 B는 옵션 A 완료 후 confirmation 분기까지 정리하는 마무리 작업
- 옵션 C는 전체 정리 후 별도 cleanup phase로 진행

제약 (Phase 7 시작 시 동일):
- `routeIntentMessage`/`formatIntentRouteMessage` public API 시그니처 동결
- 마이그레이션된 핸들러도 응답 문자열 byte-for-byte 유지
- planIntent 멀티스텝 분해 구현 금지
- fallbackIntent.ts 수정 금지
- 자동 commit/push 금지

---

## Phase 7-A 구현 로그

### 변경일
2026-05-09

### 변경 파일 목록

**수정 (9개) + 문서 (1개)**
- `server/intent/pipeline/formatReply.ts` — `handlerText` 추출 조건에 `kind === "error"` 추가 (`list || report || text || error`). text 분기와 동일 처리. 주석에 Phase 7-A 도입 의도 명시
- `server/intent/handlers/deals.ts` — `dealActionToKind()` 헬퍼에서 `unknown` action 을 `kind: "error"` 로 매핑 (1개 분기)
- `server/intent/handlers/intelligence.ts` — `monitoringStatus` 에러 catch 분기 `kind: "error"` 재분류 (1개 분기)
- `server/intent/handlers/wiki.ts` — `wikiAutoClassify` 에러 catch 분기 `kind: "error"` 재분류 (1개 분기)
- `server/intent/handlers/chat.ts` — `recentTelegram` 에러 catch 분기 `kind: "error"` 재분류 (1개 분기)
- `server/intent/handlers/agents.ts` — 4개 분기 재분류: `result not_found` / `cancel not_found` / `execute invalid_args` / `execute error` (4개 분기, found/cancelled 분기는 text 유지)
- `server/intent/handlers/approval.ts` — 4개 분기 재분류: `limit_exceeded` / `invalid_volume` / `dispatch_warning(buy)` / `dispatch_warning(sell)` (정상 dispatched는 text 유지)
- `server/intent/handlers/knowledgePipeline.ts` — 3개 분기 재분류: `empty_text` / `missing_body` / `pipeline error` (저장 성공은 text 유지)
- `server/intent/handlers/notebooklm.ts` — 9개 분기 재분류: `nb_save`/`meet_save`/`kakao_paste` 각 3개씩 (`invalid_format` / `project_not_found` / `error`). 정상 저장 4개 분기는 text 유지
- `server/__tests__/formatReply.test.ts` — Phase 7-A `kind="error"` 회귀 단위 테스트 15건 추가 + 비활성 kind 테스트 1건 수정 (kind=error → kind=confirmation 으로 비활성 케이스 이동)
- `docs/refactor/intent-service-refactor-plan.md` — 본 로그

### kind="error" 활성화 정책

**사용자 출력상 `kind="text"` 분기와 byte-for-byte 동일하게 처리.**

formatReply.ts 의 `handlerText` 추출 조건 확장:
```ts
(handlerKind === "list" ||
  handlerKind === "report" ||
  handlerKind === "text" ||
  handlerKind === "error") &&
typeof result.handlerResponse?.text === "string"
  ? result.handlerResponse.text
  : ""
```

준수 사항:
- **자동 prefix 추가 금지** — `⚠️` 등 prefix 자동 부착 안 함 (핸들러가 response에 이미 포함)
- **`meta.status` 별 문구 변경 금지** — formatReply는 meta를 절대 읽지 않음
- 기존 `response` / `handlerResponse.text` 그대로 통과
- `text=""` → legacy fallback (data.fileList/emailList/eventList/briefing/report/summary 순)
- `meta`는 다른 kind와 마찬가지로 사용자 응답 미노출

### 재분류한 핸들러/분기 목록

총 **8개 도메인 24개 분기** 재분류 완료. 모든 분기 응답 문자열 byte-for-byte 보존.

| 도메인 | 분기 수 | 재분류 분기 (text → error) |
|--------|--------|---------------------------|
| deals | 1 | `unknown` action |
| intelligence | 1 | `monitoring_status` 에러 (catch) |
| wiki | 1 | `wiki_auto_classify` 에러 (catch) |
| chat | 1 | `chat_telegram_recent` 에러 (catch) |
| agents | 4 | `result not_found` / `cancel not_found` / `execute invalid_args` / `execute error` |
| approval | 4 | `limit_exceeded` / `invalid_volume` / `dispatch_warning(buy)` / `dispatch_warning(sell)` |
| knowledgePipeline | 3 | `empty_text` / `missing_body` / `pipeline error` |
| notebooklm | 9 | `nb_save`/`meet_save`/`kakao_paste` × 3 (`invalid_format` / `project_not_found` / `error`) |
| **합계** | **24** | — |

#### 분기별 변경 형식
모든 분기에서 다음 한 줄만 변경:
```ts
// 변경 전
handlerResponse: { kind: "text", text: "", meta: {...} }
// 변경 후
handlerResponse: { kind: "error", text: "", meta: {...} }
```

`response` 문자열, `data` 구조, `meta` 구조, status 값 모두 그대로. dispatcher 패턴 핸들러(deals, agents, approval)에서는 분기별 조건문(`task ? "text" : "error"` 또는 `dispatch.warning ? "error" : "text"`)으로 정상/에러 분리.

#### 정상 분기 유지 목록 (변경 없음)
- deals: list (목록), text (deals_command 비-unknown sub-command)
- agents: list (목록/상태), text (결과 found, 취소 cancelled, 실행 queued, help)
- approval: list (승인 큐), report (검토 모드 buy/sell), text (정상 dispatched)
- knowledgePipeline: text (저장 성공)
- notebooklm: text (nb_command 정상 + 3개 저장 성공 분기)

### byte-for-byte 보존 여부

**100% 보존.** 24개 재분류 분기 응답 문자열 한 글자도 변경 없음.

검증 방법:
1. 단위 테스트 14건이 각 분기를 `kind="error"` 마이그레이션 vs legacy(handlerResponse 미설정) byte-for-byte 비교
2. 기존 11개 도메인 종합 회귀 단위 테스트 1건 추가 (8개 도메인이 error 활성화된 상태 + 3개 도메인은 기존 list/report/text 유지)
3. formatReply 흐름:
   - `handlerText` = `text=""` 인 경우 빈 문자열
   - `primaryBody` = `handlerText || legacy fields` → 빈 문자열 (legacy fallback)
   - `fallbackBody` = `primaryBody || safeDisplayBody(data)` → data 객체면 빈 문자열, 없으면 빈 문자열
   - 출력 = `[response, fallbackBody].join("\n\n")` = `response` (fallbackBody가 빈 문자열일 때)

`kind="text"` 와 `kind="error"` 의 차이는 **`handlerText` 추출 조건에서 통과 여부만** — 통과하면 두 kind 모두 동일한 primaryBody/fallbackBody 흐름을 거침. text="" 일 때는 어차피 통과해도 빈 문자열이라 결과 동일.

### meta 미노출 검증 결과

기존 Phase 6-A~6-D-9에서 적용된 meta 미노출 정책 그대로 유지. Phase 7-A 신규 단위 테스트 1건으로 추가 검증:
- `meta.status` (`limit_exceeded` 등 11개 status 값) → 미노출
- `meta.apiKey` (`UPBIT-API-KEY-LEAK`) → 미노출
- `meta.secret` (`secret-DO-NOT-LEAK`) → 미노출
- `meta.token` (`Bearer leak-token`) → 미노출
- `meta.internalUuid` (`internal-001`) → 미노출
- `meta.sessionId` (`session-internal-xyz`) → 미노출

formatReply.ts 의 `handlerText` 추출은 `result.handlerResponse?.text` 만 읽고 `meta`는 절대 참조하지 않음. 이 정책은 Phase 7-A에서도 동일.

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **711 passed** / 7 skipped / 2 todo (Phase 6-D-9 696 + 신규 15) |
| `npm run build` | ✅ vite 4.89s + esbuild `dist/index.js` 738.4kb (Phase 6-D-9 738.3kb 대비 +0.1kb) |

#### 신규 단위 테스트 15건 (formatReply Phase 7-A 그룹)
1. `kind=error + 비어있지 않은 text` → 기존 `kind=text` 와 byte-for-byte 동일
2. `kind=error + text=""` → legacy fallback 동작 (response 한 줄)
3. `kind=error + meta status/apiKey/secret/token/internal` 사용자 응답 미노출
4. deals `unknown` action — byte-for-byte 동일
5. agents `not_found` (result) — byte-for-byte 동일
6. approval `limit_exceeded` — byte-for-byte 동일
7. approval `invalid_volume` — byte-for-byte 동일
8. knowledgePipeline `empty_text` — byte-for-byte 동일
9. knowledgePipeline `missing_body` — byte-for-byte 동일
10. knowledgePipeline `pipeline error` — byte-for-byte 동일
11. notebooklm `invalid_format` — byte-for-byte 동일
12. notebooklm `project_not_found` — byte-for-byte 동일
13. notebooklm `error` — byte-for-byte 동일
14. **기존 list/report/text 분기 회귀 없음**
15. **11개 도메인 종합 회귀** (kind=error 활성화 후에도 정상)

기존 비활성 kind 테스트 1건 수정: `kind: "error"` → `kind: "confirmation"` 로 비활성 케이스 이동 (Phase 7-A에서 error가 활성 kind로 승격됐기 때문). 이제 비활성 kind는 `confirmation` 1개만 남음.

#### 통합 테스트 회귀 검증
- `dealRouting.test.ts:91-105` raw object 차단 — 통과
- `dealNameParsing.test.ts` — 통과
- `briefing.test.ts` `routeIntentMessage` — 통과
- `dispatchIntent.test.ts` — 통과
- 기존 696건 중 회귀 0건

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage`/`formatIntentRouteMessage` 시그니처 동결
- 24개 분기 응답 문자열 byte-for-byte 동일
- 8개 핸들러에서 단순 `kind: "text"` → `kind: "error"` 한 줄씩만 변경
- `formatReply.ts` 변경은 `handlerText` 추출 조건에 `error` 추가만 (1줄)
- 기존 list/report/text 분기 영향 없음 (error 추가는 OR 조건)
- meta/data/response 구조 모두 그대로
- 기존 11개 도메인 정상 분기(non-error) 100% 회귀 없음

### 남은 리스크
1. **`kind="confirmation"` 분기 미활성** — Phase 7-A 제약상 활성화 금지. 별도 Phase에서 검토 (approval 도메인 중심)
2. **에러 분기에 통일된 prefix 없음** — 핸들러마다 `🚫`, `⚠️`, `❌`, `🛰️` 등 다양한 emoji 사용. 통일이 필요하면 별도 Phase에서 응답 문자열 변경 동의 후 진행
3. **`meta.status` 값 중복 가능성** — `error`/`limit_exceeded`/`invalid_volume`/`dispatch_warning`/`empty_text`/`missing_body`/`invalid_format`/`project_not_found`/`not_found`/`invalid_args` 등 11개 다양한 값. 향후 통일 또는 enum 정의 필요시 별도 작업
4. **누적 잔여**: `prompts/` prod 번들 미동봉, `inferKind()` 미사용, `analysisHandler` 본문 중복 버그, `feasibility`/`finance` 헤더 인코딩 깨짐, finance 본문 포맷팅 부재, `kind="confirmation"` 정리 대기

### 다음 Phase 제안

**현재 활성화된 kind: `list` / `report` / `text` / `error` (4개). 미활성: `confirmation` (1개).**

#### 옵션 A: kind="confirmation" 정리 (권장)
- 마지막 미활성 kind. approval 도메인이 핵심 영역
- 현재 `requiresConfirmation: true` 흐름과 `kind="confirmation"` 역할 분리 결정 필요
- 분기 자체는 적음 (executeMatch 분기, formatReply의 `requiresConfirmation` 분기)
- 설계 결정 비중이 큼

#### 옵션 B: 누적 잔여 cleanup
- `prompts/` prod 번들 esbuild plugin
- `inferKind()` formatReply 본문 활성화
- `analysisHandler` 본문 중복 버그 수정
- `feasibility`/`finance` 헤더 인코딩 깨짐 정상화
- finance 본문 포맷팅 (`formatDartDisclosures` 추가)

#### 옵션 C: 응답 문자열 통일 (선택)
- 에러 분기 prefix 통일 (`⚠️` 또는 `🚫`)
- byte-for-byte 보존 원칙 깨짐 → 별도 동의 필요

#### 권장: 옵션 A → 옵션 B 순서
- 옵션 A는 5개 kind 중 마지막 비활성 분기 정리 — Phase 7 시리즈의 자연스러운 마무리
- 옵션 B는 옵션 A 완료 후 별도 cleanup phase

```
Phase 7-B 진행 — kind="confirmation" 정리:

1. 현재 confirmation 흐름 분석
   - formatReply.ts 의 `requiresConfirmation: true` 분기 (ACTION REQUIRES CONFIRMATION 헤더)
   - approval.ts 의 `requiresConfirmation: false` 정책 (텔레그램 callback에서 처리)
   - dispatchIntent.ts 의 승인 게이트 (intent.type === "execute" && !allowExecute)

2. 설계 결정
   - kind="confirmation" 을 활성화할지, 또는 미활성으로 영구 유지할지
   - requiresConfirmation 필드와 kind="confirmation" 의 역할 분리 (또는 통합)
   - approval.ts 의 confirmation gate (텔레그램 인라인 키보드)와의 관계

3. 활성화 결정 시:
   - formatReply.ts 의 handlerText 추출에 kind="confirmation" 추가
   - 기존 requiresConfirmation 분기는 유지 (별도 헤더)
   - 핸들러 분기 재분류 (예: 사전 승인 안내 = kind="confirmation")
   - 단위 테스트 추가

4. 미활성 영구 유지 결정 시:
   - intentSchemas.ts 의 HandlerResponseKind 에서 "confirmation" 제거 또는 deprecate 표시
   - 문서에 미활성 사유 명시

5. 검증: npm run check && npm test && npm run build

제약 (Phase 7-B 동일):
- routeIntentMessage / formatIntentRouteMessage public API 시그니처 동결
- 마이그레이션된 핸들러도 응답 문자열 byte-for-byte 유지
- planIntent 멀티스텝 분해 구현 금지
- fallbackIntent.ts 수정 금지
- 자동 commit/push 금지
```

---

## Phase 7-B 구현 로그

### 변경일
2026-05-09

### 변경 파일 목록

**수정 (2개) + 문서 (1개)**
- `server/intent/pipeline/formatReply.ts` — `handlerText` 추출 조건에 `kind === "confirmation"` 추가 (모든 5개 kind 활성화). `requiresConfirmation: true` 분기에 두 흐름의 직교성 명시 주석 추가
- `server/__tests__/formatReply.test.ts` — Phase 7-B `kind="confirmation"` 회귀 단위 테스트 8건 추가 + 기존 비활성 kind 테스트 1건 변경 (handlerResponse 미설정 케이스로 전환)
- `docs/refactor/intent-service-refactor-plan.md` — 본 로그

### confirmation 역할 정의

`requiresConfirmation` 필드와 `handlerResponse.kind === "confirmation"` 마커는 **직교(orthogonal)** 관계.

#### `requiresConfirmation: true` (실행 승인 게이트)
- **출처**: `dispatchIntent.ts:46`의 승인 게이트 (`intent.type === "execute" && !allowExecute`)
- **목적**: execute 인텐트가 명시적 `allowExecute: true` 없이 들어왔을 때 차단
- **출력**: `formatReply.ts:128`의 `ACTION REQUIRES CONFIRMATION` 헤더 분기
- **헤더 내용**: 4~5줄 (헤더, response, intent 정보, params preview, next 가이드)
- **사용처**: 텔레그램/웹 채팅에서 사용자가 위험한 execute 명령 보낼 때 자동 차단
- **수정 금지** (Phase 7-B 제약상 동작 변경 금지)

#### `handlerResponse.kind === "confirmation"` (응답 형태 마커)
- **출처**: 핸들러가 `handlerResponse: { kind: "confirmation", text, meta }` 반환
- **목적**: "사용자에게 승인/확인이 필요한 응답 형태" 구조화 마커
- **출력**: `formatReply.ts:170`의 `handlerText` 추출 조건에 포함 → `text` 분기와 byte-for-byte 동일 처리
- **자동 prefix/헤더 추가 금지** — 핸들러가 response에 모든 사용자 가치 포함
- **사용처 (현재)**: **핸들러 재분류 안 함** — 보조 마커 용도. Phase 7-B에서는 formatReply 활성화만 진행

#### 직교성 (orthogonality) 보장
- 두 흐름이 동시에 true이면 `requiresConfirmation` 분기가 항상 먼저 처리됨 (`formatReply.ts:123`이 `:170` 보다 위에 있음)
- 따라서 `kind="confirmation"` 활성화로 인해 기존 `requiresConfirmation` 헤더 동작이 깨질 가능성 0
- 단위 테스트 1건으로 직교성 검증 완료 (`requiresConfirmation: true + kind="confirmation"` 조합에서 헤더 우선 출력)

### requiresConfirmation과 kind="confirmation"의 차이

| 항목 | `requiresConfirmation: true` | `kind="confirmation"` |
|------|----------------------------|----------------------|
| 생성 주체 | dispatchIntent (승인 게이트) | 핸들러 (응답 마커) |
| 트리거 조건 | `intent.type === "execute" && !allowExecute` | 핸들러 명시적 설정 |
| 출력 형태 | 5줄 ACTION REQUIRES CONFIRMATION 헤더 | response\n\ntext (text 분기와 동일) |
| 자동 prefix | "ACTION REQUIRES CONFIRMATION" 자동 추가 | 추가 없음 (byte-for-byte) |
| confirmation 필드 | `{ action, domain, params }` 채워짐 | 채워지지 않음 |
| Phase 7-B 동작 | 기존 동작 100% 유지 | 신규 활성 (text와 동일 처리) |

### 핸들러 재분류 여부

**없음.** Phase 7-B 사용자 지시 ("불확실하면 핸들러 재분류하지 말고 formatReply 활성화 + 문서화만")에 따라 핸들러 변경 없음.

검토한 후보:
- `approval.ts` `tradingBuySignal/SellSignal` 발송 성공 분기 — "텔레그램에서 승인 버튼을 눌러주세요" 안내가 confirmation 의미를 가짐. **단**, 현재 `kind="text"`로 마이그레이션 완료된 상태이고, response는 텔레그램 승인 큐 등록 안내(`📡 매수 신호 발송`)이지 사용자 직접 승인 요청이 아님. 의미적으로 모호하여 재분류 보류
- `dispatchIntent.ts` 승인 게이트 응답 — 이미 `requiresConfirmation: true`로 처리되어 별도 핸들러 마커 불필요

결론: 현재 시스템에서 `kind="confirmation"`이 명확히 적합한 핸들러 분기 없음. **보조 마커로만 활성화**, 향후 명시적 confirmation 응답이 필요한 신규 핸들러가 추가될 때 사용.

### byte-for-byte 보존 여부

**100% 보존.** 

검증:
- 핸들러 변경 없음 → 응답 문자열 변경 가능성 0
- formatReply 변경은 `handlerText` 추출 조건의 OR 조건에 `confirmation` 추가만 (한 줄) — list/report/text/error 분기 영향 없음
- `requiresConfirmation: true` 분기의 `ACTION REQUIRES CONFIRMATION` 헤더 흐름 그대로 (line 123 분기 동일)
- `dispatchIntent.ts` 승인 게이트 변경 없음
- approval/trading 핸들러 변경 없음

### 테스트 결과

| 명령 | 결과 |
|------|------|
| `npm run check` | ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건 |
| `npm test` | ✅ **719 passed** / 7 skipped / 2 todo (Phase 7-A 711 + 신규 8) |
| `npm run build` | ✅ vite 4.89s + esbuild `dist/index.js` 738.5kb (Phase 7-A 738.4kb 대비 +0.1kb) |

#### 신규 단위 테스트 8건 (formatReply Phase 7-B 그룹)
1. `kind=confirmation + 비어있지 않은 text` → 기존 `kind=text` 와 byte-for-byte 동일
2. `kind=confirmation + text=""` → legacy fallback 동작
3. `kind=confirmation + meta` 노출 위험 키 (apiKey/secret/token/internal/sessionId/botToken) 사용자 응답 미노출
4. `requiresConfirmation: true` 기존 헤더 동작 유지 (Phase 4 승인 게이트 회귀 검증)
5. **`requiresConfirmation: true + handlerResponse.kind=confirmation` 조합** — `requiresConfirmation` 헤더 우선 출력 (직교성 검증)
6. `requiresConfirmation: false + kind=confirmation` → text 분기와 동일 처리
7. **기존 list/report/text/error 분기 회귀 없음**
8. **11개 도메인 종합 회귀** (kind=confirmation 활성화 후에도 정상)

기존 비활성 kind 테스트 1건 변경: 이전에 `kind: "confirmation"`을 비활성 케이스로 사용하던 테스트를 "handlerResponse 미설정 (미마이그레이션 핸들러)" 케이스로 변경. 5개 kind 모두 활성화됐으므로 비활성 시나리오는 더 이상 의미 없음.

#### 통합 테스트 회귀 검증
- `dealRouting.test.ts:91-105` raw object 차단 — 통과
- `dealNameParsing.test.ts` — 통과
- `briefing.test.ts` `routeIntentMessage` — 통과
- `dispatchIntent.test.ts` (승인 게이트 회귀) — 통과
- `approvalQueue.test.ts` — 도메인 단위 테스트, 회귀 무관 통과
- 기존 711건 중 회귀 0건

### 기존 동작 영향 여부
**없음.**
- `routeIntentMessage`/`formatIntentRouteMessage` 시그니처 동결
- `requiresConfirmation` 흐름 100% 유지 (헤더 분기 line 123 그대로)
- dispatchIntent 승인 게이트(`intent.type === "execute" && !allowExecute`) 동작 변경 없음
- approval.ts 텔레그램 callback 흐름 변경 없음
- trading 승인/검토 모드 응답 변경 없음
- 핸들러 재분류 0건 → 응답 문자열 byte-for-byte 동일
- 기존 list/report/text/error 분기 100% 회귀 없음

### 남은 리스크
1. **`kind="confirmation"` 활성 마커이지만 현재 사용 핸들러 0건** — 보조 마커 상태. 향후 신규 핸들러가 confirmation 응답을 명시적으로 만들 때까지 미사용. 인프라만 갖춰진 상태
2. **`requiresConfirmation` 분기의 `ACTION REQUIRES CONFIRMATION` 헤더 형식** — 영문 헤더 + 4~5줄 구조. 향후 한국어로 통일 또는 단순화 검토 가능 (별도 작업)
3. **핸들러 confirmation 마이그레이션 가이드라인 부재** — 향후 신규 핸들러 작성 시 `kind="confirmation"`이 적합한 케이스 판단 가이드 필요. CLAUDE.md 또는 docs/handler-conventions.md에 정리 권장
4. **누적 잔여**: `prompts/` prod 번들 미동봉, `inferKind()` 미사용, `analysisHandler` 본문 중복 버그, `feasibility`/`finance` 헤더 인코딩 깨짐, finance 본문 포맷팅 부재

---

## ✅ Phase 7 시리즈 완료 선언

**2026-05-09 — Phase 7 시리즈 (kind 분기 정리) 완료.**

### 5개 kind 모두 활성화 완료
| kind | 활성화 Phase | 사용 도메인 |
|------|-------------|-----------|
| `list` | 6-A | google, finance, wiki, chat, agents, approval |
| `report` | 6-B | trading, realestate, intelligence, approval (review_mode) |
| `text` | 6-C | deals, realestate, wiki, chat, agents, approval, knowledgePipeline, notebooklm |
| `error` | **7-A** | deals, intelligence, wiki, chat, agents, approval, knowledgePipeline, notebooklm |
| `confirmation` | **7-B** | (보조 마커 — 사용 핸들러 0건, 인프라만 활성화) |

### 누적 테스트 통과 추이 (Phase 5 → 7-B)
- Phase 5 시작: 586 passed
- Phase 6-D 시리즈 종료: 696 passed (+110)
- Phase 7-A 종료: 711 passed (+15)
- **Phase 7-B 종료: 719 passed (+8)** ← 최종

### 빌드 크기 추이
- Phase 5 시작: `dist/index.js` 722.5kb
- **Phase 7-B 종료: `dist/index.js` 738.5kb (+16.0kb 누적)**

### 핵심 성과
1. **public API 시그니처 100% 동결** — `routeIntentMessage` / `formatIntentRouteMessage` 한 글자도 변경 없음
2. **응답 문자열 byte-for-byte 100% 보존** — 모든 분기 출력 동일
3. **`HandlerResponseKind` 5개 enum 모두 활성** — list/report/text/error/confirmation
4. **`requiresConfirmation` 흐름과 `kind="confirmation"` 직교성 명시** — 두 흐름 충돌 없음
5. **raw object/사용자 원문/토큰/시크릿 사용자 응답 0건 노출** — meta 정책 일관 적용

---

## 다음 Phase 제안

**모든 5개 kind 활성화 완료. Phase 7 시리즈 마무리. 다음은 누적 cleanup 작업 또는 새 영역.**

### 옵션 A: Phase 8 — 누적 잔여 cleanup (권장)
- `prompts/` prod 번들 esbuild plugin
- `inferKind()` formatReply 본문 활성화
- `analysisHandler` 본문 중복 버그 수정
- `feasibility`/`finance` 헤더 인코딩 깨짐 정상화
- finance 본문 포맷팅 (`formatDartDisclosures` 추가)

각 항목은 독립적이라 별도 Phase(8-A, 8-B, ...)로 분리 권장.

### 옵션 B: 핸들러 convention 가이드라인 문서 작성
- `docs/handler-conventions.md` 신규 — 신규 핸들러 작성 가이드
- kind 매핑 결정 트리, meta 정책, byte-for-byte 보존 원칙
- 향후 새 핸들러 추가 시 일관성 보장

### 옵션 C: 응답 문자열 통일 작업 (별도 동의 필요)
- 에러 분기 prefix 통일 (`⚠️` 또는 `🚫`)
- `ACTION REQUIRES CONFIRMATION` 헤더 한국어화
- byte-for-byte 보존 원칙 깨짐 → 명시적 동의 필요

### 옵션 D: planIntent 멀티스텝 분해 구현
- Phase 3에서 stub으로 도입된 planIntent를 실제 분해 엔진으로 진화
- 멀티스텝 인텐트 처리 (예: "BTC 분석하고 매수 시뮬해줘" → 2단계)
- routeIntentMessage 흐름 변경 필요 → 큰 작업

#### 권장: 옵션 A → 옵션 B → 옵션 C → 옵션 D 순서
- 옵션 A는 누적 잔여 정리로 가장 시급
- 옵션 B는 옵션 A 후 안정화 단계에서 가이드 문서화
- 옵션 C/D는 별도 큰 영역 작업으로 후순위

```
Phase 8-A 진행 — prompts/ prod 번들 esbuild plugin (제안):

1. esbuild 설정에 prompts/ 폴더 복사 plugin 추가
   - package.json build 스크립트 또는 별도 esbuild config
   - dist/server/intent/prompts/*.md 로 복사

2. promptLoader.ts 의 FALLBACK_CLASSIFIER_PROMPT 인메모리 fallback 제거 검토
   - 또는 prod에서도 .md 파일 우선 사용 + 인메모리 fallback 유지 (안전)

3. 검증:
   - npm run build → dist/server/intent/prompts/classifier.md 존재 확인
   - npm start → 운영 모드에서 .md 파일 로드 정상 동작
   - npm test → 회귀 0건

제약:
- routeIntentMessage / formatIntentRouteMessage public API 시그니처 동결
- 핸들러 응답 문자열 byte-for-byte 유지
- 자동 commit/push 금지
```

---

## Phase 8-A 구현 로그 — prompts/ 프로드 번들링 (2026-05-09, Claude Code)

### 변경일
2026-05-09

### 선택 방식
**A안: copy script** — `tsx scripts/copy-intent-prompts.ts`를 `npm run build` 마지막 단계에 체이닝.
B안(esbuild plugin) 미선택 이유: 현재 `package.json` build가 esbuild CLI 한 줄 호출로 충분하므로 별도 esbuild config 파일을 추가하면 구성 복잡도만 늘어남.

### 변경 파일
- **신규** `scripts/copy-intent-prompts.ts` — `server/intent/prompts/*.md` → `dist/prompts/`로 복사 (45줄)
- **신규** `server/__tests__/promptLoader.test.ts` — 8개 단위 테스트
- **수정** `package.json` build 스크립트 — `... --outdir=dist && tsx scripts/copy-intent-prompts.ts` 1줄 추가
- **수정** `docs/refactor/intent-service-refactor-plan.md` — 본 구현 로그 추가

### 복사 경로
- src: `server/intent/prompts/{classifier.md, planner.md}`
- dst: `dist/prompts/{classifier.md, planner.md}`
- 근거: bundled `dist/index.js`에서 `import.meta.url`이 `dist/index.js`로 해석되므로 `promptLoader.ts`의 `PROMPTS_DIR = path.resolve(path.dirname(...), "prompts")`가 자동으로 `dist/prompts/`를 가리킨다. **`promptLoader.ts` 수정 0줄**.

### Fallback 유지 여부
**유지**. `FALLBACK_CLASSIFIER_PROMPT` 인메모리 안전망과 `loadIntentPromptSafe(...) ?? FALLBACK_CLASSIFIER_PROMPT` 호출 패턴 모두 그대로. 운영 시 .md 파일이 사라지거나 권한 오류로 읽지 못해도 분류가 멈추지 않는다.

### 테스트 결과
- `npm run check` ✅ 모듈 경계 위반 0건 + tsc 에러 0건
- `npm test` ✅ **727 passed** (719 → +8 신규 promptLoader 테스트, 회귀 0건)
- `npm run build` ✅ vite 5.34s + esbuild + copy-intent-prompts 모두 성공
- `dist/prompts/classifier.md` (1795B) ✅
- `dist/prompts/planner.md` (947B) ✅

### 응답 / API 영향
- `routeIntentMessage` / `formatIntentRouteMessage` public API 변경 0건
- 핸들러 응답 문자열 byte-for-byte 동일
- `intent/pipeline/*` 로직 변경 0건
- `handlerResponse` 스키마 변경 0건
- 핸들러 파일 수정 0건
- prompt 내용 변경 0건

### 다음 Phase 제안
- **Phase 8-B** `inferKind()` formatReply 본문 활성화 — 현재 export만 됨. 미분류 핸들러 응답에 자동 kind 부여 (응답 변경 없음)
- **Phase 8-C** `analysisHandler` 본문 중복 버그 수정 (응답 변경 동의 필요)
- **Phase 8-D** `feasibility`/`finance` 헤더 인코딩 깨짐 정상화 (응답 변경 동의 필요)
- **Phase 8-E** finance 본문 포맷팅 (`formatDartDisclosures`)

