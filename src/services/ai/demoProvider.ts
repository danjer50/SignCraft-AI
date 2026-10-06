import type { AIProvider, ImageEditingRequest } from './contracts';
import type { AIConceptResult } from '../../domain/sign';

/** The demo provider never paints, fabricates or returns a placeholder image. */
export class DemoAIProvider implements AIProvider {
  readonly id = 'demo-unconfigured';

  async generate(_request: ImageEditingRequest): Promise<AIConceptResult> {
    return {
      status: 'UNAVAILABLE',
      providerId: this.id,
      message: 'No image-editing provider is configured. Your storefront photo has not been edited.',
      createdAt: new Date().toISOString(),
      sourceImageTransfer: 'LOCAL_ONLY',
    };
  }
}
