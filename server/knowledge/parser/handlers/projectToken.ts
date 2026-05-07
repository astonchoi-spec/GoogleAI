// #project 토큰 핸들러. 영문 케밥 케이스 + 숫자 + 하이픈만 허용.
// 한글·공백 포함 토큰은 매치하지 않아 본문으로 흘려보냄.

import type { TokenHandler } from "../tokenDispatcher.ts";

const PROJECT_RE = /^#([a-z0-9][a-z0-9-]*)$/i;

export const projectTokenHandler: TokenHandler = {
  prefix: "#",
  // 첫 #project만 매치. 이후는 unknown_tokens로 fallthrough.
  matches: (token, hints) => !hints.explicit_project && PROJECT_RE.test(token),
  apply: (token, hints) => {
    const match = token.match(PROJECT_RE);
    if (!match) return;
    hints.explicit_project = match[1].toLowerCase();
  },
};

// B-1에서 등록할 모든 토큰 핸들러 (현재 1종)
export const defaultTokenHandlers: TokenHandler[] = [projectTokenHandler];
