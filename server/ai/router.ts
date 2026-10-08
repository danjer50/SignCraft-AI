import type { AIErrorCode, AIProviderFailureDiagnostic } from '../../src/domain/sign.js';
import { DemoAIProvider } from './DemoAIProvider.js';
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  DEFAULT_TOTAL_TIMEOUT_MS,
  MINIMUM_ATTEMPT_BUDGET_MS,
  readDuration,
} from './http.js';
import { AI_PROVIDER_ENTRIES, DEFAULT_PROVIDER_ORDER, findProviderEntry } from './providerFactory.js';
import { logAIDiagnostic, normalizeResponseContentType, sanitizeAIDiagnosticText } from './diagnostics.js';
import type { AIProviderEntry } from './providerFactory.js';
import type {
  AIEnvironment,
  AIProviderOptions,
  AITask,
  ServerAIResult,
  ServerImageEditInput,
  TextGenerationInput,
  TextGenerationResult,
} from './types.js';

export interface ChainStep {
  readonly entry: AIProviderEntry;
  /** Why this provider is in the chain: pinned by AI_PROVIDER, listed in the order, or default. */
  readonly requested: 'pinned' | 'listed' | 'default';
}

export interface SkippedProvider {
  readonly id: string;
  readonly reason: 'unconfigured' | 'unsupported';
}

export interface ResolvedChain {
  readonly attempts: readonly ChainStep[];
  readonly skipped: readonly SkippedProvider[];
  readonly pinned?: string;
  /** `AI_PROVIDER` was set to a name that has no adapter at all. */
  readonly unknownProvider?: string;
  /** The pinned provider exists but cannot serve the requested task. */
  readonly unsupportedPinned?: string;
}

export interface AIChainOptions {
  /** Injection point for tests; production always uses the platform `fetch`. */
  fetchImpl?: typeof fetch;
  providerTimeoutMs?: number;
  totalTimeoutMs?: number;
}

interface AttemptFailure {
  readonly providerId: string;
  readonly errorCode: AIErrorCode;
  readonly message: string;
  readonly providerHttpStatus?: number;
  readonly providerErrorCode?: string;
  readonly providerErrorMessage?: string;
}

type AttemptOutcome<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      errorCode: AIErrorCode;
      message: string;
      providerHttpStatus?: number;
      providerErrorCode?: string;
      providerErrorMessage?: string;
    };

/**
 * Server logs only ever carry the provider id, its model and a failure category. Prompts, photos,
 * API keys and provider response bodies are never logged.
 */
function log(message: string): void {
  console.info(`[AI] ${message}`);
}

function parseProviderOrder(value: string | undefined): string[] | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ids: string[] = [];
  for (const raw of value.split(',')) {
    const id = raw.trim().toLowerCase();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.length > 0 ? ids : null;
}

/**
 * Work out which providers to try, in which order, for one task.
 *
 * - `AI_PROVIDER` pins a single provider to the front (its legacy meaning). Every other configured
 *   provider still follows as a fallback.
 * - `AI_PROVIDER_ORDER` sets priority; configured providers omitted by a stale order are appended
 *   as fallbacks. This prevents a present credential from being misreported as zero providers.
 * - A provider that is only in the chain because of the default/fallback order and has no
 *   credentials is skipped silently; one the operator explicitly pinned or listed is still
 *   attempted so its own "not configured" message is reported instead of a vague error.
 * - A provider that cannot serve the task is never called for it.
 */
export function resolveProviderChain(task: AITask, environment: AIEnvironment = {}): ResolvedChain {
  const requestedOrder = parseProviderOrder(environment.AI_PROVIDER_ORDER);
  const knownOrder = requestedOrder?.filter((id) => findProviderEntry(id) !== undefined) ?? [];
  const explicitOrder = knownOrder.length > 0 ? knownOrder : null;
  if (requestedOrder && !explicitOrder) {
    log(`AI_PROVIDER_ORDER does not name any known provider; using the default order (${DEFAULT_PROVIDER_ORDER.join(',')})`);
  }
  // Treat AI_PROVIDER_ORDER as an order, not an allowlist. Older deployments commonly keep the
  // value that existed before a provider adapter was added; appending only omitted providers that
  // are actually configured preserves the chosen priority without hiding usable credentials.
  const configuredFallbacks = explicitOrder
    ? AI_PROVIDER_ENTRIES
      .filter((entry) => entry.capabilities.includes(task)
        && entry.isConfigured(environment)
        && !explicitOrder.includes(entry.id))
      .map((entry) => entry.id)
    : [];
  const order = explicitOrder ? [...explicitOrder, ...configuredFallbacks] : [...DEFAULT_PROVIDER_ORDER];

  const pinnedName = environment.AI_PROVIDER?.trim().toLowerCase();
  const pinnedRequest = pinnedName && pinnedName !== 'demo' ? pinnedName : undefined;
  const pinnedEntry = pinnedRequest ? findProviderEntry(pinnedRequest) : undefined;
  const unknownProvider = pinnedRequest && !pinnedEntry ? pinnedRequest : undefined;

  const ids = pinnedEntry && pinnedRequest ? [pinnedRequest, ...order] : order;
  const attempts: ChainStep[] = [];
  const skipped: SkippedProvider[] = [];
  let unsupportedPinned: string | undefined;
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = findProviderEntry(id);
    if (!entry) continue;
    const requested: ChainStep['requested'] = id === pinnedEntry?.id
      ? 'pinned'
      : explicitOrder?.includes(id) ? 'listed' : 'default';
    if (!entry.capabilities.includes(task)) {
      skipped.push({ id, reason: 'unsupported' });
      if (requested === 'pinned') unsupportedPinned = id;
      continue;
    }
    if (!entry.isConfigured(environment) && requested === 'default') {
      skipped.push({ id, reason: 'unconfigured' });
      continue;
    }
    attempts.push({ entry, requested });
  }

  return {
    attempts,
    skipped,
    ...(pinnedEntry?.id ? { pinned: pinnedEntry.id } : {}),
    ...(unknownProvider ? { unknownProvider } : {}),
    ...(unsupportedPinned ? { unsupportedPinned } : {}),
  };
}

function describeChain(task: AITask, chain: ResolvedChain): void {
  const skipped = chain.skipped.map((entry) => `${entry.id} (${entry.reason})`);
  log(`task=${task} chain=[${chain.attempts.map((step) => step.entry.id).join(', ')}]`
    + (skipped.length > 0 ? ` skipped=[${skipped.join(', ')}]` : ''));
}

/** Short, non-secret failure category used in aggregated error messages. */
function failureCategory(errorCode: AIErrorCode): string {
  switch (errorCode) {
    case 'AI_NOT_CONFIGURED': return 'not configured';
    case 'AI_AUTHENTICATION': return 'authentication failed';
    case 'AI_RATE_LIMITED': return 'rate limited';
    case 'AI_CREDITS_EXHAUSTED': return 'quota exhausted';
    case 'AI_TIMEOUT': return 'timed out';
    case 'AI_PROVIDER_UNAVAILABLE': return 'temporarily unavailable';
    case 'AI_INVALID_RESPONSE': return 'invalid response';
    case 'AI_UNCHANGED_IMAGE': return 'unchanged source image';
    case 'AI_IMAGE_PREPARATION': return 'image preparation failed';
    case 'AI_NETWORK_ERROR': return 'network error';
    case 'AI_REQUEST_REJECTED': return 'request rejected';
  }
}

/**
 * When every provider failed, the most transient failure is the most useful one to surface: a
 * rate limit or a timeout tells the customer to retry, while "not configured" is an operator
 * problem. The message still lists every attempt, so the real cause is never hidden.
 */
const TRANSIENT_FIRST: readonly AIErrorCode[] = [
  'AI_RATE_LIMITED',
  'AI_CREDITS_EXHAUSTED',
  'AI_TIMEOUT',
  'AI_PROVIDER_UNAVAILABLE',
  'AI_NETWORK_ERROR',
  'AI_AUTHENTICATION',
  'AI_UNCHANGED_IMAGE',
  'AI_INVALID_RESPONSE',
  'AI_REQUEST_REJECTED',
  'AI_IMAGE_PREPARATION',
  'AI_NOT_CONFIGURED',
];

function pickFinalErrorCode(failures: readonly AttemptFailure[], fallback: AIErrorCode): AIErrorCode {
  for (const candidate of TRANSIENT_FIRST) {
    if (failures.some((failure) => failure.errorCode === candidate)) return candidate;
  }
  return fallback;
}

function summarizeFailures(failures: readonly AttemptFailure[]): string {
  return failures.map((failure) => {
    const status = failure.providerHttpStatus ? ` HTTP ${failure.providerHttpStatus}` : '';
    const detail = failure.providerErrorMessage ? ` — ${failure.providerErrorMessage}` : '';
    return `${failure.providerId}: ${failureCategory(failure.errorCode)}${status}${detail}`;
  }).join('; ');
}

function publicFailureDetails(failures: readonly AttemptFailure[]): AIProviderFailureDiagnostic[] {
  return failures.map((failure) => ({
    providerId: failure.providerId,
    errorCode: failure.errorCode,
    ...(failure.providerHttpStatus ? { providerHttpStatus: failure.providerHttpStatus } : {}),
    ...(failure.providerErrorMessage ? { providerErrorMessage: failure.providerErrorMessage } : {}),
  }));
}

/**
 * Try each provider at most once, in order, stopping at the first success.
 *
 * Providers are called sequentially and never in parallel, so a healthy first provider costs
 * exactly one request. Each attempt gets the smaller of the per-provider timeout and whatever is
 * left of the total budget, and the loop stops before starting an attempt that cannot finish.
 */
async function runChain<T>(
  task: AITask,
  chain: ResolvedChain,
  environment: AIEnvironment,
  options: AIChainOptions,
  attempt: (entry: AIProviderEntry, providerOptions: AIProviderOptions) => Promise<AttemptOutcome<T>>,
): Promise<{ value?: T; failures: AttemptFailure[] }> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const providerTimeoutMs = options.providerTimeoutMs
    ?? readDuration(environment.AI_PROVIDER_TIMEOUT_MS, DEFAULT_PROVIDER_TIMEOUT_MS, 1_000, 600_000);
  const totalTimeoutMs = options.totalTimeoutMs
    ?? readDuration(environment.AI_TOTAL_TIMEOUT_MS, DEFAULT_TOTAL_TIMEOUT_MS, 1_000, 600_000);
  const deadline = Date.now() + totalTimeoutMs;
  const failures: AttemptFailure[] = [];

  for (const [index, step] of chain.attempts.entries()) {
    const remaining = deadline - Date.now();
    // The first attempt always runs: a small configured budget must not mean "no attempt at all".
    // Later providers are only started when enough of the shared budget is left to be useful.
    if (failures.length > 0 && remaining < MINIMUM_ATTEMPT_BUDGET_MS) {
      log(`skipping provider: ${step.entry.id} (request budget exhausted)`);
      break;
    }
    const provider = step.entry.id;
    const model = step.entry.model(environment);
    let providerReached: boolean | null = false;
    let httpStatus: number | null = null;
    let responseContentType: string | null = null;
    const diagnosticFetch: typeof fetch = async (request, init) => {
      if (task === 'image-edit') {
        logAIDiagnostic({
          stage: 'provider-request',
          provider,
          model,
          providerReached: null,
          validatedImageDataReturned: false,
        }, environment);
      }
      let response: Response;
      try {
        response = await fetchImpl(request, init);
      } catch (error) {
        providerReached = null;
        throw error;
      }
      providerReached = true;
      httpStatus = response.status;
      responseContentType = normalizeResponseContentType(response.headers.get('content-type'));
      if (task === 'image-edit') {
        logAIDiagnostic({
          stage: 'provider-response',
          provider,
          model,
          providerReached,
          httpStatus,
          responseContentType,
          validatedImageDataReturned: false,
        }, environment);
      }
      return response;
    };
    const providerOptions: AIProviderOptions = {
      fetchImpl: diagnosticFetch,
      timeoutMs: Math.min(providerTimeoutMs, remaining),
    };
    if (task === 'image-edit') {
      logAIDiagnostic({
        stage: 'pre-provider',
        provider,
        model,
        providerReached: false,
        validatedImageDataReturned: false,
      }, environment);
    }
    const safeModel = sanitizeAIDiagnosticText(model, environment) ?? 'unknown';
    log(`trying provider: ${provider} (task=${task}, model=${safeModel})`);

    let outcome: AttemptOutcome<T>;
    try {
      outcome = await attempt(step.entry, providerOptions);
    } catch {
      outcome = {
        ok: false,
        errorCode: 'AI_PROVIDER_UNAVAILABLE',
        message: 'The AI provider adapter failed before returning a usable result.',
      };
    }

    if (outcome.ok) {
      if (task === 'image-edit') {
        logAIDiagnostic({
          stage: 'success',
          provider,
          model,
          providerReached,
          httpStatus,
          responseContentType,
          validatedImageDataReturned: true,
        }, environment);
      }
      log(`${step.entry.id} succeeded`);
      return { value: outcome.value, failures };
    }
    const validatedImageDataReturned = task === 'image-edit' && outcome.errorCode === 'AI_UNCHANGED_IMAGE';
    if (task === 'image-edit') {
      logAIDiagnostic({
        stage: 'error',
        provider,
        model,
        providerReached,
        httpStatus,
        responseContentType,
        errorCode: outcome.errorCode,
        providerErrorCode: outcome.providerErrorCode,
        errorMessage: outcome.providerErrorMessage ?? outcome.message,
        validatedImageDataReturned,
      }, environment);
    }
    failures.push({
      providerId: step.entry.id,
      errorCode: outcome.errorCode,
      message: outcome.message,
      ...(outcome.providerHttpStatus ? { providerHttpStatus: outcome.providerHttpStatus } : {}),
      ...(outcome.providerErrorCode ? { providerErrorCode: outcome.providerErrorCode } : {}),
      ...(outcome.providerErrorMessage ? { providerErrorMessage: outcome.providerErrorMessage } : {}),
    });
    const failureHttpStatus = outcome.providerHttpStatus ? `, HTTP ${outcome.providerHttpStatus}` : '';
    const safeProviderDetail = sanitizeAIDiagnosticText(outcome.providerErrorMessage, environment);
    const safeDetail = safeProviderDetail ? `: ${safeProviderDetail}` : '';
    log(`${step.entry.id} failed (${outcome.errorCode}${failureHttpStatus})${safeDetail}`);
    const next = chain.attempts[index + 1];
    if (next) log(`falling back to ${next.entry.id}`);
  }

  return { failures };
}

/**
 * The chain had nothing to try. This keeps the original, honest behaviour: an unconfigured
 * deployment returns an explicit "nothing was edited" result instead of calling anything.
 */
async function nothingAttemptedResult(chain: ResolvedChain, environment: AIEnvironment, input: ServerImageEditInput): Promise<ServerAIResult> {
  if (chain.unknownProvider) {
    return new DemoAIProvider(`Provider “${chain.unknownProvider}” has no server adapter installed yet.`).generate(input);
  }
  // A provider the operator really configured, but which cannot do this task (Groq has no image
  // models), is worth naming: it is the difference between "not set up" and "set up wrongly".
  const unsupportedButConfigured = chain.skipped
    .filter((entry) => entry.reason === 'unsupported' && findProviderEntry(entry.id)?.isConfigured(environment))
    .map((entry) => entry.id);
  if (unsupportedButConfigured.length > 0) {
    return new DemoAIProvider(
      `Provider${unsupportedButConfigured.length > 1 ? 's' : ''} “${unsupportedButConfigured.join(', ')}” cannot serve storefront image edits (no image models), and no image provider is configured.`,
    ).generate(input);
  }
  return new DemoAIProvider().generate(input);
}

/**
 * Run one storefront image-edit request through the provider chain.
 *
 * This is the only entry point the AI HTTP handler uses, so the rest of SignCraft AI never needs to
 * know which provider actually produced the image.
 */
export async function runImageEditTask(
  input: ServerImageEditInput,
  environment: AIEnvironment = {},
  options: AIChainOptions = {},
): Promise<ServerAIResult> {
  const chain = resolveProviderChain('image-edit', environment);
  describeChain('image-edit', chain);

  const { value, failures } = await runChain<ServerAIResult>('image-edit', chain, environment, options, async (entry, providerOptions) => {
    const provider = entry.createImageProvider?.(environment, providerOptions);
    if (!provider) {
      return {
        ok: false,
        errorCode: 'AI_NOT_CONFIGURED',
        message: `Provider “${entry.id}” has no image adapter installed.`,
      };
    }
    const result = await provider.generate(input);
    return result.status === 'GENERATED'
      ? { ok: true, value: result }
      : {
          ok: false,
          errorCode: result.errorCode,
          message: result.message,
          ...(result.providerHttpStatus ? { providerHttpStatus: result.providerHttpStatus } : {}),
          ...(result.providerErrorCode ? { providerErrorCode: result.providerErrorCode } : {}),
          ...(result.providerErrorMessage ? { providerErrorMessage: result.providerErrorMessage } : {}),
        };
  });

  if (value) return value;
  if (failures.length === 0) {
    logAIDiagnostic({
      stage: 'pre-provider',
      provider: 'none',
      providerReached: false,
      validatedImageDataReturned: false,
    }, environment);
    const result = await nothingAttemptedResult(chain, environment, input);
    if (result.status !== 'GENERATED') {
      logAIDiagnostic({
        stage: 'error',
        provider: 'none',
        providerReached: false,
        errorCode: result.errorCode,
        errorMessage: result.message,
        validatedImageDataReturned: false,
      }, environment);
    }
    return result;
  }
  if (failures.length === 1) {
    // A single failed provider keeps its own message and upstream diagnostics.
    return {
      status: 'ERROR',
      providerId: failures[0].providerId,
      errorCode: failures[0].errorCode,
      message: failures[0].message,
      ...(failures[0].providerHttpStatus ? { providerHttpStatus: failures[0].providerHttpStatus } : {}),
      ...(failures[0].providerErrorCode ? { providerErrorCode: failures[0].providerErrorCode } : {}),
      ...(failures[0].providerErrorMessage ? { providerErrorMessage: failures[0].providerErrorMessage } : {}),
    };
  }
  const errorCode = pickFinalErrorCode(failures, 'AI_PROVIDER_UNAVAILABLE');
  const safeFailureSummary = sanitizeAIDiagnosticText(summarizeFailures(failures), environment);
  log(`all providers failed: ${safeFailureSummary ?? 'provider errors were not available'}`);
  return {
    status: 'ERROR',
    providerId: 'ai-router',
    errorCode,
    message: `No configured AI provider could complete this request. ${summarizeFailures(failures)}. The source storefront has not been edited.`,
    providerFailures: publicFailureDetails(failures),
  };
}

/**
 * Run a plain text-generation request through the chain.
 *
 * No SignCraft screen uses this yet: sign design is an image task. It exists so the capability
 * model is complete and a future text feature (and the Groq adapter) is wired without touching the
 * router or the HTTP layer again.
 */
export async function runTextGeneration(
  input: TextGenerationInput,
  environment: AIEnvironment = {},
  options: AIChainOptions = {},
): Promise<TextGenerationResult> {
  const chain = resolveProviderChain('text', environment);
  describeChain('text', chain);

  const { value, failures } = await runChain<TextGenerationResult>('text', chain, environment, options, async (entry, providerOptions) => {
    const provider = entry.createTextProvider?.(environment, providerOptions);
    if (!provider) {
      return { ok: false, errorCode: 'AI_NOT_CONFIGURED', message: `Provider “${entry.id}” has no text adapter installed.` };
    }
    const result = await provider.generateText(input);
    return result.status === 'GENERATED'
      ? { ok: true, value: result }
      : { ok: false, errorCode: result.errorCode, message: result.message };
  });

  if (value) return value;
  if (failures.length === 0) {
    return {
      status: 'ERROR',
      providerId: 'ai-router',
      errorCode: 'AI_NOT_CONFIGURED',
      message: 'No text-generation provider is configured on the server.',
    };
  }
  if (failures.length === 1) {
    return { status: 'ERROR', providerId: failures[0].providerId, errorCode: failures[0].errorCode, message: failures[0].message };
  }
  const errorCode = pickFinalErrorCode(failures, 'AI_PROVIDER_UNAVAILABLE');
  const safeFailureSummary = sanitizeAIDiagnosticText(summarizeFailures(failures), environment);
  log(`all providers failed: ${safeFailureSummary ?? 'provider errors were not available'}`);
  return {
    status: 'ERROR',
    providerId: 'ai-router',
    errorCode,
    message: `No configured AI provider could complete this request. ${summarizeFailures(failures)}.`,
  };
}

export interface AIProviderSummary {
  readonly id: string;
  readonly label: string;
  readonly model: string;
  readonly capabilities: readonly AITask[];
  readonly configured: boolean;
}

/** Non-secret view of the AI configuration for the admin dashboard. */
export function describeAiProviders(environment: AIEnvironment = {}): {
  order: string[];
  providers: AIProviderSummary[];
} {
  return {
    order: resolveProviderChain('image-edit', environment).attempts.map((step) => step.entry.id),
    providers: AI_PROVIDER_ENTRIES.map((entry) => ({
      id: entry.id,
      label: entry.label,
      model: entry.model(environment),
      capabilities: entry.capabilities,
      configured: entry.isConfigured(environment),
    })),
  };
}
