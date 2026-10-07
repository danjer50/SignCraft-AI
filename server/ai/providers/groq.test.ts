// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { AIEnvironment } from '../types.js';
import { GROQ_DEFAULT_MODEL, GroqTextProvider } from './groq.js';

const apiKey = 'groq-test-only-key-never-real';
const env: AIEnvironment = { GROQ_API_KEY: apiKey };

function completion(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Groq text provider', () => {
  it('declares text support only, because Groq has no image models', () => {
    const provider = new GroqTextProvider(env);

    expect(provider.capabilities).toEqual(['text']);
    expect(provider.capabilities).not.toContain('image-edit');
    expect(GROQ_DEFAULT_MODEL).not.toMatch(/image/i);
  });

  it('does not call Groq when the API key is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const result = await new GroqTextProvider({}, { fetchImpl: fetchMock })
      .generateText({ prompt: 'Write a slogan' });

    expect(result.status).toBe('ERROR');
    if (result.status === 'ERROR') expect(result.errorCode).toBe('AI_NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends an OpenAI-compatible chat completion with the system prompt and options', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => completion('Sable & Or'));
    const result = await new GroqTextProvider(env, { fetchImpl: fetchMock }).generateText({
      prompt: 'Suggest one slogan.',
      systemPrompt: 'Answer in French.',
      temperature: 0.4,
      maxTokens: 64,
    });
    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      temperature?: number;
      max_completion_tokens?: number;
    };

    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${apiKey}`);
    expect(body.model).toBe(GROQ_DEFAULT_MODEL);
    expect(body.messages).toEqual([
      { role: 'system', content: 'Answer in French.' },
      { role: 'user', content: 'Suggest one slogan.' },
    ]);
    expect(body.temperature).toBe(0.4);
    expect(body.max_completion_tokens).toBe(64);
    expect(result.status).toBe('GENERATED');
    if (result.status === 'GENERATED') {
      expect(result.text).toBe('Sable & Or');
      expect(result.providerId).toBe('groq');
    }
  });

  it('honours GROQ_MODEL and a per-request model override', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => completion('ok'));
    await new GroqTextProvider({ ...env, GROQ_MODEL: 'openai/gpt-oss-20b' }, { fetchImpl: fetchMock })
      .generateText({ prompt: 'hi' });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe('openai/gpt-oss-20b');

    await new GroqTextProvider(env, { fetchImpl: fetchMock }).generateText({ prompt: 'hi', model: 'qwen/qwen3-32b' });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).model).toBe('qwen/qwen3-32b');
  });

  it('maps rate limits, authentication failures and empty answers to safe codes', async () => {
    for (const [status, message, expected] of [
      [429, 'Rate limit reached', 'AI_RATE_LIMITED'],
      [401, 'Invalid API Key', 'AI_AUTHENTICATION'],
      [503, 'Service unavailable', 'AI_PROVIDER_UNAVAILABLE'],
      [400, 'bad request', 'AI_REQUEST_REJECTED'],
    ] as const) {
      const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: { message } }), { status }));
      const result = await new GroqTextProvider(env, { fetchImpl: fetchMock }).generateText({ prompt: 'hi' });

      expect(result.status).toBe('ERROR');
      if (result.status === 'ERROR') expect(result.errorCode).toBe(expected);
    }

    const empty = vi.fn<typeof fetch>(async () => completion('   '));
    const result = await new GroqTextProvider(env, { fetchImpl: empty }).generateText({ prompt: 'hi' });
    expect(result.status).toBe('ERROR');
    if (result.status === 'ERROR') expect(result.errorCode).toBe('AI_INVALID_RESPONSE');
  });

  it('never echoes the API key in its error messages', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: { message: `bad key ${apiKey}` } }),
      { status: 401 },
    ));
    const result = await new GroqTextProvider(env, { fetchImpl: fetchMock }).generateText({ prompt: 'hi' });

    expect(JSON.stringify(result)).not.toContain(apiKey);
  });
});
