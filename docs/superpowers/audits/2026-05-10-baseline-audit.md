# 베이스라인 코딩 안정화 — Audit (Phase A 측정)

- 작성일: 2026-05-10
- 대상: 베이스라인 (`main` 브랜치, 워크트리 `claude/blissful-rubin-98d15e`, HEAD `0d2a01c`)
- 범위: 타입 / 테스트 / 데드코드 / 큰 파일 / 의존성 / 번들 / 거버넌스
- 산출물: 본 문서 (read-only audit). 실행/수정 없음.

---

## 1. 한눈에 보는 지표

| 항목 | 현재 | 목표 (게이트 그린 기준) |
|---|---|---|
| `pnpm run check` (tsc) | **36 에러 / 9 파일** | 0 |
| `pnpm run test` | 76개 중 4 fail / 6 skip / 66 pass | 0 fail (skip은 사유 명시) |
| `pnpm run build` | 통과 (3.81s + esbuild 22ms) | 유지 |
| 메인 번들 크기 | `index-*.js` 707KB / gzip 212KB | 단일 chunk → split 권장 |
| ESLint 설정 | **없음** | 최소 셋 도입 |
| Prettier 설정 | 있음 (`.prettierrc` 루트) | 유지 |
| GitHub Actions CI | **없음** | 셋업 권장 |
| 모듈 경계 검사 | 없음 | (베이스라인 규모상 필수 아님) |
| Dead code 추정 | client 약 **2,003줄** | 삭제 대상 명확 |
| Outdated 패키지 | **50개** (마이너 약 26 + 메이저 약 14) | 마이너 일괄, 메이저 선별 |
| 보안 취약점 (`pnpm audit`) | high급 다수 (대부분 transitive·dev) | vite·pnpm·tar 우선 |

---

## 2. tsc 에러 카테고리 (총 36개)

원본: `.claude/audit-tsc.txt` (worktree 내, 커밋 안 함)

| 카테고리 | 건수 | 영향 파일 | 근본 원인 | 수정 난이도 |
|---|---:|---|---|---|
| **A1. forge 환경변수 미정의** | **30** | `_core/dataApi.ts(6)`, `_core/imageGeneration.ts(6)`, `_core/map.ts(2)`, `_core/notification.ts(4)`, `_core/storageProxy.ts(4)`, `_core/voiceTranscription.ts(6)`, `storage.ts(2)` | `getEnv()` 반환 타입 `{ appId, cookieSecret, databaseUrl }`에 `forgeApiUrl`/`forgeApiKey` 누락. 7개 파일이 사용. | **저** — env 타입에 두 필드 추가 (또는 사용처 정리) |
| **A2. lucide-react `title` prop** | **2** | `client/src/components/UnifiedChatInterface.tsx:205,207` | lucide v0.453에 `title` prop 미지원 → `aria-label` 또는 wrapper로 교체 | **저** — 2줄 |
| **A3. `server/google/auth.ts:8` default import** | **1** | `server/google/auth.ts` | `server/llm/session`에 default export 없음 → named import 필요 | **저** — 1줄 |
| **A4. Gemini `googleSearch` tool 옵션** | **1** | `server/llm/caller.ts:148` | `@google/generative-ai` 신 버전이 `googleSearch` 키를 거부. 정확한 키는 `googleSearchRetrieval` (또는 SDK 버전 다운/업) | **중** — SDK API 호환 확인 필요 |
| **A5. ASCII** | — | — | 그 외 카테고리 없음 | — |

→ **A1 수정 1건으로 30개 에러 해소.** A2~A4까지 합치면 **36개 모두 5건의 변경으로 정리**.

---

## 3. 테스트 안정성 (vitest 76건 중)

원본 결과: 4 fail / 6 skip / 66 pass / 1.53s 실행

| 분류 | 건수 | 파일 | 원인 |
|---|---:|---|---|
| Pass | 66 | 8개 spec | 정상 |
| **Fail (env 의존)** | **4** | `server/llm/gemini.test.ts(3)`, `server/llm/telegram-token.test.ts(1)` | `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN` 환경변수 부재. 운영 모드에서는 필수지만 CI/dev에선 missing이 정상 |
| Skip | 6 | 미확인 (vitest 출력에서 단순 카운트만) | 확인 후 sunset 또는 활성 결정 필요 |

**권장:**
- `it.skipIf(!process.env.X)` 패턴으로 conditional skip 변경 → CI에서 fail 안 함
- skip 6건 정체 파악

신규 추가 (오늘 PDF 첨부): **19건 모두 pass**, env 의존 없음. 

---

## 4. Dead code (client)

| 파일 | LOC | 상태 | 근거 |
|---|---:|---|---|
| `client/src/pages/ComponentShowcase.tsx` | **1,405** | **확실 dead** | `App.tsx` 라우팅에 없음, 어떤 코드 파일도 import 안 함 (grep 0 hit). 자기 자신 + 문서 파일 3개에서만 언급 |
| `client/src/components/ChatInterface.tsx` | 292 | **dead 후보** | 사용처: ComponentShowcase(dead) + 자기 자신 + UnifiedChatInterface가 import 안 함 |
| `client/src/components/AIChatBox.tsx` | 306 | **dead 후보** | 동일 — ComponentShowcase에서만 사용 |
| **합계** | **2,003** | | client/src 전체의 상당 비중 |

`UnifiedChatInterface.tsx`(419줄)는 `pages/Chat.tsx`에서 라이브 사용 중 → 보존.

**삭제 시 효과:**
- 유지보수 면적 약 2,000줄 감소
- A2 lucide-react `title` 에러는 UnifiedChatInterface에 있어 ComponentShowcase 삭제로는 해결 안 됨 (별도 수정 필요)
- 번들 크기 영향 — 라우팅에 없으므로 이미 tree-shake되어 번들 영향 0 (확인 필요, 아닐 수 있음)

---

## 5. 큰 파일 (LOC > 400, 그 외 상위 25개)

| LOC | 파일 | 분류 | 비고 |
|---:|---|---|---|
| 1,405 | `client/src/pages/ComponentShowcase.tsx` | **dead** | 삭제 대상 |
| 680 | `client/src/components/ui/sidebar.tsx` | shadcn 표준 | 건드리지 않음 |
| 419 | `client/src/components/UnifiedChatInterface.tsx` | 라이브, 큼 | 분리 검토 가능 (단, 운영 우선순위 낮음) |
| 320 | `client/src/components/ui/chart.tsx` | shadcn 표준 | 건드리지 않음 |
| 306 | `client/src/components/AIChatBox.tsx` | dead 후보 | 삭제 검토 |
| 301 | `client/src/components/ApiSettingsModal.tsx` | 라이브 | 적정 |
| 295 | `server/routers/google-workspace.ts` | 라이브 | 적정, 단일 라우터로는 다소 큼 |
| 292 | `client/src/components/ChatInterface.tsx` | dead 후보 | 삭제 검토 |
| 283 | `server/llm/telegram-bot.ts` | 라이브 | 적정 |
| 277 | `server/_core/map.ts` | 라이브 (forge 의존) | A1 수정 후 OK |
| 267 | `server/_core/voiceTranscription.ts` | 라이브 (forge 의존) | A1 수정 후 OK |
| 232 | `server/llm/caller.ts` | 라이브 (A4 영향) | API 호환 수정 필요 |

→ **운영 코드 중 진짜로 큰 파일은 `UnifiedChatInterface.tsx`(419) 1개**. 안정화 대상으로는 우선순위 낮음.

---

## 6. 의존성 (50개 outdated)

원본: `.claude/audit-outdated.txt`

### 6.1 마이너 업데이트 (안전, 약 26개)
radix-ui 6종, mysql2, nanoid, postcss, react, react-dom, axios, jose, openai, prettier, react-hook-form, tailwind-merge, tsx, wouter, zod, framer-motion, autoprefixer, @aws-sdk/* 2종, @tanstack/react-query, @trpc/* 3종, types/google.maps, types/react, types/react-dom 등.

→ **권장**: `pnpm update` 한 번에 처리. 회귀 가드는 vitest로 충분.

### 6.2 메이저 업데이트 (선별 검토 필요, 약 14개)

| 패키지 | 현재 → 최신 | 위험도 | 비고 |
|---|---|---|---|
| `lucide-react` | 0.453 → 1.14 | **중** | 메이저지만 보통 호환 — A2 `title` 이슈도 같이 해결될 수 있음 |
| `vite` | 7.1 → 8.0 | 중 | 보안 취약점 해소 동반 |
| `vitest` | 2.1 → 4.1 | **고** | mocking API 변경 가능 — 우리 `vi.hoisted` + `node:fs/promises spy` 패턴 영향 검증 필요 |
| `express` | 4.21 → 5.2 | **고** | breaking changes (router, error handling) — server 전체 회귀 위험 |
| `recharts` | 2.15 → 3.8 | 중 | UI 영향, 차트 사용 페이지 회귀 |
| `react-day-picker` | 9.11 → 10.0 | 중 | API 변경 가능 |
| `react-resizable-panels` | 3.0 → 4.11 | 중 | API 변경 가능 |
| `streamdown` | 1.4 → 2.5 | 저 | 사용처 적음 |
| `superjson` | 1.13 → 2.2 | 저 | tRPC 호환 확인 |
| `@vitejs/plugin-react` | 5.0 → 6.0 | 저 | vite 메이저와 묶음 |
| `typescript` | 5.9 → 6.0 | **고** | 언어 메이저, 보수적으로 보류 권장 |
| `pnpm` | 10.18 → 11.0 | 중 | lockfile 호환 |
| `esbuild` | 0.25 → 0.28 | 저 | 빌드 도구 마이너 |
| `@types/node` | 24 → 25 | 저 | Node v25 LTS 시점에 업그레이드 |

→ **권장 순서**: lucide-react 우선 (A2 해결 동반) → vite + plugin-react (보안 + chunk split 옵션) → 나머지는 분리 PR로.

### 6.3 보안 취약점 (high)
요약 (전체는 `.claude/audit-vuln.txt`):

- **vite 7.1~7.3** — `server.fs.deny` bypass, dev server 임의 파일 읽기. → 8.x 업그레이드로 해소 (dev-only 영향)
- **pnpm 10.0~10.26** — lifecycle script bypass, lockfile integrity. → 10.26+ 또는 11로
- **node-tar < 7.5.10** — path traversal 다수 (transitive)
- **rollup 4 < 4.59** — path traversal (vite 종속)
- **path-to-regexp < 0.1.13** — ReDoS (express 종속)
- **picomatch < 4.0.4** — ReDoS (transitive)
- **lodash <= 4.17.23** — `_.template` code injection (transitive, 직접 사용 없음 추정)

대부분 **transitive 또는 dev/build-time**. 운영 런타임 직접 위협은 vite·express 라인. **express 5 업그레이드 필요 시 path-to-regexp 자동 해소.**

---

## 7. 번들

```
dist/public/assets/
  index-DArR0rT3.js    707.1 KB  (gzip 212.0 KB)
  index-DgCJI__W.css   132.6 KB  (gzip  20.4 KB)
```

- 단일 JS chunk → vite의 chunk 500KB+ 경고 발생
- shadcn/ui + Radix UI 다수 + recharts + framer-motion 등 무거운 라이브러리 다수 포함
- **개선 가능**: `vite.config.ts`의 `build.rollupOptions.output.manualChunks`로 vendor 분리 → 초기 로딩 향상
- 또는 **dynamic import**로 페이지별 split (`Home`은 홈 전용, `Chat`은 chat 전용)

운영 안정성보다는 UX 최적화 영역. 게이트 그린화 후 별도 작업.

---

## 8. 거버넌스 누락

| 항목 | 현재 | 권장 |
|---|---|---|
| **ESLint** | 설정 없음 | `eslint.config.js` (flat config) + `@typescript-eslint`, `eslint-plugin-react-hooks` 최소 셋 |
| Prettier | `.prettierrc` 있음 | 유지 |
| **CI** | `.github/workflows/` 없음 | GitHub Actions 셋업 — `check + test + build` 3 단계 그린 강제 |
| 사전 커밋 훅 | husky/lefthook 없음 | (선택) lint-staged + format only |
| TypeScript strict | `strict: true` (양호) | 유지. `noUnusedLocals`/`noUnusedParameters` 추가 시 경고 폭증 가능 — 단계적 |

---

## 9. 우선순위 매트릭스

| | 운영 영향 高 | 운영 영향 低 |
|---|---|---|
| **수정 난이도 低** | **즉시 fix 큐** ⓐ A1 forge env (30/36 에러) ⓑ A2 lucide title (2 에러) ⓒ A3 session import (1) ⓓ env 의존 테스트 conditional skip (4 fail) ⓔ ComponentShowcase 삭제 (1,405줄) | ⓕ 마이너 dep 일괄 update ⓖ ChatInterface/AIChatBox dead 정리 (598줄) |
| **수정 난이도 高** | **별도 spec 필요** ⓗ A4 Gemini SDK 호환 ⓘ vite 8 + 보안 취약점 해소 ⓙ ESLint + CI 셋업 | ⓚ 메이저 dep 업그레이드 (vitest/express/typescript) ⓛ 번들 split (vendor + 페이지) ⓜ UnifiedChatInterface 분리 |

---

## 10. 권장 다음 단계 (Phase B/C 진입 시)

가장 가성비 높은 묶음은 **즉시 fix 큐 ⓐ~ⓔ + ⓖ + ⓕ**:

1. **타입 게이트 회복** (ⓐ + ⓑ + ⓒ + ⓗ)
   → 36 에러 → 0. `pnpm run check`가 머지 게이트로 사용 가능해짐.
   추정 시간: 60~90분 (ⓗ는 SDK 문서 확인 포함)

2. **테스트 안정화** (ⓓ)
   → `it.skipIf` 적용. CI에서 4 fail 제거.
   추정 시간: 15~20분

3. **Dead code 제거** (ⓔ + ⓖ)
   → ComponentShowcase + ChatInterface + AIChatBox 삭제. ~2,000줄 정리.
   추정 시간: 30분 (build·test로 회귀 확인)

4. **마이너 의존성 일괄 업데이트** (ⓕ)
   → `pnpm update` (마이너만). vitest 통과 확인.
   추정 시간: 15~20분

**합계 약 2~3시간**으로 게이트 그린 + dead code 정리 + 마이너 dep 갱신 가능.

별도 큰 작업 (**ⓘ vite 8 + 보안**, **ⓙ ESLint + CI**, **ⓚ 메이저 dep**, **ⓛ 번들 split**)은 각각 spec 단위로 분리 권장.

---

## 11. 부록 — 원본 데이터

워크트리 내 (커밋 안 함, gitignore 권장):
- `.claude/audit-tsc.txt` — tsc 36 에러 풀 출력
- `.claude/audit-outdated.txt` — pnpm outdated 50개
- `.claude/audit-vuln.txt` — pnpm audit 1162줄 (high급 취약점 다수)

---

## 12. 의사결정 포인트 (회장님 결정 필요)

이 audit 결과로 분기 판단이 필요한 두 가지:

**Q1. 베이스라인을 codex 라인으로 흡수할 것인가?**
- 흡수 시: 이번 fix 큐의 일부(특히 ⓐ A1 forge env, ⓔ ComponentShowcase)는 codex 라인에서 다시 작업해야 할 수 있음
- 별도 유지 시: 베이스라인 자체를 게이트 그린으로 유지하는 가치 큼

**Q2. ComponentShowcase·ChatInterface·AIChatBox는 진짜로 dead인가?**
- 회장님이 향후 컴포넌트 데모 페이지로 다시 라우팅할 계획이 있다면 보존
- 정말 사용 안 한다면 ~2,000줄 감량은 큰 가치

→ Phase B(분류) 진입 전, 위 두 질문에 답변이 있으면 plan 정확도 상승.
