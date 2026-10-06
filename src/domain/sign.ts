export const SIGN_TYPES = [
  'threeD',
  'alucobond',
  'led',
  'lightbox',
  'acrylic',
  'channelLetters',
  'vinyl',
  'neonStyle',
  'illuminated',
  'custom',
] as const;

export type SignType = (typeof SIGN_TYPES)[number];

export const SIGN_STYLES = [
  'modern',
  'luxury',
  'minimal',
  'industrial',
  'bold',
  'elegant',
  'classic',
  'colorful',
  'dark',
  'premium',
  'arabic',
  'french',
  'arabicFrench',
] as const;

export type SignStyle = (typeof SIGN_STYLES)[number];

export const BUSINESS_CATEGORIES = [
  'retail',
  'restaurant',
  'cafe',
  'beauty',
  'health',
  'hotel',
  'services',
  'culture',
  'other',
] as const;

export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

export const LIGHTING_TYPES = ['none', 'frontLit', 'halo', 'neon'] as const;
export type LightingType = (typeof LIGHTING_TYPES)[number];

export interface SignConfiguration {
  businessName: string;
  category: BusinessCategory;
  signType: SignType;
  style: SignStyle;
  color: string;
  lighting: LightingType;
  exactText: string;
  widthCm: string;
  heightCm: string;
  notes: string;
}

export interface ImageReference {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  transferState: 'LOCAL_ONLY' | 'UPLOADED';
  /** A small, privacy-friendly browser thumbnail; never treated as an uploaded original. */
  previewDataUrl?: string;
}

export interface UploadedStorefrontPhoto extends ImageReference {
  file: File | null;
  previewUrl: string;
}

export const QUOTE_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUOTED',
  'ACCEPTED',
  'COMPLETED',
  'CANCELLED',
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export interface QuoteCustomer {
  name: string;
  email: string;
  phone: string;
}

export interface ConceptReference {
  status: 'NOT_GENERATED' | 'UNAVAILABLE' | 'GENERATED' | 'ERROR';
  providerId: string;
  sourceImageTransfer?: 'LOCAL_ONLY' | 'SENT_TO_SERVER' | 'UNKNOWN';
  imageUrl?: string;
  createdAt?: string;
  message?: string;
}

export interface QuoteRequest {
  id: string;
  createdAt: string;
  status: QuoteStatus;
  deliveryState: 'LOCAL_DRAFT' | 'CONFIRMED';
  customer: QuoteCustomer;
  business: {
    name: string;
    category: BusinessCategory;
  };
  signConfiguration: SignConfiguration;
  imageReference: ImageReference | null;
  conceptReference: ConceptReference;
}

export type AIErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_AUTHENTICATION'
  | 'AI_RATE_LIMITED'
  | 'AI_CREDITS_EXHAUSTED'
  | 'AI_TIMEOUT'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_INVALID_RESPONSE'
  | 'AI_IMAGE_PREPARATION'
  | 'AI_NETWORK_ERROR'
  | 'AI_REQUEST_REJECTED';

export type AIConceptResult =
  | {
      status: 'GENERATED';
      providerId: string;
      imageUrl: string;
      createdAt: string;
      promptVersion: string;
      sourceImageTransfer: 'SENT_TO_SERVER';
    }
  | {
      status: 'UNAVAILABLE' | 'ERROR';
      providerId: string;
      message: string;
      createdAt: string;
      sourceImageTransfer: 'LOCAL_ONLY' | 'SENT_TO_SERVER' | 'UNKNOWN';
      errorCode?: AIErrorCode;
    };

export const DEFAULT_SIGN_CONFIGURATION: SignConfiguration = {
  businessName: '',
  category: 'retail',
  signType: 'threeD',
  style: 'modern',
  color: '#24463f',
  lighting: 'halo',
  exactText: '',
  widthCm: '',
  heightCm: '',
  notes: '',
};
