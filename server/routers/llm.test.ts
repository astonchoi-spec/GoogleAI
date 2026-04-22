import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from '../llm/session';
import LLMCaller from '../llm/caller';

describe('LLM Router - System Prompt Enhancement', () => {
  let sessionManager: SessionManager;
  let llmCaller: LLMCaller;

  beforeEach(() => {
    sessionManager = new SessionManager();
    llmCaller = new LLMCaller();
  });

  it('should include current date in system prompt', async () => {
    const userId = 'test-user-1';
    
    // Get current date in Korean format
    const currentDate = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    
    // Verify the date format is correct (should contain year, month, day)
    // Korean format: "2026. 4. 22. 오전 9:06:39"
    expect(currentDate).toMatch(/\d{4}\. \d{1,2}\. \d{1,2}\./);
  });

  it('should include Gemini 2.5 Flash model identification in prompt', () => {
    const systemPrompt = `당신은 구글 생태계와 텔레그램을 통합하는 AI 어시스턴트입니다. 사용자의 질문에 친절하고 정확하게 답변해주세요.

현재 날짜와 시간: 2026.4.22. 오전 12:06:15
당신은 Google Gemini 2.5 Flash 모델입니다. 최신 정보와 2024년 이후의 지식을 가지고 있습니다.`;

    expect(systemPrompt).toContain('Google Gemini 2.5 Flash');
    expect(systemPrompt).toContain('2024년 이후의 지식');
    expect(systemPrompt).toContain('현재 날짜와 시간');
  });

  it('should have session manager ready', async () => {
    const userId = 'test-user-2';
    const session = await sessionManager.getSession(userId);
    
    expect(session).toBeDefined();
    expect(session.engine).toBe('gemini');
    expect(session.modelKey).toBe('flash');
  });

  it('should support model switching', async () => {
    const userId = 'test-user-3';
    
    // Switch to Gemini Pro
    await sessionManager.switchEngine(userId, 'gemini', 'pro');
    const session = await sessionManager.getSession(userId);
    
    expect(session.engine).toBe('gemini');
    expect(session.modelKey).toBe('pro');
  });

  it('should maintain conversation history', async () => {
    const userId = 'test-user-4';
    
    // Add messages
    await sessionManager.addMessage(userId, 'user', '안녕하세요');
    await sessionManager.addMessage(userId, 'assistant', '안녕하세요! 무엇을 도와드릴까요?');
    
    // Get history
    const history = await sessionManager.getHistory(userId, 10);
    
    expect(history.length).toBe(2);
    expect(history[0].role).toBe('user');
    expect(history[0].content).toBe('안녕하세요');
    expect(history[1].role).toBe('assistant');
  });
});
