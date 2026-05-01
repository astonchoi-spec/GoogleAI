# 2026-05-01 딜 마감일/이정표 관리 (Phase B-4)

## 목표
- DealMeta에 deadline/milestones 필드 추가
- 텔레그램 명령으로 마감일·이정표 등록·완료·삭제
- 딜 상세에 D-day와 이정표 목록 표시
- 모닝 브리핑 딜 섹션에 D-day 임박 강조 (≤30일)
- 한국어 자연어 날짜 파싱

## 신규 파일
- `server/deals/dateParser.ts` (76줄): `parseDealDate`, `calcDday`, `formatKstShortDate`. KST 고정. 절대(YYYY-MM-DD/YYYY-MM-DD), 상대(M/D, 자동 미래 보정), 키워드(오늘/내일/모레/글피), N일/주/개월 후, 이번주/다음주 X요일 지원.
- `server/__tests__/dateParser.test.ts` (10개 테스트): 절대/상대/키워드/오류 입력/포맷.

## 수정 파일
- `server/deals/dealTypes.ts`: `Milestone` 타입, `DealMeta`에 `deadline`/`deadlineLabel`/`milestones` 추가.
- `server/deals/dealStore.ts`: `setDealDeadline`, `clearDealDeadline`, `addMilestone`, `completeMilestone`, `removeMilestone`. nanoid 대신 `crypto.randomBytes(4).toString("base64url")`로 6자 ID. 라벨 partial 매칭(uniqueness 검사 → pending fallback).
- `server/deals/dealFileRouter.ts`: `splitTrailingDate` 헬퍼로 날짜 트레일링 추출(1·2 토큰 시도, parseDealDate 검증). 신규 액션: `deadline_set`, `deadline_clear`, `milestone_add`, `milestone_complete`, `milestone_remove`.
- `server/deals/telegramDealFileHandler.ts`: 신규 핸들러 분기, `formatDealDetail`에 마감 라인 + 이정표 블록 추가. D-day 임계값 표시(🚨≤3, ⏰≤7, 📌≤30, 🗓 외).
- `server/_core/briefingSources.ts`: `DealsBriefingItem`에 `daysUntilDeadline`, `deadline`, `deadlineLabel`, `urgentMilestones?` 추가. 30일 이하 미완료 이정표만 D-day 오름차순.
- `server/intelligence/briefing.ts`: `formatDealsSection` 재작성. 30일 이하만 표시, D-day 미설정 딜은 `(마감 미설정)`.
- `server/deals/index.ts`: dateParser 재export.
- `server/__tests__/dealStore.test.ts`: deadline set/clear, milestone 추가/완료/삭제, partial 매칭, 존재 안 함 → throw 6개 테스트.
- `server/__tests__/briefing.test.ts`: 기존 deal 라인 포맷 변경(`-` → `•`) 반영.

## 자율 결정
- 자연어 날짜 파싱은 외부 의존성 없이 자체 정규식 구현.
- Milestone ID는 6자 base64url(crypto.randomBytes) — nanoid 추가 의존 회피.
- 라벨 partial 매칭은 1:1이면 즉시 매칭, 2개 이상이면 미완료 1건이 있으면 그 1건 선택, 그 외는 throw.
- D-day 출력 형식: `D-N`(미래)/`D-DAY`(당일)/`D+N`(과거).
- 모닝브리핑 임계값: ≤30일만 D-day 표시(노이즈 차단), 미설정 딜은 `(마감 미설정)` 한 줄.
- 명령 포맷: 날짜는 항상 트레일링(1·2 토큰), 다중 단어 라벨 허용, 다중 단어 딜명은 partial 매칭(`findDealByPartialName`)으로 첫 토큰 해소.
- 과거 날짜는 차단하지 않고 경고만(`⚠️ 과거 날짜입니다.`) — 회장이 의도적으로 과거 이정표 등록할 수 있음.

## 테스트
- 기존 276 → 신규 16개(dateParser 10 + dealStore 6) → 합계 292 passed.

## 검증
- `npm run check` ✅ (모듈 경계 위반 0건)
- `npm run build` ✅
- `npm test` ✅ 292 passed / 7 skipped / 2 todo

## 모닝브리핑 출력 예시
```
## 📁 진행 중 딜 (3건)
• 한남동644 — 자료 12건 (어제 +3) 🔗
  🚨 D-3: 사업협약 체결 (5/4)
• 용인신대지구 — 자료 8건 (어제 +1) 🔗
  📌 D-15: 인허가 신청 (5/16)
• 포항해상케이블카 — 자료 5건 (어제 +0) ⚠️
  (마감 미설정)
```

## 텔레그램 응답 예시
```
> 딜 마감 한남동644 2026-06-30 사업협약 체결
✅ 딜 마감일 등록
📁 한남동644
🗓 6/30 (D-60)
📝 사업협약 체결

> 딜 이정표 한남동644 인허가신청 2026-05-15
✅ 이정표 추가
📁 한남동644
📌 인허가신청
📌 5/15 (D-14)

> 딜 이정표 완료 한남동644 인허가
✅ 이정표 완료
📁 한남동644
✔️ 인허가신청 (5/15)

> 딜 한남동644
📁 한남동644
━━━━━━━━━━
상태: 🟢 검토 중
생성: 2026-05-01
최근 갱신: 2026-05-01 14:30
🗓 마감: 6/30 (D-60) — 사업협약 체결

📂 자료 (12건)
• 01_계약서: 2
...

📌 이정표 (2건)
  ✅ 5/15 인허가신청 (완료)
  ⏳ 6/1 심의 의결 (D-31)

🔗 NotebookLM: ...
```

## 다음 단계 제안
- D-3/D-7 임박 시 텔레그램 자동 푸시 알림(별도 cron)
- 카톡/Gmail 첨부에서 마감일 자동 추출(LLM)
- OpenClaw 통합 시 deadline·milestones를 분석 컨텍스트로 주입

## 범위 밖
- 푸시 알림, 자동 추출, OpenClaw — 별 작업.
