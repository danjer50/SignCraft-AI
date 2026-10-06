import type { AIErrorCode, SignConfiguration } from '../../src/domain/sign';

export interface AIEnvironment {
  AI_PROVIDER?: string;
  AI_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
}

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

export interface ServerAIProvider {
  readonly id: string;
  generate(input: ServerImageEditInput): Promise<ServerAIResult>;
}
