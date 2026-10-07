import { CLOUDFLARE_FLUX_MODEL, CloudflareFluxProvider } from './providers/cloudflareFlux.js';
import { GEMINI_DEFAULT_MODEL, GeminiImageProvider } from './providers/gemini.js';
import { GROQ_DEFAULT_MODEL, GroqTextProvider } from './providers/groq.js';
import { OPENROUTER_DEFAULT_MODEL, OpenRouterImageProvider } from './providers/openRouter.js';
import { POLLINATIONS_DEFAULT_MODEL, PollinationsImageProvider } from './providers/pollinations.js';
import type {
  AIEnvironment,
  AIProviderOptions,
  AITask,
  ServerAIImageProvider,
  ServerAITextProvider,
} from './types.js';

/**
 * One entry per AI provider. Adding a provider means adding an entry here plus its adapter file —
 * nothing in the studio, the API handlers or the UI changes.
 */
export interface AIProviderEntry {
  readonly id: string;
  /** Human-readable name for logs and the admin dashboard. */
  readonly label: string;
  /** The tasks this provider can really serve; the router never sends it anything else. */
  readonly capabilities: readonly AITask[];
  /** The model currently configured for this provider (never a secret). */
  model(environment: AIEnvironment): string;
  /** True when the credentials for this provider are present in the server environment. */
  isConfigured(environment: AIEnvironment): boolean;
  createImageProvider?(environment: AIEnvironment, options?: AIProviderOptions): ServerAIImageProvider;
  createTextProvider?(environment: AIEnvironment, options?: AIProviderOptions): ServerAITextProvider;
}

/**
 * Default fallback order, used when `AI_PROVIDER_ORDER` is not set.
 *
 * Groq is listed first because that is the requested order, but it declares only `text` support,
 * so the image router skips it without spending a request (see PHASE 8 capability handling).
 *
 * Cloudflare Workers AI closes the default chain on purpose. It is the provider SignCraft AI
 * shipped with, so an existing deployment usually has exactly those two credentials and no
 * `AI_PROVIDER_ORDER` at all; without it in the default order such a deployment would have image
 * credentials present and still answer "no provider configured". As a `default` step it is skipped
 * silently when unconfigured, it never displaces an explicitly listed provider, and an explicit
 * `AI_PROVIDER_ORDER` still replaces the whole default order.
 *
 * Pollinations is deliberately absent: it joins the chain only when an operator names it in
 * `AI_PROVIDER_ORDER` or pins it with `AI_PROVIDER=pollinations`, so it stays opt-in.
 */
export const DEFAULT_PROVIDER_ORDER = ['groq', 'gemini', 'openrouter', 'cloudflare-flux'] as const;

function nonEmpty(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export const AI_PROVIDER_ENTRIES: readonly AIProviderEntry[] = [
  {
    id: 'groq',
    label: 'Groq',
    capabilities: ['text'],
    model: (environment) => environment.GROQ_MODEL?.trim() || GROQ_DEFAULT_MODEL,
    isConfigured: (environment) => nonEmpty(environment.GROQ_API_KEY),
    createTextProvider: (environment, options) => new GroqTextProvider(environment, options),
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    capabilities: ['image-edit'],
    model: (environment) => environment.GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL,
    isConfigured: (environment) => nonEmpty(environment.GEMINI_API_KEY),
    createImageProvider: (environment, options) => new GeminiImageProvider(environment, options),
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    capabilities: ['image-edit'],
    model: (environment) => environment.OPENROUTER_MODEL?.trim() || OPENROUTER_DEFAULT_MODEL,
    isConfigured: (environment) => nonEmpty(environment.OPENROUTER_API_KEY),
    createImageProvider: (environment, options) => new OpenRouterImageProvider(environment, options),
  },
  {
    id: 'cloudflare-flux',
    label: 'Cloudflare Workers AI (FLUX.2 Klein 9B)',
    capabilities: ['image-edit'],
    model: () => CLOUDFLARE_FLUX_MODEL,
    isConfigured: (environment) => /^[a-f0-9]{32}$/i.test(environment.CLOUDFLARE_ACCOUNT_ID?.trim() ?? '')
      && nonEmpty(environment.CLOUDFLARE_API_TOKEN),
    createImageProvider: (environment, options) => new CloudflareFluxProvider(
      environment,
      options?.fetchImpl,
      options?.timeoutMs,
    ),
  },
  {
    /**
     * Opt-in image provider: it is never called unless named in `AI_PROVIDER_ORDER` or pinned with
     * `AI_PROVIDER=pollinations`, and it declares only the image-edit capability (Pollinations also
     * serves text, but SignCraft's text task has no Pollinations adapter, so the router would never
     * schedule it for text).
     */
    id: 'pollinations',
    label: 'Pollinations (image edits)',
    capabilities: ['image-edit'],
    model: (environment) => environment.POLLINATIONS_MODEL?.trim() || POLLINATIONS_DEFAULT_MODEL,
    isConfigured: (environment) => nonEmpty(environment.POLLINATIONS_API_KEY),
    createImageProvider: (environment, options) => new PollinationsImageProvider(environment, options),
  },
];

/** Provider names are matched case-insensitively, the same way `AI_PROVIDER` always has been. */
export function findProviderEntry(id: string): AIProviderEntry | undefined {
  const normalized = id.trim().toLowerCase();
  return AI_PROVIDER_ENTRIES.find((entry) => entry.id === normalized);
}

/**
 * Create one provider adapter by id. `AI_PROVIDER` is resolved through the router, which may try
 * several providers; this helper builds a single adapter (used by the router and by tests).
 */
export function createAIProvider(
  id: string,
  environment: AIEnvironment,
  options: AIProviderOptions = {},
): ServerAIImageProvider | undefined {
  return findProviderEntry(id)?.createImageProvider?.(environment, options);
}
