import { BUSINESS_CATEGORIES, LIGHTING_TYPES, SIGN_STYLES, SIGN_TYPES, type SignConfiguration } from '../../src/domain/sign';
import { MAX_STOREFRONT_IMAGE_BYTES, ACCEPTED_IMAGE_TYPES } from '../../src/services/upload';
import { buildStorefrontEditPrompt } from '../../src/services/ai/promptBuilder';
import { createAIProvider } from '../ai/providerFactory';
import type { AIEnvironment, ServerImageEditInput } from '../ai/types';
import { hasValidImageSignature } from './imageValidation';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseConfiguration(value: FormDataEntryValue | null): SignConfiguration | null {
  if (typeof value !== 'string' || value.length > 12_000) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) return null;
    const strings = ['businessName', 'color', 'exactText', 'widthCm', 'heightCm', 'notes'] as const;
    if (strings.some((key) => typeof parsed[key] !== 'string')) return null;
    if ((parsed.businessName as string).trim().length < 2 || (parsed.businessName as string).length > 120 || (parsed.exactText as string).trim().length < 1 || (parsed.exactText as string).length > 180 || (parsed.notes as string).length > 2_000) return null;
    if (!/^\d{0,5}(?:\.\d{0,2})?$/.test(parsed.widthCm as string) || !/^\d{0,5}(?:\.\d{0,2})?$/.test(parsed.heightCm as string)) return null;
    if (!BUSINESS_CATEGORIES.includes(parsed.category as (typeof BUSINESS_CATEGORIES)[number])) return null;
    if (!SIGN_TYPES.includes(parsed.signType as (typeof SIGN_TYPES)[number])) return null;
    if (!SIGN_STYLES.includes(parsed.style as (typeof SIGN_STYLES)[number])) return null;
    if (!LIGHTING_TYPES.includes(parsed.lighting as (typeof LIGHTING_TYPES)[number])) return null;
    if (!/^#[0-9a-fA-F]{6}$/.test(parsed.color as string)) return null;
    return {
      businessName: parsed.businessName as string,
      category: parsed.category as SignConfiguration['category'],
      signType: parsed.signType as SignConfiguration['signType'],
      style: parsed.style as SignConfiguration['style'],
      color: parsed.color as string,
      lighting: parsed.lighting as SignConfiguration['lighting'],
      exactText: parsed.exactText as string,
      widthCm: parsed.widthCm as string,
      heightCm: parsed.heightCm as string,
      notes: parsed.notes as string,
    };
  } catch {
    return null;
  }
}

export async function handleAiGeneration(request: Request, environment: AIEnvironment = {}): Promise<Response> {
  if (request.method !== 'POST') return json({ status: 'UNAVAILABLE', message: 'Use POST for image-edit requests.' }, 405);
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
    return json({ status: 'UNAVAILABLE', code: 'INVALID_IMAGE_CONTENT', message: 'The file content does not match its declared image format.' }, 415);
  }

  const input: ServerImageEditInput = {
    image: { bytes: imageBytes, fileName: image.name, mimeType: image.type },
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

  const result = await createAIProvider(environment).generate(input);
  if (result.status === 'UNAVAILABLE') {
    return json({ ...result, code: 'AI_NOT_CONFIGURED' }, 503);
  }
  return json({ ...result, promptVersion: 'storefront-inpaint-v1' }, 200);
}
