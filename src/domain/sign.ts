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

/**
 * A single point of a customer-painted brush stroke, as a percentage (0-100) of the photo's
 * own width/height, so the mark stays correct no matter what resolution the photo is
 * displayed or sent at.
 */
export interface SignAreaPoint {
  xPercent: number;
  yPercent: number;
}

/** One continuous brush stroke (one touch/click drag) the customer painted on the photo. */
export interface SignAreaStroke {
  points: SignAreaPoint[];
}

/**
 * The customer's painted sign-location marking: any number of brush strokes, each added one
 * on top of another (never replacing the previous ones). This is only an indicator of WHERE
 * the sign belongs, not an exact crop, mask or size — the AI still chooses a natural size and
 * shape for the sign at that spot.
 */
export interface SignArea {
  strokes: SignAreaStroke[];
}

/** A simple bounding summary of a `SignArea`, which is all the AI prompt actually needs. */
export interface SignAreaBounds {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  centerXPercent: number;
  centerYPercent: number;
}

/**
 * Generous but bounded caps on brush data so a customer can mark several spots in real detail
 * while keeping the configuration payload small and predictable end to end.
 */
export const SIGN_AREA_MAX_STROKES = 15;
export const SIGN_AREA_MAX_POINTS_PER_STROKE = 80;

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
  /** Optional customer-marked placement; `null` means the AI must infer the best location. */
  signArea: SignArea | null;
  /** True when the marked area currently holds something (old sign, shutter, bars) to fully cover/replace. */
  replaceExistingSurface: boolean;
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
export function normalizeMaterials(value: unknown, legacySingle?: unknown): SignMaterial[] {
  // Drafts saved before multi-material support stored one `material` string; migrate it so a
  // returning customer does not lose the choice they already made.
  if (!Array.isArray(value)) return isSignMaterial(legacySingle) ? [legacySingle] : [];
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeSignAreaPoint(value: unknown): SignAreaPoint | null {
  if (typeof value !== 'object' || value === null) return null;
  const { xPercent, yPercent } = value as Partial<Record<keyof SignAreaPoint, unknown>>;
  if (!isFiniteNumber(xPercent) || !isFiniteNumber(yPercent)) return null;
  return { xPercent: Math.min(100, Math.max(0, xPercent)), yPercent: Math.min(100, Math.max(0, yPercent)) };
}

/**
 * Defensive recovery for a persisted/transmitted marked area: any missing, non-numeric or
 * out-of-range point is dropped individually (rather than discarding a whole legitimate stroke),
 * an empty stroke is dropped entirely, and strokes/points are capped so neither a corrupted
 * draft nor a tampered request can send an unbounded payload to the AI prompt.
 */
export function normalizeSignArea(value: unknown): SignArea | null {
  if (typeof value !== 'object' || value === null) return null;
  const rawStrokes = (value as Partial<Record<'strokes', unknown>>).strokes;
  if (!Array.isArray(rawStrokes)) return null;
  const strokes: SignAreaStroke[] = [];
  for (const rawStroke of rawStrokes) {
    if (strokes.length >= SIGN_AREA_MAX_STROKES) break;
    if (typeof rawStroke !== 'object' || rawStroke === null) continue;
    const rawPoints = (rawStroke as Partial<Record<'points', unknown>>).points;
    if (!Array.isArray(rawPoints)) continue;
    const points: SignAreaPoint[] = [];
    for (const rawPoint of rawPoints) {
      if (points.length >= SIGN_AREA_MAX_POINTS_PER_STROKE) break;
      const point = normalizeSignAreaPoint(rawPoint);
      if (point) points.push(point);
    }
    if (points.length > 0) strokes.push({ points });
  }
  return strokes.length > 0 ? { strokes } : null;
}

/**
 * Reduce a (possibly multi-stroke) painted area to the single bounding summary the AI prompt
 * needs: the overall bounding box of every painted point, plus its centre point.
 */
export function computeSignAreaBounds(area: SignArea | null): SignAreaBounds | null {
  if (!area) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of area.strokes) {
    for (const point of stroke.points) {
      minX = Math.min(minX, point.xPercent);
      minY = Math.min(minY, point.yPercent);
      maxX = Math.max(maxX, point.xPercent);
      maxY = Math.max(maxY, point.yPercent);
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return {
    xPercent: minX,
    yPercent: minY,
    widthPercent: Math.max(1, maxX - minX),
    heightPercent: Math.max(1, maxY - minY),
    centerXPercent: (minX + maxX) / 2,
    centerYPercent: (minY + maxY) / 2,
  };
}

/**
 * Defensive configuration recovery. Every field is validated against its enum/limits so a
 * corrupted or older persisted draft can never crash a page; unknown values fall back to
 * the documented defaults instead of rendering `undefined`.
 */
export function normalizeSignConfiguration(value: unknown): SignConfiguration {
  // `material` (singular) is not part of the current type: it only exists in drafts persisted
  // by older builds, hence the wider record type for the lookup below.
  const source = (typeof value === 'object' && value !== null ? value : {}) as
    Partial<Record<keyof SignConfiguration, unknown>> & { material?: unknown };
  const businessName = pickString(source.businessName, 120);
  return {
    businessName,
    category: pickEnum(source.category, BUSINESS_CATEGORIES, DEFAULT_SIGN_CONFIGURATION.category),
    signType: pickEnum(source.signType, SIGN_TYPES, DEFAULT_SIGN_CONFIGURATION.signType),
    style: pickEnum(source.style, SIGN_STYLES, DEFAULT_SIGN_CONFIGURATION.style),
    materials: normalizeMaterials(source.materials, source.material),
    color: typeof source.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(source.color)
      ? source.color
      : DEFAULT_SIGN_CONFIGURATION.color,
    lighting: pickEnum(source.lighting, LIGHTING_TYPES, DEFAULT_SIGN_CONFIGURATION.lighting),
    exactText: pickString(source.exactText, 180),
    widthCm: pickString(source.widthCm, 12),
    heightCm: pickString(source.heightCm, 12),
    notes: pickString(source.notes, 2_000),
    signArea: normalizeSignArea(source.signArea),
    replaceExistingSurface: typeof source.replaceExistingSurface === 'boolean' ? source.replaceExistingSurface : false,
  };
}

/** Sanitize a persisted concept so an incomplete draft cannot break the result view. */
function normalizeProviderHttpStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined;
}

function normalizeProviderFailureDiagnostic(value: unknown): AIProviderFailureDiagnostic | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const errorCode = typeof source.errorCode === 'string' && AI_ERROR_CODES.includes(source.errorCode as AIErrorCode)
    ? source.errorCode as AIErrorCode
    : undefined;
  if (typeof source.providerId !== 'string' || !source.providerId || !errorCode) return null;
  const providerHttpStatus = normalizeProviderHttpStatus(source.providerHttpStatus);
  const providerErrorMessage = typeof source.providerErrorMessage === 'string'
    ? source.providerErrorMessage.slice(0, 500)
    : undefined;
  return {
    providerId: source.providerId.slice(0, 80),
    errorCode,
    ...(providerHttpStatus ? { providerHttpStatus } : {}),
    ...(providerErrorMessage ? { providerErrorMessage } : {}),
  };
}

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
      ...(source.provenance && typeof source.provenance === 'object' ? { provenance: source.provenance as ConceptProvenance } : {}),
      ...(typeof source.diagnosticId === 'string' ? { diagnosticId: source.diagnosticId.slice(0, 80) } : {}),
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
  const providerHttpStatus = normalizeProviderHttpStatus(source.providerHttpStatus);
  const providerErrorMessage = typeof source.providerErrorMessage === 'string'
    ? source.providerErrorMessage.slice(0, 500)
    : undefined;
  const providerFailures = Array.isArray(source.providerFailures)
    ? source.providerFailures.slice(0, 5).map(normalizeProviderFailureDiagnostic).filter((entry): entry is AIProviderFailureDiagnostic => entry !== null)
    : [];
  return {
    status: source.status,
    providerId,
    message: typeof source.message === 'string' ? source.message.slice(0, 2_000) : '',
    createdAt,
    sourceImageTransfer: transfer,
    ...(errorCode ? { errorCode } : {}),
    ...(providerHttpStatus ? { providerHttpStatus } : {}),
    ...(providerErrorMessage ? { providerErrorMessage } : {}),
    ...(providerFailures.length > 0 ? { providerFailures } : {}),
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
  sourceIdentity?: string;
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
  'AI_UNCHANGED_IMAGE',
  'AI_IMAGE_PREPARATION',
  'AI_NETWORK_ERROR',
  'AI_REQUEST_REJECTED',
] as const;

export type AIErrorCode = (typeof AI_ERROR_CODES)[number];

export interface AIProviderFailureDiagnostic {
  providerId: string;
  errorCode: AIErrorCode;
  /** HTTP status returned by the provider, when the failure came from an HTTP response. */
  providerHttpStatus?: number;
  /** Short provider error text after server-side secret redaction. */
  providerErrorMessage?: string;
}

export interface ConceptProvenance {
  schemaVersion: 1;
  fingerprint: string;
  sourceIdentity: string;
  configuration: SignConfiguration;
}

export type AIConceptResult = (
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
      providerHttpStatus?: number;
      providerErrorMessage?: string;
      providerFailures?: AIProviderFailureDiagnostic[];
    }) & { diagnosticId?: string; provenance?: ConceptProvenance };

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
  signArea: null,
  replaceExistingSurface: false,
};
