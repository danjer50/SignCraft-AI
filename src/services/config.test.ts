import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `clientConfig.aiMode` decides whether the browser calls the server at all, so its default is a
 * product behaviour, not a detail: a missing or misspelled `VITE_AI_MODE` used to switch the whole
 * AI feature off and then report "demo mode" on the result page.
 */
async function readAiMode(value: string | undefined): Promise<string> {
  vi.resetModules();
  vi.stubEnv('VITE_AI_MODE', value as string);
  const { clientConfig } = await import('./config');
  return clientConfig.aiMode;
}

async function readQuoteMode(value: string | undefined): Promise<string> {
  vi.resetModules();
  vi.stubEnv('VITE_QUOTE_MODE', value as string);
  const { clientConfig } = await import('./config');
  return clientConfig.quoteMode;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('client feature modes', () => {
  it('calls the server by default when VITE_AI_MODE is not set', async () => {
    expect(await readAiMode(undefined)).toBe('api');
    expect(await readAiMode('')).toBe('api');
    expect(await readAiMode('   ')).toBe('api');
  });

  it('accepts the documented values, ignoring case and surrounding whitespace', async () => {
    expect(await readAiMode('api')).toBe('api');
    expect(await readAiMode(' API ')).toBe('api');
    expect(await readAiMode('demo')).toBe('demo');
    expect(await readAiMode('Demo')).toBe('demo');
  });

  it('falls back to the server mode for an unrecognised value instead of disabling AI silently', async () => {
    expect(await readAiMode('live')).toBe('api');
    expect(await readAiMode('off')).toBe('api');
  });

  it('keeps the quote mode default unchanged', async () => {
    expect(await readQuoteMode(undefined)).toBe('local');
    expect(await readQuoteMode('api')).toBe('api');
    expect(await readQuoteMode('nonsense')).toBe('local');
  });
});
