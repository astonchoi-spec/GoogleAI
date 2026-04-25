# Aston Workstation UI Redesign Brief for Google Stitch

## 1. 앱 개요

Aston Workstation은 회장님 개인과 소수 직원/지인이 사용하는 실행형 워크스테이션이다. AI 채팅을 중심으로 Telegram, Google Workspace, 트레이딩, 부동산 PF 업무를 한 화면 체계 안에서 조작하고 확인하는 내부용 command center 성격의 앱이다.

현재 첫 화면은 `Google ↔ Telegram Integration Design` 설명 페이지에 가깝지만, 실제 제품의 핵심은 문서가 아니라 업무 실행이다. 새 UI는 “에스턴 워크스테이션 홈”을 첫 화면으로 두고, 자주 쓰는 실행 기능을 바로 호출할 수 있어야 한다.

## 2. 대상 사용자

- 회장님: 빠르게 현황을 보고, AI에게 지시하고, 거래/부동산/일정/메일 업무를 실행하는 주 사용자
- 소수 직원 및 지인: 지시받은 업무 확인, Google Workspace 자료 조회, Telegram 연동 메시지 확인, 트레이딩/PF 데이터 입력 및 검토
- 기술 운영자: API 설정, 연동 상태, 문서, 보안, 로드맵을 확인하는 보조 사용자

## 3. 디자인 목표

- 첫 화면을 설명 문서가 아닌 CEO용 실행 대시보드로 전환한다.
- “AI에게 지시 → 업무 실행 → 결과 확인” 흐름이 가장 빠르게 보이도록 한다.
- 한글 중심으로 전문적이고 고급스러운 내부 업무 도구 느낌을 만든다.
- 현재 기능은 유지하되 정보 구조와 우선순위를 재정렬한다.
- 프리미엄 다크모드 기반으로, 조용하고 밀도 높은 command center 분위기를 만든다.
- 문서성 콘텐츠는 홈의 중심에서 내리고, 좌측 사이드바 하단의 보조 문서 메뉴로 이동한다.

## 4. 현재 UI 문제점

- 첫 화면이 “GoogleTG Integration Design” 설명 페이지라 실제 제품명인 Aston Workstation의 존재감이 약하다.
- 개요, 아키텍처, 기능, 대화 흐름, 기술 스택, 구현 예제, API 참조, 보안, 로드맵이 좌측 메뉴의 중심을 차지해 실행형 앱보다 기술 문서처럼 보인다.
- 핵심 기능인 AI 채팅, 트레이딩, 부동산 PF, Google Workspace가 홈에서 보조 링크처럼 느껴진다.
- 상단 내비게이션과 좌측 사이드바의 역할이 혼재되어 있다.
- 일부 화면은 영어 라벨이 많아 회장님용 한글 업무 도구라는 인상이 약하다.
- 카드와 패널의 위계가 비슷해 “지금 무엇을 해야 하는지” 우선순위가 명확하지 않다.
- 로딩/실패 상태가 기능 화면 전체의 완성도를 낮춰 보인다.

## 5. 새 정보구조

주요 실행 영역:

- 홈: 에스턴 워크스테이션 command center
- AI 채팅: Web + Telegram 통합 AI 지시/응답
- 트레이딩: 포지션, 매매일지, 알림, 기술 분석
- 부동산 PF: 파이프라인, 사업성 분석, 토지 조회
- Google Workspace: Gmail, Calendar, Drive, Sheets
- 모니터링: 사용량, 메시지 통계, API 사용량, 시스템 상태
- 설정: 사용자 환경, 알림, API, 개인화

보조 문서 영역:

- 개요
- 아키텍처
- 기능
- 대화 흐름
- 기술 스택
- 구현 예제
- API 참조
- 보안
- 로드맵

## 6. 첫 화면 구성

첫 화면 제목은 “에스턴 워크스테이션”으로 한다. 영어 보조 라벨이 필요하면 아래에 작게 “Aston Workstation”을 둔다.

첫 화면은 문서형 hero가 아니라 업무용 command center로 구성한다.

권장 구성:

- 상단 상태 바: 오늘 날짜, 현재 연결 상태, Telegram 상태, Google OAuth 상태, 마지막 동기화 시간
- 주요 실행 버튼: AI에게 지시하기, Telegram 메시지 확인, 메일 확인, 일정 확인, 포지션 확인, PF 현황 보기
- 핵심 요약 카드: 오늘의 메시지, 미확인 Telegram, 오늘 일정, 열린 포지션, PF 딜 수, 시스템 경고
- AI 명령 입력 영역: 한 줄 command input 형태로 홈 상단에 배치
- 업무 모듈 그리드: AI 채팅, 트레이딩, 부동산 PF, Google Workspace, 모니터링, 설정
- 최근 활동: 최근 AI 지시, Telegram 수신, Google 작업, 트레이딩 알림, PF 변경 기록

첫 화면에서 기술 설명 텍스트는 최소화한다. 사용자는 앱의 구조를 배우러 오는 것이 아니라 실행하러 온다는 전제로 설계한다.

## 7. 좌측 사이드바 구성

좌측 사이드바는 앱의 primary navigation이다. 상단 내비게이션은 제거하거나 최소화하고, 핵심 이동은 좌측 사이드바에 집중한다.

상단 영역:

- 브랜드: 에스턴 워크스테이션
- 보조 라벨: Aston Workstation
- 현재 사용자 또는 권한 표시: 회장님 / Admin 등

핵심 실행 메뉴:

- 홈
- AI 채팅
- 트레이딩
- 부동산 PF
- Google Workspace
- Telegram
- 모니터링
- 설정

빠른 실행 버튼:

- AI에게 지시
- Telegram 전송
- 일정 만들기
- 메일 작성
- 포지션 확인
- PF 사업성 분석

하단 보조 문서 메뉴:

- 개요
- 아키텍처
- 기능
- 대화 흐름
- 기술 스택
- 구현 예제
- API 참조
- 보안
- 로드맵

문서 메뉴는 접이식 그룹으로 처리한다. 기본 상태에서는 접혀 있어야 한다.

## 8. 페이지별 개선 방향

홈:

- 기존 설명형 랜딩을 제거하고 command center 홈으로 재설계한다.
- 큰 hero 문구보다 실행 입력, 상태 요약, 빠른 버튼을 우선한다.
- “Google 생태계 + 텔레그램”보다 “에스턴 워크스테이션” 브랜드를 앞세운다.

AI 채팅:

- 통합 채팅을 업무 지시 콘솔처럼 정리한다.
- 검색, 기간 필터, 출처 필터는 상단 보조 도구로 유지하되 더 조밀하게 배치한다.
- 하단 빠른 명령은 회장님이 실제로 쓸 문장 중심으로 정리한다.
- Web/Telegram 출처가 명확히 보이도록 배지와 타임라인을 개선한다.

트레이딩:

- 영어 라벨을 한글 중심으로 변경한다.
- Portfolio Summary는 “자산 요약”, Open Positions는 “보유 포지션”, Technical Snapshot은 “기술 분석”으로 표현한다.
- 대시보드, 매매일지, 알림설정 탭은 유지하되 KPI 우선순위를 명확히 한다.
- 실패/로딩 상태는 화면 우하단 토스트에만 의존하지 말고 각 패널 안에서 조용히 표시한다.

부동산 PF:

- “PF deal pipeline” 같은 영어 설명은 한글 업무 용어로 바꾼다.
- 파이프라인, 사업성 분석, 토지조회는 별도 업무 흐름으로 분리하되 동일한 시각 언어를 쓴다.
- 입력 폼은 회장님/직원이 이해하기 쉬운 한글 라벨로 바꾼다.
- 주요 숫자 단위는 억원, 평, %, 개월 등 한국식 단위를 명확히 표시한다.

Google Workspace:

- Gmail, Calendar, Drive, Sheets 탭은 유지한다.
- 페이지 제목은 “Google Workspace”를 유지하되 보조 라벨을 “메일, 일정, 파일, 시트 통합 관리”로 둔다.
- 연결 상태 패널은 더 작고 명확한 status chip 형태로 줄인다.
- Gmail/Calendar/Drive/Sheets 각각의 주요 액션 버튼을 한글 중심으로 재정리한다.

Telegram:

- 별도 메뉴로 인지될 수 있게 사이드바에 추가한다.
- 최근 수신 메시지, 전송 상태, 연결된 채팅 ID, Web 동기화 상태를 보여준다.
- Telegram은 AI 채팅의 보조 채널이지만, 회장님에게는 중요한 실행 채널이므로 홈 요약에도 노출한다.

모니터링:

- 운영자용 페이지로 유지하되, 홈에는 중요한 경고만 간단히 노출한다.
- API 사용량, 메시지 통계, 응답 시간, 시스템 상태를 한글 라벨로 정리한다.

설정:

- API 키, 알림, 테마, 개인정보, 컴팩트 모드 등 현재 기능을 유지한다.
- 운영자/일반 사용자 설정을 시각적으로 구분한다.

문서 페이지:

- 기존 개요, 아키텍처, 기능, 대화 흐름, 기술 스택, 구현 예제, API 참조, 보안, 로드맵은 보조 문서 영역으로 이동한다.
- 문서 영역은 실행 홈과 시각적으로 구분한다.

## 9. 한글/영문 라벨 정책

- 기본 UI 라벨은 한글을 우선한다.
- 영어가 필요한 경우 한글 아래 작은 보조 라벨로만 사용한다.
- 기술 고유명사는 유지한다: Gmail, Calendar, Drive, Sheets, Telegram, Google Workspace, API, OAuth.
- 업무 용어는 한국식 표현을 사용한다: 자산 요약, 보유 포지션, 매매일지, 알림설정, 사업성 분석, 토지조회, 받은 편지함, 일정, 파일, 시트.
- 버튼은 명령형 한글로 작성한다: 조회, 작성, 분석, 추가, 전송, 동기화, 새로고침.
- 긴 설명 문장은 줄이고, 패널 제목과 수치 중심으로 구성한다.

## 10. Stitch에 그대로 넣을 최종 프롬프트

```text
Redesign the Aston Workstation web app UI as a premium dark-mode CEO command center.

The current app starts as a “Google ↔ Telegram Integration Design” documentation page, but the real product is Aston Workstation: a private execution workstation for a chairman and a small trusted team.

Do not design a marketing landing page. Design the actual usable application home screen.

Primary goals:
- Make the first page “에스턴 워크스테이션 홈”, not a technical documentation page.
- Use Korean as the primary UI language.
- Use English only as small secondary labels under Korean where helpful.
- Keep all existing functions, but reorganize information priority around execution.
- Create a premium dark-mode command center feel: calm, executive, dense, precise, operational.
- Avoid decorative hero layouts. Prioritize status, commands, actions, and business modules.

Main features to represent:
- 홈
- AI 채팅
- 트레이딩
- 부동산 PF
- Google Workspace
- Telegram 연동
- Gmail / Calendar / Drive / Sheets
- 모니터링
- 설정
- Technical documentation, API docs, security, roadmap as secondary documentation

Information architecture:
- Left sidebar is the primary navigation.
- Sidebar top: 에스턴 워크스테이션 / Aston Workstation, user status, connection indicators.
- Sidebar main execution menu: 홈, AI 채팅, 트레이딩, 부동산 PF, Google Workspace, Telegram, 모니터링, 설정.
- Sidebar quick actions: AI에게 지시, Telegram 전송, 일정 만들기, 메일 작성, 포지션 확인, PF 사업성 분석.
- Sidebar bottom collapsed documentation group: 개요, 아키텍처, 기능, 대화 흐름, 기술 스택, 구현 예제, API 참조, 보안, 로드맵.

Home screen layout:
- Top status strip: date, Google connection, Telegram connection, Redis/API status, last sync.
- Command input area: “AI에게 업무 지시…” with send/mic icons.
- KPI cards: 오늘 일정, 미확인 Telegram, 받은 메일, 열린 포지션, PF 딜, 시스템 경고.
- Main action grid: AI 채팅, 트레이딩, 부동산 PF, Google Workspace, Telegram, 모니터링.
- Recent activity timeline: AI commands, Telegram messages, Google actions, trading alerts, PF updates.
- Use compact cards, clear hierarchy, and strong readability.

Visual style:
- Premium dark mode.
- Deep navy/black background, subtle borders, restrained cyan/blue accents.
- Avoid a one-note neon look; use cyan only for active states and key metrics.
- Use sharp, work-focused panels with 6-8px radius.
- Do not use oversized marketing hero text.
- Use Lucide-style line icons.
- Use dense but readable spacing.

Page improvements:
- AI 채팅 should feel like a command console with Web + Telegram timeline.
- 트레이딩 should use Korean labels: 자산 요약, 보유 포지션, 기술 분석, 매매일지, 알림설정.
- 부동산 PF should use Korean business labels: 파이프라인, 사업성 분석, 토지조회, 대출 익스포저, 다음 마일스톤.
- Google Workspace should keep Gmail, Calendar, Drive, Sheets tabs but make connection status compact.
- Telegram should be visible as a first-class channel, not hidden inside chat.
- Documentation should be secondary and collapsed in the sidebar.

Deliver a high-fidelity responsive app UI concept for desktop first, with a clear mobile sidebar strategy.
```

## 11. 참고해야 할 현재 화면 캡처 목록

- 현재 홈/문서형 첫 화면: GoogleTG Integration Design 중심, 좌측 문서 메뉴와 하단 AI 채팅/Google Workspace 링크
- Google Workspace 화면: Gmail/Calendar/Drive/Sheets 탭, Google 연결 상태 패널, 받은 편지함 패널
- AI 채팅 화면: 통합 채팅, 메시지 검색 필터, Web + Telegram 표시, 하단 빠른 명령
- 트레이딩 대시보드 화면: 포트폴리오 요약, 빠른 액션, 보유 포지션, 기술 분석, 잔고/김치프리미엄
- 트레이딩 매매일지 화면: 기간/거래소 필터, Sync Trades 버튼, Trade Stats
- 트레이딩 알림설정 화면: 심볼, 조건, 거래소, Telegram chatId 입력
- 부동산 PF 파이프라인 화면: Deal Count, Loan Exposure, Data Source, Add Deal, PF Deals, Portfolio Summary
- 부동산 PF 사업성 분석 화면: Feasibility Input 폼, 숫자 입력 중심의 대형 폼
- 부동산 PF 토지조회 화면: PNU, 법정동/시점, 유형 선택, Search 버튼

## 12. Stitch 결과물을 다시 Codex가 구현할 때의 주의사항

- 앱 코드 수정 전 반드시 현재 라우팅과 컴포넌트 구조를 다시 확인한다.
- 기존 기능, API, tRPC 라우터, 데이터 흐름은 유지한다.
- 파일 삭제, 라우팅 제거, 기존 기능 제거 없이 UI 구조만 단계적으로 교체한다.
- 홈 개편은 `Home.tsx`, `Sidebar.tsx`, `Navbar.tsx`, `components/home` 계열을 중심으로 진행한다.
- AI 채팅은 `UnifiedChatInterface.tsx`의 기능을 유지하면서 레이아웃과 라벨만 정리한다.
- 트레이딩은 `client/src/components/trading` 하위 컴포넌트 기능을 유지한다.
- 부동산 PF는 `client/src/components/realestate` 하위 컴포넌트와 `RealEstatePage.tsx` 흐름을 유지한다.
- Google Workspace는 `client/src/components/GoogleWorkspace` 하위 기능을 유지한다.
- 한글 라벨 변경 시 타입, enum, API input 값과 UI 표시 텍스트를 혼동하지 않는다.
- 실제 데이터 로딩/에러/빈 상태를 모두 디자인에 포함한다.
- 모바일에서는 좌측 사이드바를 drawer 형태로 전환하고, 핵심 실행 버튼은 상단 또는 하단에 유지한다.
- 구현 후 `npm run check`, `npm run build`를 반드시 통과시킨다.
