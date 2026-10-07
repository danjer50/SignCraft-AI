import type { ServerAIProvider, ServerAIResult, ServerImageEditInput } from './types.js';

export class DemoAIProvider implements ServerAIProvider {
  readonly id = 'demo-unconfigured';

  constructor(private readonly reason = 'No secure image-editing provider is configured.') {}

  async generate(_input: ServerImageEditInput): Promise<ServerAIResult> {
    return {
      status: 'UNAVAILABLE',
      providerId: this.id,
      errorCode: 'AI_NOT_CONFIGURED',
      message: `${this.reason} The source storefront has not been edited.`,
    };
  }
}
