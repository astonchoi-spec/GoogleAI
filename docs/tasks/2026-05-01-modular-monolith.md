# 모듈 독립성 원칙 강화

날짜: 2026-05-01  
도구: Codex  
상태: 완료

## 목표

통합 인터페이스는 유지하면서 내부 구조는 Modular Monolith 원칙으로 명문화했다. 별도 앱/레포 분리 없이 `server/{domain}` 단위 책임과 의존성 경계를 문서화하고, 도메인 간 직접 import를 자동 검증하도록 했다.

## 완료 내용

- `AGENTS.md`, `CLAUDE.md`에 "모듈 독립성 원칙 (Modular Monolith)" 섹션 추가
- 대상 모듈 9개 README 추가
  - `server/wiki/README.md`
  - `server/deals/README.md`
  - `server/trading/README.md`
  - `server/intelligence/README.md`
  - `server/google/README.md`
  - `server/finance/README.md`
  - `server/realestate/README.md`
  - `server/intent/README.md`
  - `server/_core/README.md`
- `scripts/check-module-boundaries.ts` 추가
- `npm run check`에 모듈 경계 검사를 통합

## 경계 규칙

- `server/wiki`, `server/deals`, `server/trading`, `server/intelligence`, `server/google`, `server/finance`, `server/realestate` 간 직접 import 금지
- 도메인 모듈에서 `server/intent` import 금지
- `server/intent`는 도메인 모듈 호출 가능
- `server/_core`는 공유 타입/유틸/인프라 위치
- 모듈 간 데이터 공유는 `WIKI_ROOT`, `DEALS_ROOT` 같은 파일 시스템 경로를 우선 사용

## 검증

- `npx tsx scripts/check-module-boundaries.ts` 통과: 위반 0건
- 의도적 위반 파일 수동 생성 후 검사: 위반 1건 감지 확인, 테스트 파일 제거
- `npm run check` 통과
- `npm run build` 통과
- `npm test` 통과: 227 passed, 7 skipped, 2 todo

## 결과

- 실제 모듈 경계 위반: 0건
- 자동 수정한 위반: 0건
- 후속 작업으로 분리한 위반: 0건

## 판단 근거

- AST 파서 추가 의존성 없이 정규식 기반 import/export specifier 추출로 구현했다. 현재 코드베이스의 ESM import 패턴을 충분히 감지하며, `tsx`로 즉시 실행 가능하다.
- `_core`는 기존 공통 인프라 import가 많으므로 이번 검사는 도메인 모듈 내부의 직접 도메인 import 차단에 집중했다.
