// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logAIDiagnostic, normalizeResponseContentType, sanitizeAIDiagnosticText } from './diagnostics.js';

const API_KEY = 'diagnostic-test-secret-never-real';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('safe AI diagnostics', () => {
  it('normalizes response content types to their lower-case media type only', () => {
    expect(normalizeResponseContentType(' Application/JSON ; charset=UTF-8 ')).toBe('application/json');
    expect(normalizeResponseContentType('image/PNG')).toBe('image/png');
    expect(sanitizeAIDiagnosticText('@cf/black-forest-labs/flux-2-klein-9b')).toBe('@cf/black-forest-labs/flux-2-klein-9b');
    expect(normalizeResponseContentType('not a media type')).toBeNull();
    expect(normalizeResponseContentType(null)).toBeNull();
  });

  it('redacts credentials, authorization values, data URLs, and base64-like values', () => {
    const encodedImage = 'iVBORw0KGgoAAAANSUhEUgAAAAAA';
    const message = sanitizeAIDiagnosticText(
      `Authorization: Bearer ${API_KEY}; ${API_KEY}; data:image/png;base64,${encodedImage}`,
      { GEMINI_API_KEY: API_KEY },
    );

    expect(message).toBeDefined();
    expect(message).not.toContain(API_KEY);
    expect(message).not.toContain(encodedImage);
    expect(message).not.toContain('data:image/png;base64');
  });

  it('emits only the allow-listed diagnostic fields with normalized content type', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    logAIDiagnostic({
      stage: 'provider-response',
      provider: 'gemini',
      model: 'gemini-3.1-flash-image',
      providerReached: true,
      httpStatus: 200,
      responseContentType: 'Application/JSON; charset=utf-8',
      errorCode: 'AI_REQUEST_REJECTED',
      providerErrorCode: 'INVALID_ARGUMENT',
      errorMessage: `Bearer ${API_KEY} invalid image bytes`,
      validatedImageDataReturned: false,
    }, { GEMINI_API_KEY: API_KEY });

    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0][0]);
    expect(line.startsWith('[AI_DIAGNOSTIC] ')).toBe(true);
    const record = JSON.parse(line.slice('[AI_DIAGNOSTIC] '.length)) as Record<string, unknown>;
    expect(record).toEqual({
      stage: 'provider-response',
      provider: 'gemini',
      model: 'gemini-3.1-flash-image',
      providerReached: true,
      httpStatus: 200,
      responseContentType: 'application/json',
      errorCode: 'AI_REQUEST_REJECTED',
      providerErrorCode: 'INVALID_ARGUMENT',
      errorMessage: 'Bearer [redacted] invalid image bytes',
      validatedImageDataReturned: false,
    });
    expect(Object.keys(record).sort()).toEqual([
      'errorCode', 'errorMessage', 'httpStatus', 'model', 'provider', 'providerErrorCode',
      'providerReached', 'responseContentType', 'stage', 'validatedImageDataReturned',
    ].sort());
    expect(line).not.toContain(API_KEY);
  });
});
