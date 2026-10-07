import { BUSINESS_CATEGORIES, LIGHTING_TYPES, MAX_SIGN_MATERIALS, SIGN_STYLES, SIGN_TYPES, isSignMaterial, normalizeSignArea, type SignConfiguration, type SignMaterial } from '../../src/domain/sign.js';
import { MAX_STOREFRONT_IMAGE_BYTES, ACCEPTED_IMAGE_TYPES } from '../../src/services/upload.js';
import { MAX_AI_IMAGE_SIDE } from '../../src/services/ai/contracts.js';
import { buildStorefrontEditPrompt, SIGNCRAFT_PROMPT_VERSION } from '../../src/services/ai/promptBuilder.js';
import { runImageEditTask } from '../ai/router.js';
import type { AIEnvironment, ServerAIResult, ServerImageEditInput } from '../ai/types.js';
import { hasValidImageSignature } from './imageValidation.js';
import { readImageDimensions } from './imageDimensions.js';

const MAX_AI_REQUEST_BODY_BYTES = 12 * 1024 * 1024;

/**
 * Upper bound on the serialized `SignConfiguration` JSON. Multi-stroke brush marking (capped at
 * `SIGN_AREA_MAX_STROKES` strokes of `SIGN_AREA_MAX_POINTS_PER_STROKE` points each) needs more
 * room than the old single-rectangle marker; this still rejects obviously malformed/oversized
 * payloads well below the overall request body limit above.
 */
const MAX_CONFIGURATION_JSON_LENGTH = 50_000;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function providerFailureStatus(result: Exclude<ServerAIResult, { status: 'GENERATED' }>): number {
  switch (result.errorCode) {
    case 'AI_RATE_LIMITED': return 429;
    case 'AI_TIMEOUT': return 504;
    case 'AI_REQUEST_REJECTED': return 422;
    case 'AI_AUTHENTICATION':
    case 'AI_INVALID_RESPONSE': return 502;
    case 'AI_NOT_CONFIGURED':
    case 'AI_CREDITS_EXHAUSTED':
    case 'AI_PROVIDER_UNAVAILABLE':
    case 'AI_IMAGE_PREPARATION':
    case 'AI_NETWORK_ERROR': return 503;
  }
}

function isValidOptionalDimension(value: string, maximum: number): boolean {
  if (value === '') return true;
  if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(value)) return false;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 1 && numericValue <= maximum;
}

/**
 * One sign may combine several materials. An absent field (older client build) means
 * "no material requested yet"; anything else must be a short list of known materials.
 */
function parseMaterials(value: unknown): SignMaterial[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_SIGN_MATERIALS) return null;
  const materials: SignMaterial[] = [];
  for (const entry of value) {
    if (!isSignMaterial(entry)) return null;
    if (!materials.includes(entry)) materials.push(entry);
  }
  return materials;
}

function parseConfiguration(value: FormDataEntryValue | null): SignConfiguration | null {
  if (typeof value !== 'string' || value.length > MAX_CONFIGURATION_JSON_LENGTH) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) return null;
    const strings = ['businessName', 'color', 'exactText', 'widthCm', 'heightCm', 'notes'] as const;
    if (strings.some((key) => typeof parsed[key] !== 'string')) return null;
    const requestedBusinessName = parsed.businessName as string;
    const businessName = requestedBusinessName.trim();
    const requestedExactText = parsed.exactText as string;
    const exactText = requestedExactText.trim() ? requestedExactText : businessName;
    if (businessName.length < 2 || requestedBusinessName.length > 120 || requestedExactText.length > 180 || (parsed.notes as string).length > 2_000) return null;
    if (!isValidOptionalDimension(parsed.widthCm as string, 5_000) || !isValidOptionalDimension(parsed.heightCm as string, 2_000)) return null;
    if (!BUSINESS_CATEGORIES.includes(parsed.category as (typeof BUSINESS_CATEGORIES)[number])) return null;
    if (!SIGN_TYPES.includes(parsed.signType as (typeof SIGN_TYPES)[number])) return null;
    if (!SIGN_STYLES.includes(parsed.style as (typeof SIGN_STYLES)[number])) return null;
    if (!LIGHTING_TYPES.includes(parsed.lighting as (typeof LIGHTING_TYPES)[number])) return null;
    if (!/^#[0-9a-fA-F]{6}$/.test(parsed.color as string)) return null;
    const materials = parseMaterials(parsed.materials);
    if (!materials) return null;
    return {
      businessName,
      category: parsed.category as SignConfiguration['category'],
      signType: parsed.signType as SignConfiguration['signType'],
      style: parsed.style as SignConfiguration['style'],
      materials,
      color: parsed.color as string,
      lighting: parsed.lighting as SignConfiguration['lighting'],
      exactText,
      widthCm: parsed.widthCm as string,
      heightCm: parsed.heightCm as string,
      notes: parsed.notes as string,
      // Optional customer-marked placement: a missing or malformed value never rejects the
      // whole request, it simply falls back to letting the AI infer the best location.
      signArea: normalizeSignArea(parsed.signArea),
      replaceExistingSurface: parsed.replaceExistingSurface === true,
    };
  } catch {
    return null;
  }
}

export async function handleAiGeneration(request: Request, environment: AIEnvironment = {}): Promise<Response> {
  if (request.method !== 'POST') return json({ status: 'UNAVAILABLE', message: 'Use POST for image-edit requests.' }, 405);
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AI_REQUEST_BODY_BYTES) {
    return json({ status: 'ERROR', code: 'IMAGE_SIZE', message: 'The image-edit request is too large.' }, 413);
  }
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return json({ status: 'UNAVAILABLE', code: 'INVALID_CONTENT_TYPE', message: 'Send the storefront image as multipart form data.' }, 415);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ status: 'UNAVAILABLE', code: 'INVALID_FORM', message: 'The image-edit request could not be read.' }, 400);
  }

  const image = form.get('storefrontImage');
  if (!(image instanceof File)) return json({ status: 'UNAVAILABLE', code: 'IMAGE_REQUIRED', message: 'A storefront image is required.' }, 400);
  if (!ACCEPTED_IMAGE_TYPES.includes(image.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    return json({ status: 'UNAVAILABLE', code: 'UNSUPPORTED_IMAGE', message: 'Use a JPEG, PNG or WebP storefront photo.' }, 415);
  }
  if (image.size < 1 || image.size > MAX_STOREFRONT_IMAGE_BYTES) {
    return json({ status: 'UNAVAILABLE', code: 'IMAGE_SIZE', message: 'The image must be between 1 byte and 10 MB.' }, 413);
  }

  const configuration = parseConfiguration(form.get('configuration'));
  if (!configuration) return json({ status: 'UNAVAILABLE', code: 'INVALID_CONFIGURATION', message: 'The sign configuration is invalid.' }, 400);

  const imageBytes = new Uint8Array(await image.arrayBuffer());
  if (!hasValidImageSignature(image.type, imageBytes.subarray(0, 12))) {
    return json({ status: 'ERROR', code: 'INVALID_IMAGE_CONTENT', message: 'The file content does not match its declared image format.' }, 415);
  }
  const dimensions = readImageDimensions(image.type, imageBytes);
  if (!dimensions) return json({ status: 'ERROR', code: 'INVALID_IMAGE_DIMENSIONS', message: 'The image dimensions could not be validated.' }, 415);
  if (dimensions.width > MAX_AI_IMAGE_SIDE || dimensions.height > MAX_AI_IMAGE_SIDE) {
    return json({ status: 'ERROR', code: 'IMAGE_DIMENSIONS', message: 'Resize the image to 511 by 511 pixels or smaller before submitting.' }, 413);
  }

  const input: ServerImageEditInput = {
    image: { bytes: imageBytes, fileName: 'storefront.jpg', mimeType: image.type, ...dimensions },
    configuration,
    prompt: buildStorefrontEditPrompt(configuration),
    preserveSourceArchitecture: true,
    exactTextOverlayRequired: true,
  };

  const mask = form.get('mask');
  if (mask instanceof File) {
    if (mask.type !== 'image/png' || mask.size < 1 || mask.size > MAX_STOREFRONT_IMAGE_BYTES) {
      return json({ status: 'UNAVAILABLE', code: 'INVALID_MASK', message: 'An inpainting mask must be a PNG no larger than 10 MB.' }, 415);
    }
    const maskBytes = new Uint8Array(await mask.arrayBuffer());
    if (!hasValidImageSignature(mask.type, maskBytes.subarray(0, 12))) {
      return json({ status: 'UNAVAILABLE', code: 'INVALID_MASK', message: 'The inpainting mask is not a valid PNG.' }, 415);
    }
    input.mask = maskBytes;
  }

  let result: ServerAIResult;
  try {
    result = await runImageEditTask(input, environment);
  } catch {
    return json({
      status: 'ERROR',
      providerId: 'server-ai',
      code: 'AI_PROVIDER_UNAVAILABLE',
      message: 'The secure image service could not complete the request. Please retry.',
    }, 503);
  }
  if (result.status !== 'GENERATED') {
    const { errorCode, ...publicResult } = result;
    return json({ ...publicResult, code: errorCode }, providerFailureStatus(result));
  }
  return json({ ...result, promptVersion: SIGNCRAFT_PROMPT_VERSION }, 200);
}
