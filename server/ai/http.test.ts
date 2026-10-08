// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sanitizeProviderErrorMessage } from './http.js';

describe('sanitizeProviderErrorMessage', () => {
  it('redacts supplied secrets and common provider key formats', () => {
    expect(sanitizeProviderErrorMessage('Authorization: Bearer hidden-token; key=private-value', ['private-value']))
      .toBe('Authorization: Bearer [redacted]; key=[redacted]');
    expect(sanitizeProviderErrorMessage('Invalid key sk-or-v1-12345678901234567890'))
      .toBe('Invalid key [redacted]');
    expect(sanitizeProviderErrorMessage('Credential value.with$special was rejected', ['value.with$special']))
      .toBe('Credential [redacted] was rejected');
  });

  it('removes controls, normalizes whitespace, and truncates long provider messages', () => {
    const message = `Bad input\n\t${'x'.repeat(700)}`;
    const safe = sanitizeProviderErrorMessage(message);
    expect(safe).toHaveLength(500);
    expect(safe).not.toMatch(/[\r\n\t]/);
  });

  it('returns no displayable message for an empty response string', () => {
    expect(sanitizeProviderErrorMessage('  \n ')).toBeUndefined();
  });
});
