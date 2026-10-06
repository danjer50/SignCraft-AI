import type { AIConceptResult, SignConfiguration } from '../../domain/sign';

export interface ImageEditingRequest {
  sourceImage: File;
  configuration: SignConfiguration;
  prompt: string;
  /** Future inpainting adapters can use this mask to restrict edits to the sign surface. */
  mask?: Blob;
  preserveSourceArchitecture: true;
  exactTextOverlayRequired: true;
  outputAspectRatio?: string;
}

export interface AIProvider {
  readonly id: string;
  generate(request: ImageEditingRequest): Promise<AIConceptResult>;
}

export type { AIConceptResult };
