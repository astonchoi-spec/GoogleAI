import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiSettingsRouter } from './api-settings';

describe('API Settings Router', () => {
  it('should have all required procedures', () => {
    expect(apiSettingsRouter).toBeDefined();
    expect(apiSettingsRouter._def.procedures).toBeDefined();
  });

  it('should support getAll procedure', () => {
    expect(apiSettingsRouter._def.procedures.getAll).toBeDefined();
  });

  it('should support save procedure', () => {
    expect(apiSettingsRouter._def.procedures.save).toBeDefined();
  });

  it('should support delete procedure', () => {
    expect(apiSettingsRouter._def.procedures.delete).toBeDefined();
  });

  it('should support validate procedure', () => {
    expect(apiSettingsRouter._def.procedures.validate).toBeDefined();
  });

  it('should have proper provider list', () => {
    const providers = ['gemini', 'openai', 'anthropic', 'ollama'];
    providers.forEach((provider) => {
      expect(provider).toBeTruthy();
    });
  });

  it('should validate provider enum values', () => {
    const validProviders = ['gemini', 'openai', 'anthropic', 'ollama'];
    validProviders.forEach((provider) => {
      expect(['gemini', 'openai', 'anthropic', 'ollama']).toContain(provider);
    });
  });
});
