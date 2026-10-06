import type { SignConfiguration } from '../../src/domain/sign';

export interface AIEnvironment {
  AI_PROVIDER?: string;
  AI_API_KEY?: string;
}

export interface ServerImageEditInput {
  image: {
    bytes: Uint8Array;
    fileName: string;
    mimeType: string;
  };
  configuration: SignConfiguration;
  prompt: string;
  mask?: Uint8Array;
  preserveSourceArchitecture: true;
  exactTextOverlayRequired: true;
}

export type ServerAIResult =
  | { status: 'GENERATED'; providerId: string; imageUrl: string; createdAt: string }
  | { status: 'UNAVAILABLE'; providerId: string; message: string };

export interface ServerAIProvider {
  readonly id: string;
  generate(input: ServerImageEditInput): Promise<ServerAIResult>;
}
