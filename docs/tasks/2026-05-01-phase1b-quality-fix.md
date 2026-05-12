# Phase 1b 브리핑 출력 품질 개선

상태: 완료
일자: 2026-05-01

## 문제
- `위키 검색 briefing`이 `daily/` 하위 브리핑 파일을 찾지 못함
- 어제 저장된 위키 메모가 카테고리별로 중복 출력됨
- 이전 브리핑 파일이 다음 브리핑의 위키 메모 섹션에 재노출될 위험이 있음

## 수정
- `server/wiki/wikiStore.ts`: `WIKI_ROOT` 하위 `.md` 파일 재귀 순회, `category` 단수 frontmatter 하위 호환, 메타데이터 검색 포함
- `server/_core/briefingSources.ts`: `#briefing` 및 `source: morning-briefing` 항목 제외, 신규 저장 frontmatter `categories: [briefing]` 보장
- `server/intelligence/briefing.ts`: 위키 메모 섹션을 메모별 1줄 + 인라인 카테고리 형식으로 변경
- 테스트: daily 검색, 브리핑 frontmatter, 위키 메모 중복 방지 회귀 테스트 추가

## 검증
- `npm test -- server/__tests__/briefing.test.ts server/__tests__/briefingSources.test.ts server/__tests__/wiki.test.ts` 통과
- `npm run check` 통과

## 결정 근거
- 기존 파일 호환을 위해 읽기 단계에서 `category` 단수 frontmatter를 흡수했다.
- 브리핑 재노출은 수집 단계와 출력 단계에서 이중 차단했다.
