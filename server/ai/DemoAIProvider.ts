import type { ServerAIProvider, ServerAIResult, ServerImageEditInput } from './types';

export class DemoAIProvider implements ServerAIProvider {
  readonly id = 'demo-unconfigured';

  constructor(private readonly reason = 'No secure image-editing provider is configured.') {}

  async generate(_input: ServerImageEditInput): Promise<ServerAIResult> {
    return {
      status: 'UNAVAILABLE',
      providerId: this.id,
      message: `${this.reason} The source storefront has not been edited.`,
    };
  }
}
