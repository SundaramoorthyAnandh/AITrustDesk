import { describe, it, expect, afterEach } from 'vitest';
import { env } from '../src/config/env.js';
import { makeProvider, isLlmConfigured } from '../src/container.js';

/** The app must never break on missing LLM env — it falls back to the mock. */
describe('LLM provider fallback', () => {
  const original = env.OPENAI_API_KEY;
  afterEach(() => {
    env.OPENAI_API_KEY = original;
  });

  it('falls back to the mock when langchain is requested but no key is configured', () => {
    env.OPENAI_API_KEY = '';
    expect(isLlmConfigured()).toBe(false);
    expect(makeProvider(true).constructor.name).toBe('MockProvider');
  });

  it('treats a whitespace-only key as not configured', () => {
    env.OPENAI_API_KEY = '   ';
    expect(isLlmConfigured()).toBe(false);
    expect(makeProvider(true).constructor.name).toBe('MockProvider');
  });

  it('uses the mock whenever langchain is not requested (even with a key)', () => {
    env.OPENAI_API_KEY = 'sk-test';
    expect(makeProvider(false).constructor.name).toBe('MockProvider');
  });

  it('uses langchain only when it is both requested and configured', () => {
    env.OPENAI_API_KEY = 'sk-test-123';
    expect(isLlmConfigured()).toBe(true);
    expect(makeProvider(true).constructor.name).toBe('LangChainProvider');
  });
});
