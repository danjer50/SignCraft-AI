import type { AIErrorCode, SignConfiguration } from '../../src/domain/sign.js';

/**
 * Server-side AI environment.
 *
 * Every value here is server-only: `api/**` reads it from `process.env` and
 * `functions/**` receives it through the Cloudflare Pages `env` binding. None of it is ever
 * serialized into a response, logged or forwarded to the browser.
 *
 * `AI_PROVIDER` keeps its original meaning: it pins one provider to the front of the chain.
 * The multi-provider settings below let a request continue on another provider when the pinned
 * (or first) provider is rate-limited or unavailable.
 */
export interface AIEnvironment {
  /** Legacy single-provider pin, e.g. `cloudflare-flux`. `demo`/empty means "no pin". */
  AI_PROVIDER?: string;
  /** Reserved for future adapters; unused today (kept so existing deployments keep working). */
  AI_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;

  /** Ordered, comma-separated provider ids; other configured providers remain fallbacks. */
  AI_PROVIDER_ORDER?: string;
  /** Per-provider request timeout in milliseconds. */
  AI_PROVIDER_TIMEOUT_MS?: string;
  /** Whole-chain budget in milliseconds; must stay below the client's own abort. */
  AI_TOTAL_TIMEOUT_MS?: string;

  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  /**
   * Pollinations image edits. Opt-in: nothing is sent to Pollinations unless it is named in
   * `AI_PROVIDER_ORDER` (or pinned with `AI_PROVIDER=pollinations`), so the documented default
   * order above is unchanged.
   */
  POLLINATIONS_API_KEY?: string;
  POLLINATIONS_MODEL?: string;
}

/**
 * What a provider can actually do. SignCraft's existing (and only) AI feature is storefront
 * image editing, so `image-edit` is the capability the studio needs. Providers that cannot
 * serve a task are never called for it: the router marks them unsupported and moves on, so an
 * incompatible request is never sent on the off-chance that it works.
 */
export const AI_TASKS = ['image-edit', 'text'] as const;
export type AITask = (typeof AI_TASKS)[number];

export interface ServerImageEditInput {
  image: {
    bytes: Uint8Array;
    fileName: string;
    mimeType: string;
    width: number;
    height: number;
  };
  configuration: SignConfiguration;
  prompt: string;
  /** Reserved for providers that support true mask-based inpainting. */
  mask?: Uint8Array;
  preserveSourceArchitecture: true;
  exactTextOverlayRequired: true;
}

export type ServerAIResult =
  | { status: 'GENERATED'; providerId: string; imageUrl: string; createdAt: string }
  | { status: 'UNAVAILABLE' | 'ERROR'; providerId: string; message: string; errorCode: AIErrorCode };

/** Unchanged legacy contract: any provider that can serve the storefront image task. */
export interface ServerAIProvider {
  readonly id: string;
  generate(input: ServerImageEditInput): Promise<ServerAIResult>;
}

/**
 * A provider that can be listed in `AI_PROVIDER_ORDER`: it declares which tasks it supports so
 * the router can skip it without spending a request on an incompatible call.
 */
export interface ServerAIImageProvider extends ServerAIProvider {
  readonly capabilities: readonly AITask[];
}

export interface TextGenerationInput {
  prompt: string;
  systemPrompt?: string;
  /** Optional model override; the provider falls back to its configured model. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export type TextGenerationResult =
  | { status: 'GENERATED'; providerId: string; model: string; text: string }
  | { status: 'ERROR'; providerId: string; errorCode: AIErrorCode; message: string };

/** A provider that can serve a plain text-generation task (no SignCraft screen calls this yet). */
export interface ServerAITextProvider {
  readonly id: string;
  readonly capabilities: readonly AITask[];
  generateText(input: TextGenerationInput): Promise<TextGenerationResult>;
}

/** Options the router passes to an adapter so tests can inject a fetch implementation and budget. */
export interface AIProviderOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}
