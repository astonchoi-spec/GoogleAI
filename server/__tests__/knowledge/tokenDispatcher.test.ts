import { describe, it, expect } from "vitest";
import { parseCommand } from "../../knowledge/parser/tokenDispatcher.ts";
import { defaultTokenHandlers } from "../../knowledge/parser/handlers/projectToken.ts";

describe("Knowledge tokenDispatcher", () => {
  it("명령 prefix 없는 메시지는 전체가 body", () => {
    const r = parseCommand("그냥 메모입니다", defaultTokenHandlers);
    expect(r.command).toBeNull();
    expect(r.body).toBe("그냥 메모입니다");
    expect(r.hints.explicit_project).toBeUndefined();
  });

  it("/tg + 본문만", () => {
    const r = parseCommand("/tg 한남644 인허가 5/15 신청", defaultTokenHandlers);
    expect(r.command).toBe("tg");
    expect(r.body).toBe("한남644 인허가 5/15 신청");
    expect(r.hints.explicit_project).toBeUndefined();
    expect(r.hints.explicit_command).toBe("tg");
  });

  it("/tg #project + 본문", () => {
    const r = parseCommand("/tg #hannam-644 인허가 5/15 신청", defaultTokenHandlers);
    expect(r.command).toBe("tg");
    expect(r.hints.explicit_project).toBe("hannam-644");
    expect(r.body).toBe("인허가 5/15 신청");
  });

  it("프로젝트명 대문자도 소문자로 정규화", () => {
    const r = parseCommand("/tg #Hannam-644 메모", defaultTokenHandlers);
    expect(r.hints.explicit_project).toBe("hannam-644");
  });

  it("본문 안의 # 해시태그(공백 다음)는 본문으로 처리", () => {
    const r = parseCommand("/tg #hannam-644 회의 #important 한 내용", defaultTokenHandlers);
    expect(r.hints.explicit_project).toBe("hannam-644");
    // #important는 unknown_tokens에 보존 (#는 prefix지만 등록 핸들러 없음)
    expect(r.hints.unknown_tokens).toContain("#important");
    expect(r.body).toBe("회의 한 내용");
  });

  it("향후 토큰(+person, @company, due:, !urgent)은 unknown_tokens에 보존", () => {
    const r = parseCommand("/tg #hannam-644 +홍길동 @삼성 !urgent due:2026-05-15 본문", defaultTokenHandlers);
    expect(r.hints.explicit_project).toBe("hannam-644");
    expect(r.hints.unknown_tokens).toEqual(["+홍길동", "@삼성", "!urgent", "due:2026-05-15"]);
    expect(r.body).toBe("본문");
  });

  it("알 수 없는 명령 prefix는 본문으로 처리", () => {
    const r = parseCommand("/unknown 메모", defaultTokenHandlers);
    expect(r.command).toBeNull();
    expect(r.body).toBe("/unknown 메모");
  });

  it("본문에 C# 학습 같은 본문 토큰 보존", () => {
    const r = parseCommand("C# 학습 중인데 메모", defaultTokenHandlers);
    expect(r.command).toBeNull();
    expect(r.body).toBe("C# 학습 중인데 메모");
  });

  it("/tg 빈 본문도 허용", () => {
    const r = parseCommand("/tg", defaultTokenHandlers);
    expect(r.command).toBe("tg");
    expect(r.body).toBe("");
  });

  it("/tg #project 만 입력 (본문 없음)", () => {
    const r = parseCommand("/tg #hannam-644", defaultTokenHandlers);
    expect(r.command).toBe("tg");
    expect(r.hints.explicit_project).toBe("hannam-644");
    expect(r.body).toBe("");
  });

  it("앞뒤 공백 처리", () => {
    const r = parseCommand("   /tg #hannam-644 메모   ", defaultTokenHandlers);
    expect(r.command).toBe("tg");
    expect(r.hints.explicit_project).toBe("hannam-644");
    expect(r.body).toBe("메모");
  });

  it("프로젝트 이름이 잘못된 형식이면 매치 X", () => {
    // 한글 프로젝트명은 매치 안 됨 → unknown_tokens
    const r = parseCommand("/tg #한남644 메모", defaultTokenHandlers);
    expect(r.hints.explicit_project).toBeUndefined();
    expect(r.hints.unknown_tokens).toContain("#한남644");
  });
});
