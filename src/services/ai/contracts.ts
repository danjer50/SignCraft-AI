import type { AIConceptResult, SignConfiguration } from '../../domain/sign.js';

/** FLUX.2 Klein reference images must be smaller than 512 pixels on either side. */
export const MAX_AI_IMAGE_SIDE = 511;

export interface ImageEditingRequest {
  sourceIdentity?: string;
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
