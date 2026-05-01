# Intelligence 모듈

Wiki와 시장/공시 소스를 읽어 회장님용 브리핑을 생성하는 독립 모듈이다.

## 책임

- 모닝 브리핑 스케줄과 수동 브리핑 테스트를 처리한다.
- Wiki digest, 시장 데이터, DART 공시 요약을 브리핑 형식으로 조합한다.
- 브리핑 결과를 Telegram으로 발송하고 Wiki 일일 아카이브에 저장한다.

## 비책임

- Wiki 원본 저장/검색 구현은 `server/wiki/` 책임이다.
- 개별 금융 공시 조회 구현은 `server/finance/` 책임이다.
- Telegram 메시지 라우팅은 `server/intent/` 책임이다.

## 데이터 경로

| 환경 변수 | 용도 |
|---|---|
| `WIKI_ROOT` | 브리핑 입력/아카이브로 사용하는 Wiki 파일 루트 |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 브리핑 발송 대상 |

## 외부 API 의존성

- Telegram Bot API
- Binance/Upbit public API는 공통 브리핑 소스를 통해 조회
- DART API는 공통 브리핑 소스를 통해 조회

## 텔레그램 명령 목록

- `브리핑`
- `브리핑 테스트`

## 다른 모듈과의 관계

- 다른 도메인 모듈 직접 import 금지.
- Wiki와의 공유는 `WIKI_ROOT` 파일 시스템 경로를 통해서만 한다.
- 시장/공시 공통 소스는 `server/_core/briefingSources.ts`를 통해 사용한다.

## 주요 파일 목록과 라인 수

| 파일 | 라인 수 | 설명 |
|---|---:|---|
| `briefing.ts` | 276 | 스케줄러, 브리핑 생성/발송 |

## 신규 기능 판단 기록

- 브리핑 조합, 발송, 스케줄은 이 모듈에 추가한다.
- 수집기, 원본 저장소, 도메인별 계산 로직은 별도 모듈 또는 `_core` 공통 소스로 분리한다.
