# Aston Wiki Phase 1a — 수동 저장·검색 시스템 설계

> 작성일: 2026-04-30 | 브랜치: codex-google-workspace-expansion

---

## 목표

회장님이 텔레그램·웹채팅에서 `위키 저장 …` 명령으로 메모를 저장하고,
`위키 검색 …` 명령으로 검색할 수 있는 최소 인프라.

Phase 1b(자동 모닝 브리핑) / 1c(MTProto 채널 수집) / 1d(Gemini 자동 분류)의 토대.

---

## 범위

**In Phase 1a**
- 마크다운 파일 기반 wiki 저장소 (외부 경로, `WIKI_ROOT` 환경변수)
- 텔레그램·웹채팅 인텐트: `위키 저장 …` / `위키 검색 …`
- 한국어 자유 카테고리 + 영문 정규화 매핑
- 단순 substring 검색 (의존성 0)
- vitest 단위 테스트

**Out (Phase 1b 이후)**
- node-cron, MTProto User API, Gemini 자동 분류, 모닝 브리핑

---

## 신규/수정 파일

| 파일 | 종류 | 예상 줄수 |
|------|------|-----------|
| `server/wiki/wikiStore.ts` | 신규 | ~130 |
| `server/intent/wiki.ts` | 신규 | ~130 |
| `server/__tests__/wiki.test.ts` | 신규 | ~150 |
| `server/intent/intentService.ts` | 수정 (~8줄) | — |
| `.env.example` | 수정 (1줄) | — |

패키지 설치 없음 (Node.js 내장 `fs`, `path`, `os` 만 사용).

---

## 환경변수

```
WIKI_ROOT=G:\내 드라이브\Aston-Wiki
```

미설정 시: 서버 부팅 차단 안 함. 저장/검색 호출 시 한국어 안내 메시지 반환.

---

## 데이터 레이아웃

```
G:\내 드라이브\Aston-Wiki\
├── 2026-04-30\
│   ├── 14-32-15-742-신논현_매물_검토.md
│   └── 15-08-42-188-BTC숏_진입_메모.md
└── 2026-04-29\
    └── 09-15-30-001-PF_3차_협상.md
```

파일 포맷:
```markdown
---
id: 2026-04-30T14-32-15-742
date: 2026-04-30T05:32:15.742Z
title: 신논현 매물 검토
categories: [realestate, seoul]
source: telegram
---

평당 1.2억, 매도자 88세, 자녀가 빨리 정리 원함
```

---

## 인텐트 매칭

| 인텐트 | 정규식 | type | confidence |
|--------|--------|------|-----------|
| `wiki_save` | `/^위키\s*저장\s+(.+)/s` | query | 0.95 |
| `wiki_search` | `/^위키\s*검색\s+(.+)/s` | query | 0.95 |

intentService.ts 변경분 (~8줄):
- import 1줄
- `IntentAction` 유니온에 `wiki_save \| wiki_search` 추가
- `fallbackIntent()` 최상단에 wiki 매칭 삽입
- `routeIntentMessage()` wiki 핸들러 분기 추가

---

## 저장 파싱 (`wiki_save`)

1. 입력에서 `위키 저장 ` 제거
2. `#태그` 추출 → categories (원문에서 제거)
3. 한→영 매핑 테이블 적용. 미매핑 = 한글 소문자 슬러그
4. 첫 마침표·줄바꿈 전까지 → title; 없으면 첫 30자
5. categories 비면 `["미분류"]`
6. 본문 3자 미만 → 거부
7. ID = `YYYY-MM-DDTHH-mm-ss-SSS` (KST 기준 디렉토리/파일명, UTC ISO date 메타저장)
8. 파일명 슬러그: 제목 → 공백→`_` → 윈도우 금지문자 제거 → 30자 컷
9. 동일 ms 충돌 시 `-2`, `-3` suffix

저장 응답:
```
✅ 위키 저장 완료
📌 신논현 매물 검토
🏷 #realestate #seoul
📅 2026-04-30 14:32
```

카테고리 없을 때:
```
✅ 위키 저장 완료 (#미분류로 저장됨)
📌 신논현 매물 검토
📅 2026-04-30 14:32
```

---

## 검색 파싱 (`wiki_search`)

1. 입력에서 `위키 검색 ` 제거
2. 첫 토큰이 `#카테고리` 이면 카테고리 필터로 분리
3. `WIKI_ROOT` 아래 모든 `.md` 파일 순회 (`fs.readdir` 재귀)
4. frontmatter 정규식 파싱
5. 카테고리 필터 적용 (있으면)
6. 제목 + 본문 lowercase substring 매칭
7. date desc 정렬
8. 상위 10개

응답 예시:
```
🔍 위키 검색: "신논현" — 3건

📌 신논현 매물 검토 (4/30, #realestate #seoul)
   평당 1.2억, 매도자 88세, 자녀가 빨리 정리...

📌 신논현역 PF 회의록 (4/15, #realestate)
   3차 협상 결렬, 5월 재개 예정...
```

0건 응답:
```
🔍 "신논현" 검색 결과 없음
(저장된 wiki: 47건)
```

---

## 카테고리 매핑 테이블

```ts
const CATEGORY_MAP: Record<string, string> = {
  "부동산": "realestate", "부동산PF": "realestate", "PF": "realestate",
  "트레이딩": "trading", "매매": "trading",
  "코인": "crypto", "암호화폐": "crypto",
  "주식": "stock",
  "가족": "family",
  "회사": "company", "회사운영": "company",
  "법무": "legal", "계약": "legal",
  "몽골": "mongolia",
  "리서치": "research",
  "전략": "strategy", "개인전략": "strategy",
  "AI": "ai", "워크스테이션": "ai",
  "매크로": "macro", "거시": "macro",
  "서울": "seoul",
};
```

미매핑 입력: `raw.toLowerCase().replace(/\s+/g, "")` 슬러그로 사용.

---

## 에러 처리

- 모든 `fs.*` 호출 try-catch
- catch 블록: `console.error("[wikiStore] …:", e)`
- 사용자 응답: 한국어만, 영문 스택 노출 금지

---

## 테스트

`server/__tests__/wiki.test.ts`:

| 테스트 | 검증 |
|--------|------|
| writeWiki 정상 저장 | frontmatter 정확성, 한글 슬러그, 디렉토리 자동 생성 |
| writeWiki 충돌 | 동일 ms: `-2` suffix 부여 |
| searchWiki substring | 제목/본문 매칭, date desc 정렬 |
| searchWiki 카테고리 필터 | 지정 카테고리만 반환 |
| searchWiki 0건 | 전체 항목 수 반환 |
| WIKI_ROOT 미설정 | throw 에러 |
| matchWikiSave | 정규식 매칭 확인 |
| matchWikiSearch | 정규식 매칭 확인 |
| executeWikiSave 해시태그 정규화 | `#부동산` → `realestate` |
| executeWikiSave 자동 제목 추출 | 첫 문장 추출 |
| executeWikiSave 짧은 본문 거부 | 3자 미만 거부 메시지 |

임시 디렉토리(`os.tmpdir()/wiki-test-{ts}`) 사용, `afterEach` 정리.

---

## 완료 기준

- `npm run check` ✅
- `npm run build` ✅
- `npm test` (wiki.test.ts 모두 통과) ✅
- 텔레그램에서 `위키 저장 신논현 매물 #부동산` → 저장 완료 응답
- `위키 검색 신논현` → 저장된 항목 반환

---

## 다음 Phase (참고)

- **Phase 1b**: `node-cron` + `briefing.ts` (기존 Bot API로 07:00 모닝 브리핑 발송)
- **Phase 1c**: `compiler.ts` (Gemini 자동 요약 + 카테고리 분류)
- **Phase 1d**: `collector.ts` (MTProto User API로 채널 메시지 수집)
