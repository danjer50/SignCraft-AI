import type { AIErrorCode } from '../../../src/domain/sign.js';
import { DEFAULT_PROVIDER_TIMEOUT_MS, mapHttpStatusToErrorCode, postJson, readProviderMessage } from '../http.js';
import type { AIEnvironment, AIProviderOptions, ServerAITextProvider, TextGenerationInput, TextGenerationResult } from '../types.js';

export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

type GroqEnvelope = {
  choices?: Array<{ message?: { content?: unknown } }>;
  error?: { message?: unknown };
};

function errorMessage(errorCode: AIErrorCode, model: string): string {
  switch (errorCode) {
    case 'AI_NOT_CONFIGURED': return `The Groq model “${model}” is not available for this API key. Check GROQ_MODEL.`;
    case 'AI_AUTHENTICATION': return 'Groq rejected the server API key.';
    case 'AI_RATE_LIMITED': return 'Groq is rate-limited. Please retry shortly.';
    case 'AI_CREDITS_EXHAUSTED': return 'The Groq account has no remaining quota for this model.';
    case 'AI_TIMEOUT': return 'Groq took too long to respond.';
    case 'AI_PROVIDER_UNAVAILABLE': return 'Groq is temporarily unavailable.';
    case 'AI_INVALID_RESPONSE': return 'Groq did not return usable text.';
    case 'AI_IMAGE_PREPARATION': return 'The request could not be prepared.';
    case 'AI_NETWORK_ERROR': return 'Groq could not be reached.';
    case 'AI_REQUEST_REJECTED': return 'Groq rejected this request.';
  }
}

/**
 * Groq adapter.
 *
 * Groq serves text and vision-language models: it cannot generate or edit images at all, so it
 * declares only the `text` capability and the image router never sends it a storefront edit
 * request. Declaring the real capability (instead of trying Groq and hoping) is what keeps a
 * Groq outage from costing a wasted call on every generation.
 *
 * No SignCraft screen calls text generation today; this adapter exists so the provider is really
 * configured and wired the moment a text feature is added, without touching the router again.
 */
export class GroqTextProvider implements ServerAITextProvider {
  readonly id = 'groq';
  readonly capabilities = ['text'] as const;

  private readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(environment: AIEnvironment, options: AIProviderOptions = {}) {
    this.model = environment.GROQ_MODEL?.trim() || GROQ_DEFAULT_MODEL;
    this.apiKey = environment.GROQ_API_KEY?.trim();
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  }

  async generateText(input: TextGenerationInput): Promise<TextGenerationResult> {
    const model = input.model?.trim() || this.model;
    const failure = (errorCode: AIErrorCode): TextGenerationResult => ({
      status: 'ERROR',
      providerId: this.id,
      errorCode,
      message: errorMessage(errorCode, model),
    });

    if (!this.apiKey) return failure('AI_NOT_CONFIGURED');

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (input.systemPrompt?.trim()) messages.push({ role: 'system', content: input.systemPrompt });
    messages.push({ role: 'user', content: input.prompt });

    const result = await postJson(
      GROQ_CHAT_URL,
      { authorization: `Bearer ${this.apiKey}` },
      {
        model,
        messages,
        ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
        ...(typeof input.maxTokens === 'number' ? { max_completion_tokens: input.maxTokens } : {}),
      },
      this.fetchImpl,
      this.timeoutMs,
    );

    const body = result.body as GroqEnvelope | null;
    if (!result.ok) {
      const providerMessage = body?.error?.message;
      return failure(mapHttpStatusToErrorCode(
        result.status,
        typeof providerMessage === 'string' ? providerMessage : readProviderMessage(result.body),
      ));
    }
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return failure('AI_INVALID_RESPONSE');
    return { status: 'GENERATED', providerId: this.id, model, text: content };
  }
}
