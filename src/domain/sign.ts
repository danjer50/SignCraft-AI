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

/**
 * Fabrication materials a customer can combine on one sign. `unsure` is an explicit
 * choice so a customer is never blocked by a question they cannot answer yet.
 */
export const SIGN_MATERIALS = [
  'acrylic',
  'aluminiumComposite',
  'aluminium',
  'pvc',
  'polycarbonate',
  'stainlessSteel',
  'galvanizedSteel',
  'wood',
  'vinyl',
  'ledModules',
  'neonFlex',
  'unsure',
] as const;

export type SignMaterial = (typeof SIGN_MATERIALS)[number];

/** Upper bound for one sign; it keeps prompts, quotes and storage predictable. */
export const MAX_SIGN_MATERIALS = 6;

export interface SignConfiguration {
  businessName: string;
  category: BusinessCategory;
  signType: SignType;
  style: SignStyle;
  /** One sign may combine several materials, in the customer's priority order. */
  materials: SignMaterial[];
  color: string;
  lighting: LightingType;
  exactText: string;
  widthCm: string;
  heightCm: string;
  notes: string;
}

/** Configuration keys whose value is a single string; `materials` is handled separately. */
export type StringConfigurationKey = {
  [K in keyof SignConfiguration]: SignConfiguration[K] extends string ? K : never;
}[keyof SignConfiguration];

export function isSignMaterial(value: unknown): value is SignMaterial {
  return typeof value === 'string' && (SIGN_MATERIALS as readonly string[]).includes(value);
}

/**
 * Coerce an unknown value (local draft, API payload, old project) into a safe material
 * list: valid values only, de-duplicated, original order preserved, capped.
 */
export function normalizeMaterials(value: unknown): SignMaterial[] {
  if (!Array.isArray(value)) return [];
  const selected: SignMaterial[] = [];
  for (const entry of value) {
    if (!isSignMaterial(entry) || selected.includes(entry)) continue;
    selected.push(entry);
    if (selected.length >= MAX_SIGN_MATERIALS) break;
  }
  return selected;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function pickString(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.slice(0, maximum) : '';
}

/**
 * Defensive configuration recovery. Every field is validated against its enum/limits so a
 * corrupted or older persisted draft can never crash a page; unknown values fall back to
 * the documented defaults instead of rendering `undefined`.
 */
export function normalizeSignConfiguration(value: unknown): SignConfiguration {
  const source = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<keyof SignConfiguration, unknown>>;
  const businessName = pickString(source.businessName, 120);
  return {
    businessName,
    category: pickEnum(source.category, BUSINESS_CATEGORIES, DEFAULT_SIGN_CONFIGURATION.category),
    signType: pickEnum(source.signType, SIGN_TYPES, DEFAULT_SIGN_CONFIGURATION.signType),
    style: pickEnum(source.style, SIGN_STYLES, DEFAULT_SIGN_CONFIGURATION.style),
    materials: normalizeMaterials(source.materials),
    color: typeof source.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(source.color)
      ? source.color
      : DEFAULT_SIGN_CONFIGURATION.color,
    lighting: pickEnum(source.lighting, LIGHTING_TYPES, DEFAULT_SIGN_CONFIGURATION.lighting),
    exactText: pickString(source.exactText, 180),
    widthCm: pickString(source.widthCm, 12),
    heightCm: pickString(source.heightCm, 12),
    notes: pickString(source.notes, 2_000),
  };
}

/** Sanitize a persisted concept so an incomplete draft cannot break the result view. */
export function normalizeConceptResult(value: unknown): AIConceptResult | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Partial<AIConceptResult> & Record<string, unknown>;
  const providerId = typeof source.providerId === 'string' && source.providerId ? source.providerId.slice(0, 80) : 'unknown-provider';
  const createdAt = typeof source.createdAt === 'string' && !Number.isNaN(Date.parse(source.createdAt))
    ? source.createdAt
    : new Date(0).toISOString();
  const transfer = source.sourceImageTransfer === 'SENT_TO_SERVER' || source.sourceImageTransfer === 'UNKNOWN'
    ? source.sourceImageTransfer
    : 'LOCAL_ONLY';
  if (source.status === 'GENERATED') {
    if (typeof source.imageUrl !== 'string' || !source.imageUrl.startsWith('data:image/')) return null;
    return {
      status: 'GENERATED',
      providerId,
      imageUrl: source.imageUrl,
      createdAt,
      promptVersion: typeof source.promptVersion === 'string' ? source.promptVersion : 'unknown',
      sourceImageTransfer: 'SENT_TO_SERVER',
    };
  }
  if (source.status !== 'UNAVAILABLE' && source.status !== 'ERROR') return null;
  const errorCode = typeof source.errorCode === 'string' && AI_ERROR_CODES.includes(source.errorCode as AIErrorCode)
    ? (source.errorCode as AIErrorCode)
    : undefined;
  return {
    status: source.status,
    providerId,
    message: typeof source.message === 'string' ? source.message.slice(0, 2_000) : '',
    createdAt,
    sourceImageTransfer: transfer,
    ...(errorCode ? { errorCode } : {}),
  };
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

export const AI_ERROR_CODES = [
  'AI_NOT_CONFIGURED',
  'AI_AUTHENTICATION',
  'AI_RATE_LIMITED',
  'AI_CREDITS_EXHAUSTED',
  'AI_TIMEOUT',
  'AI_PROVIDER_UNAVAILABLE',
  'AI_INVALID_RESPONSE',
  'AI_IMAGE_PREPARATION',
  'AI_NETWORK_ERROR',
  'AI_REQUEST_REJECTED',
] as const;

export type AIErrorCode = (typeof AI_ERROR_CODES)[number];

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
  materials: [],
  color: '#24463f',
  lighting: 'halo',
  exactText: '',
  widthCm: '',
  heightCm: '',
  notes: '',
};
