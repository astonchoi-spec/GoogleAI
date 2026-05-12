# Intent Service Phase 0~8-A 운영 검증 체크리스트
> 작성일: 2026-05-09 | 작성자: Claude Code | 브랜치: `codex-google-workspace-expansion`
> 대상: 회장님 직접 수동 QA
> 범위: Intent Service 4단계 파이프라인 + 5 kind HandlerResponse + prompts/ 프로드 번들 정상 동작 확인

---

## 1. 테스트 목적

Phase 0~8-A까지의 구조 안정화 결과가 **운영 환경에서 회귀 없이** 동작하는지 회장님이 텔레그램·웹 채팅으로 직접 확인한다.

확인 포인트:
- `parseIntent → planIntent → dispatchIntent → formatReply` 4단계 파이프라인이 모든 도메인에서 정상 라우팅되는지
- 5개 kind(`list` / `report` / `text` / `error` / `confirmation`) 응답이 byte-for-byte 보존되는지
- `prompts/classifier.md` 파일 로딩이 dev/prod 양쪽에서 정상 동작하는지
- `data` 객체·raw JSON·토큰·시크릿이 사용자 응답에 노출되지 않는지

코드 수정 / 리팩토링 / 새 기능 추가 **없음**. 본 검증은 **읽기 전용 운영 확인**이다.

---

## 2. 사전 조건

검증 시작 전 다음을 모두 만족해야 한다.

| 항목 | 확인 방법 | 기대 결과 |
|------|----------|----------|
| 서버 가동 | 브라우저에서 http://localhost:4000 접속 | 로그인/홈 화면 표시 (HTTP 200) |
| PM2 또는 dev 프로세스 | `pm2 list` 또는 백그라운드 dev 프로세스 확인 | `aston` online 또는 `npm run dev` 실행 중 |
| 텔레그램 봇 연결 | http://localhost:4000/api/agents/health 응답 | `openclaw.available=true` |
| Google OAuth | 웹 채팅에서 "Google 재인증" 메시지 안 뜨는지 | 일정/메일 명령이 정상 응답 |
| Wiki 경로 | `.env`의 `ASTON_WIKI_ROOT=G:\내 드라이브\Aston-Wiki` 또는 `WIKI_ROOT` 설정 | 위키 검색이 0건이라도 응답 도달 |
| Deals 경로 | `.env`의 `DEALS_ROOT=G:\내 드라이브\Aston-Deals` 설정 | "딜 추가" 명령이 폴더 생성 응답 도달 |
| dist prompts | `dist/prompts/classifier.md`, `dist/prompts/planner.md` 존재 | (prod 빌드 후 운영 시에만 해당 — `npm run dev` 환경은 무관) |

**조건 미충족 시**: 해당 명령은 "skip" 처리하고 §6 양식에 사유를 기록한다.

---

## 3. 검증 명령 5개

| # | 명령 | 도메인 | 액션 | 기대 kind |
|---|------|--------|------|----------|
| 1 | `오늘 일정 보여줘` | google | `google_today_events` | (legacy data path, kind 마커 없이 list-style 응답) |
| 2 | `위키에서 한남644 검색` | wiki | `wiki_search` | `list` |
| 3 | `최근 텔레그램 메시지 보여줘` | chat | `chat_telegram_recent` | `list` |
| 4 | `BTC 분석해줘` | trading | `trading_technical_analysis` | `report` |
| 5 | `딜 추가 테스트` | deals | `deals_command` | `text` |

> 참고: `google_today_events`는 Phase 6-A 이전 leagacy 핸들러로, `data.events` 경유 표시 경로다. Phase 6-A에서 `getEmails/listEvents`만 마이그레이션했고 `todayEvents`는 응답 변경 동의가 필요해 보류된 상태. 운영상 정상 동작은 보장됨.

---

## 4. 웹 채팅 테스트 절차

**전제**: 브라우저로 http://localhost:4000 접속 → 로그인 → 채팅 화면 (`/chat`).

각 명령에 대해 다음 순서로 진행:

1. 채팅 입력창에 **§3의 명령을 그대로** 붙여넣고 Enter.
2. 응답 메시지를 **30초 이내** 받는지 확인.
3. 응답 본문이 §5의 "기대 응답 형태"와 **구조적으로 일치**하는지 확인 (한글/이모지 헤더, 항목 줄바꿈, 절대 시간 포맷 등).
4. 응답 안에 다음이 **노출되지 않는지** 확인 (회귀 핵심):
   - `[object Object]` 또는 raw JSON 객체 (`{...}`)
   - `data: {...}` 같은 디버그 키
   - 영문 스택 트레이스 (`at Object.<anonymous> ...`)
   - 사용자 입력 메시지가 응답에 그대로 echo되는 현상
   - API 토큰·refresh token·환경변수 값
5. 5번 명령(`딜 추가 테스트`)은 새 폴더가 실제 만들어지므로 **테스트 후 운영 정리**가 필요하다 (§7 참고).

웹 채팅에서만 확인 가능한 추가 항목:
- 메시지 전송 후 **중복 전송**되지 않는지 (Enter / 전송 버튼 / 빠른 명령 모두 1건만)
- Gemini Grounding 인용 칩이 떠야 하는 명령(`BTC 분석해줘`)에서 칩 렌더링되는지

---

## 5. 텔레그램 테스트 절차

**전제**: 회장님 텔레그램에서 봇과 1:1 대화 가능.

각 명령에 대해 다음 순서로 진행:

1. 텔레그램 봇에게 **§3의 명령을 그대로** 메시지로 전송.
2. 봇 응답을 **30초 이내** 받는지 확인.
3. 응답 형태 점검은 §4의 4번과 동일.
4. **웹 채팅 결과와 텔레그램 결과가 동일한 인텐트로 라우팅**됐는지 비교 (헤더 이모지·구조가 같으면 OK).
5. 텔레그램 전용 점검:
   - 인라인 버튼이 함께 떠야 하는 명령(예: 딜 분류 콜백)에서 버튼이 정상 표시되는지
   - 한국어 깨짐(`?` 또는 mojibake)이 없는지

---

## 6. 명령별 기대 응답

### 6-1. `오늘 일정 보여줘`
- **라우팅**: `google.google_today_events` (handlerResponse 미부여 — legacy 경로)
- **정상 응답 헤더**: `📅 오늘(YYYY-MM-DD) 일정 N개` 또는 `📅 오늘(YYYY-MM-DD) 등록된 일정이 없습니다.`
- **본문**: 일정이 있으면 `1. HH:MM — 제목 [@장소]` 형식으로 KST 시각순 정렬.
- **OAuth 만료 분기**: `🔐 Google 재인증이 필요합니다 ...` 메시지 + 인라인 재인증 버튼(웹).

### 6-2. `위키에서 한남644 검색`
- **라우팅**: `wiki.wiki_search` (kind=`list`)
- **정상 응답 헤더**: `🔍 위키 검색: "한남644" — N건` (카테고리 필터가 있으면 `[#카테고리]` 추가).
- **빈 결과**: `🔍 위키 검색: "한남644" — 0건` 정도의 헤더만, 본문은 빈 줄.
- **검색어 누락**: `⚠️ 검색어를 입력해주세요 (예: 위키 검색 신논현)`

### 6-3. `최근 텔레그램 메시지 보여줘`
- **라우팅**: `chat.chat_telegram_recent` (kind=`list`)
- **정상 응답 헤더**: `💬 최근 Telegram 메시지 N건`
- **본문**: `1. MM/DD HH:MM 👤 ...본문 미리보기...` (assistant는 🤖)
- **빈 결과**: `💬 동기화된 Telegram 메시지가 없습니다.`
- **userId 미식별**: `💬 사용자 식별이 안 되어 Telegram 메시지를 가져올 수 없습니다.`
- **회귀 포인트**: `data.messages` 객체 배열이 응답 본문에 raw JSON으로 노출되면 안 됨.

### 6-4. `BTC 분석해줘`
- **라우팅**: `trading.trading_technical_analysis` (kind=`report`)
- **정상 응답**: BTC 멀티 타임프레임(예: 1H/4H/1D) 기술적 지표 요약 리포트. 가격·RSI·MACD·이동평균 등 수치가 표·줄 단위로 나옴.
- **확인 포인트**: 본문이 끝까지 나오는지(잘림 없는지), 한국어 헤더가 깨지지 않는지.
- **외부 API 실패 분기**: `⚠️ 일부 데이터를 가져오지 못했습니다 ...` 류 메시지(byte-for-byte 보존되는 한국어 에러).

### 6-5. `딜 추가 테스트`
- **라우팅**: `deals.deals_command` (kind=`text`)
- **정상 응답**:
  ```
  ✅ 딜 추가 완료
  📁 테스트
  📂 카테고리 폴더 6개 생성됨
  🔗 NotebookLM 링크: 미등록
     ("딜 노트북 한남동644 [URL]" 로 등록 가능)

  다음:
  1. NotebookLM에서 새 노트북 생성
  2. Google Drive 소스 추가 → 딜 폴더 선택
  3. URL을 위 명령으로 등록
  ```
- **이미 존재하는 경우**: 중복 생성 방지 메시지.
- **운영 정리**: 테스트 후 `DEALS_ROOT/테스트/` 폴더 수동 삭제 또는 `딜 상태 테스트 rejected` 명령으로 정리 필요.

---

## 7. 실패 시 기록 양식

각 명령에서 기대와 다른 응답이 나오면 다음 양식으로 기록한다.

```
### [QA-N] 명령: <테스트한 명령>
- 채널: 텔레그램 / 웹 채팅
- 시각: YYYY-MM-DD HH:MM:SS KST
- 입력: <보낸 메시지 그대로>
- 받은 응답:
  ```
  <응답 전문 그대로 — 줄바꿈 보존>
  ```
- 기대 응답: <§6에서 어떤 분기에 해당했어야 하는지>
- 차이점: <헤더 누락 / 본문 깨짐 / raw JSON 노출 / 30초 미응답 등 1줄 요약>
- 재현성: 항상 / 가끔 / 1회만
- 추정 영향 범위: <도메인 또는 핸들러 이름>
- 첨부: 스크린샷 경로(있으면)
```

---

## 8. TODO.md에 기록할 운영 검증 이슈 섹션 초안

QA 종료 후, TODO.md 상단에 아래 섹션을 추가하고 §7 양식의 항목들을 옮긴다.
실패가 0건이면 "회귀 0건 확인 완료" 한 줄만 기록하고 닫는다.

```markdown
## 2026-05-09 Intent Service Phase 0~8-A 운영 검증 (회장 직접 QA)

### 검증 환경
- 브랜치: codex-google-workspace-expansion / HEAD: <커밋>
- 서버: http://localhost:4000 (PM2 또는 npm run dev)
- 일시: YYYY-MM-DD HH:MM ~ HH:MM KST

### 검증 명령 5종 결과 요약
- [ ] 오늘 일정 보여줘 — 텔레그램: <PASS/FAIL/SKIP> · 웹: <PASS/FAIL/SKIP>
- [ ] 위키에서 한남644 검색 — 텔레그램: <PASS/FAIL/SKIP> · 웹: <PASS/FAIL/SKIP>
- [ ] 최근 텔레그램 메시지 보여줘 — 텔레그램: <PASS/FAIL/SKIP> · 웹: <PASS/FAIL/SKIP>
- [ ] BTC 분석해줘 — 텔레그램: <PASS/FAIL/SKIP> · 웹: <PASS/FAIL/SKIP>
- [ ] 딜 추가 테스트 — 텔레그램: <PASS/FAIL/SKIP> · 웹: <PASS/FAIL/SKIP>

### 발견된 이슈 (없으면 "없음" 기록)
<§7 양식의 [QA-1], [QA-2], ... 항목들을 여기에 옮긴다>

### 후속 조치
- [ ] (이슈가 있을 때) 우선순위 P0/P1/P2 분류 후 별도 작업 지시서로 처리
- [ ] (DEALS_ROOT/테스트 폴더 생성됐으면) 폴더 삭제 또는 rejected 처리
- [ ] (회귀 0건이면) HANDOFF.md 현재 상태 표 "운영 검증" 항목 ✅ 갱신
```

---

## 9. 코드/리팩토링 금지 명시

본 문서는 **검증용 체크리스트**다. 다음은 모두 **금지**:
- 코드 수정 / 새 기능 추가 / 리팩토링
- `intent/` 파이프라인·핸들러·prompts 변경
- 테스트 추가/삭제
- `.env` 변경
- PM2 reload 외 운영 재시작 자동화

검증 중 코드 버그가 발견되면 §7 양식에만 기록하고 별도 작업 지시서를 받아 처리한다.
