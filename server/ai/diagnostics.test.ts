// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  logAIDiagnostic,
  normalizeResponseContentType,
  sanitizeAIDiagnosticText,
  type AIDiagnosticProviderAttempt,
} from './diagnostics.js';

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

  it('redacts credentials, bearer values, user-supplied brief text, contact details, data URLs, and base64', () => {
    const encodedImage = 'iVBORw0KGgoAAAANSUhEUgAAAAAA';
    const message = sanitizeAIDiagnosticText(
      `Invalid prompt for ATELIER SABLE; note Keep the stone arch untouched.; contact sami@example.com +216 20 000 000; Authorization: Bearer ${API_KEY}; data:image/png;base64,${encodedImage}`,
      { GEMINI_API_KEY: API_KEY },
      500,
      ['Atelier Sable', 'Keep the stone arch untouched.'],
    );

    expect(message).toBeDefined();
    expect(message).not.toContain('ATELIER SABLE');
    expect(message).not.toContain('Keep the stone arch untouched.');
    expect(message).not.toContain('sami@example.com');
    expect(message).not.toContain('+216 20 000 000');
    expect(message).not.toContain(API_KEY);
    expect(message).not.toContain(encodedImage);
    expect(message).not.toContain('data:image/png;base64');
  });

  it('emits only the allow-listed fields and distinguishes app status from provider status', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const providerAttempt: AIDiagnosticProviderAttempt = {
      providerId: 'openrouter',
      model: 'google/gemini-3.1-flash-image',
      adapterInvoked: true,
      requestAttempted: true,
      responseReceived: true,
      providerHttpStatus: 200,
      errorCode: 'AI_REQUEST_REJECTED',
      providerErrorCode: 'invalid_model',
      providerErrorMessage: `Model denied for ATELIER SABLE; ${API_KEY}`,
    };

    logAIDiagnostic({
      stage: 'request-summary',
      requestId: '2ce52a9e-f54c-42c2-8c6f-ce3124c2de57',
      provider: 'openrouter',
      model: 'google/gemini-3.1-flash-image',
      providerReached: true,
      providerAdapterInvoked: true,
      providerRequestAttempted: true,
      providerResponseReceived: true,
      appHttpStatus: 422,
      responseCode: 'AI_REQUEST_REJECTED',
      internalErrorCode: 'AI_REQUEST_REJECTED',
      providerHttpStatus: 200,
      responseContentType: 'Application/JSON; charset=utf-8',
      providerErrorCode: 'invalid_model',
      providerErrorMessage: `Model denied for ATELIER SABLE; ${API_KEY}`,
      errorMessage: 'Provider request failed for ATELIER SABLE.',
      providerFailures: [providerAttempt],
      failedBeforeProviderInvocation: false,
      imageValidation: { state: 'passed' },
      configurationValidation: { state: 'passed' },
      sensitiveValues: ['Atelier Sable'],
      validatedImageDataReturned: false,
    }, { OPENROUTER_API_KEY: API_KEY });

    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0][0]);
    expect(line.startsWith('[AI_DIAGNOSTIC] ')).toBe(true);
    const record = JSON.parse(line.slice('[AI_DIAGNOSTIC] '.length)) as Record<string, unknown>;
    expect(record).toMatchObject({
      stage: 'request-summary',
      requestId: '2ce52a9e-f54c-42c2-8c6f-ce3124c2de57',
      appHttpStatus: 422,
      responseCode: 'AI_REQUEST_REJECTED',
      internalErrorCode: 'AI_REQUEST_REJECTED',
      provider: 'openrouter',
      model: 'google/gemini-3.1-flash-image',
      providerAdapterInvoked: true,
      providerRequestAttempted: true,
      providerResponseReceived: true,
      providerReached: true,
      providerHttpStatus: 200,
      responseContentType: 'application/json',
      providerErrorCode: 'invalid_model',
      providerErrorMessage: 'Model denied for [redacted user input]; [redacted]',
      errorMessage: 'Provider request failed for [redacted user input].',
      providerFailures: [{
        providerId: 'openrouter',
        model: 'google/gemini-3.1-flash-image',
        adapterInvoked: true,
        requestAttempted: true,
        responseReceived: true,
        providerHttpStatus: 200,
        internalErrorCode: 'AI_REQUEST_REJECTED',
        providerErrorCode: 'invalid_model',
        providerErrorMessage: 'Model denied for [redacted user input]; [redacted]',
      }],
      failedBeforeProviderInvocation: false,
      imageValidation: { state: 'passed', failureCode: null },
      configurationValidation: { state: 'passed', failureCode: null },
      validatedImageDataReturned: false,
    });
    expect(record).not.toHaveProperty('sensitiveValues');
    expect(line).not.toContain('ATELIER SABLE');
    expect(line).not.toContain(API_KEY);
    expect(Object.keys(record)).toEqual([
      'stage', 'requestId', 'appHttpStatus', 'responseCode', 'internalErrorCode', 'provider', 'model',
      'providerAdapterInvoked', 'providerRequestAttempted', 'providerResponseReceived', 'providerReached',
      'providerHttpStatus', 'responseContentType', 'providerErrorCode', 'providerErrorMessage', 'errorMessage',
      'providerFailures', 'failedBeforeProviderInvocation', 'imageValidation', 'configurationValidation',
      'validatedImageDataReturned',
    ]);
  });

  it('limits provider failure details to five entries', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const attempts = Array.from({ length: 7 }, (_, index): AIDiagnosticProviderAttempt => ({
      providerId: `provider-${index}`,
      model: `model-${index}`,
      adapterInvoked: true,
      requestAttempted: true,
      responseReceived: true,
      providerHttpStatus: 400,
      errorCode: 'AI_REQUEST_REJECTED',
    }));
    logAIDiagnostic({ stage: 'request-summary', providerFailures: attempts });

    const line = String(info.mock.calls[0][0]);
    const record = JSON.parse(line.slice('[AI_DIAGNOSTIC] '.length)) as { providerFailures: unknown[] };
    expect(record.providerFailures).toHaveLength(5);
  });
});
