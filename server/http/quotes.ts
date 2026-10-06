import { BUSINESS_CATEGORIES, LIGHTING_TYPES, MAX_SIGN_MATERIALS, QUOTE_STATUSES, SIGN_STYLES, SIGN_TYPES, isSignMaterial, type QuoteRequest } from '../../src/domain/sign';
import { ACCEPTED_IMAGE_TYPES, MAX_STOREFRONT_IMAGE_BYTES } from '../../src/services/upload';
import { createQuoteRepository } from '../quotes/repositoryFactory';
import type { QuoteEnvironment } from '../quotes/types';
import { hasValidImageFileSignature } from './imageValidation';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A quote may combine several materials. The field is optional so drafts saved by an older
 * build remain valid; when present it must be a short list of known materials.
 */
function isValidMaterialSelection(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > MAX_SIGN_MATERIALS) return false;
  return value.every((entry) => isSignMaterial(entry));
}

function isQuoteRequest(value: unknown): value is QuoteRequest {
  if (!isRecord(value) || !isRecord(value.customer) || !isRecord(value.business) || !isRecord(value.signConfiguration) || !isRecord(value.conceptReference)) return false;
  const customer = value.customer;
  const business = value.business;
  const configuration = value.signConfiguration;
  const concept = value.conceptReference;
  if (typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 80 || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) return false;
  if (value.status !== 'NEW' || value.deliveryState !== 'LOCAL_DRAFT') return false;
  if (typeof customer.name !== 'string' || customer.name.trim().length < 2 || customer.name.length > 120) return false;
  if (typeof customer.email !== 'string' || customer.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) return false;
  if (typeof customer.phone !== 'string' || customer.phone.trim().length < 6 || customer.phone.length > 32) return false;
  if (typeof business.name !== 'string' || business.name.trim().length < 2 || business.name.length > 120) return false;
  if (!BUSINESS_CATEGORIES.includes(business.category as (typeof BUSINESS_CATEGORIES)[number])) return false;
  if (typeof configuration.businessName !== 'string' || configuration.businessName.trim().length < 2 || configuration.businessName.length > 120) return false;
  if (configuration.businessName.trim() !== business.name.trim() || configuration.category !== business.category) return false;
  if (!SIGN_TYPES.includes(configuration.signType as (typeof SIGN_TYPES)[number])) return false;
  if (!SIGN_STYLES.includes(configuration.style as (typeof SIGN_STYLES)[number])) return false;
  if (!LIGHTING_TYPES.includes(configuration.lighting as (typeof LIGHTING_TYPES)[number])) return false;
  if (!isValidMaterialSelection(configuration.materials)) return false;
  if (typeof configuration.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(configuration.color)) return false;
  if (typeof configuration.exactText !== 'string' || configuration.exactText.trim().length < 1 || configuration.exactText.length > 180) return false;
  if (typeof configuration.notes !== 'string' || configuration.notes.length > 2_000) return false;
  if (typeof configuration.widthCm !== 'string' || typeof configuration.heightCm !== 'string') return false;
  if (!/^\d{0,5}(?:\.\d{0,2})?$/.test(configuration.widthCm) || !/^\d{0,5}(?:\.\d{0,2})?$/.test(configuration.heightCm)) return false;
  if (!['NOT_GENERATED', 'UNAVAILABLE', 'GENERATED', 'ERROR'].includes(String(concept.status))) return false;
  if (typeof concept.providerId !== 'string' || concept.providerId.length > 80) return false;
  if (value.imageReference !== null) {
    if (!isRecord(value.imageReference)) return false;
    if (typeof value.imageReference.fileName !== 'string' || value.imageReference.fileName.length > 255) return false;
    if (!ACCEPTED_IMAGE_TYPES.includes(value.imageReference.mimeType as (typeof ACCEPTED_IMAGE_TYPES)[number])) return false;
    if (typeof value.imageReference.sizeBytes !== 'number' || value.imageReference.sizeBytes < 1 || value.imageReference.sizeBytes > MAX_STOREFRONT_IMAGE_BYTES) return false;
    if (value.imageReference.transferState !== 'LOCAL_ONLY') return false;
    if (value.imageReference.previewDataUrl !== undefined && (typeof value.imageReference.previewDataUrl !== 'string' || value.imageReference.previewDataUrl.length > 120_000 || !value.imageReference.previewDataUrl.startsWith('data:image/jpeg;base64,'))) return false;
  }
  if (!QUOTE_STATUSES.includes(value.status as (typeof QUOTE_STATUSES)[number])) return false;
  return true;
}

export async function handleQuoteSubmission(request: Request, environment: QuoteEnvironment = {}): Promise<Response> {
  if (request.method !== 'POST') return json({ status: 'UNAVAILABLE', message: 'Use POST to create a quote request.' }, 405);
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('multipart/form-data')) {
    return json({ status: 'UNAVAILABLE', code: 'INVALID_CONTENT_TYPE', message: 'Send quote details as multipart form data.' }, 415);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ status: 'UNAVAILABLE', code: 'INVALID_FORM', message: 'The quote request could not be read.' }, 400);
  }

  const rawRequest = form.get('quote');
  if (typeof rawRequest !== 'string' || rawRequest.length > 100_000) {
    return json({ status: 'UNAVAILABLE', code: 'INVALID_QUOTE', message: 'Quote details are missing or too large.' }, 400);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawRequest);
  } catch {
    return json({ status: 'UNAVAILABLE', code: 'INVALID_QUOTE', message: 'Quote details are not valid JSON.' }, 400);
  }
  if (!isQuoteRequest(parsed)) return json({ status: 'UNAVAILABLE', code: 'INVALID_QUOTE', message: 'Quote details are incomplete or invalid.' }, 400);

  const image = form.get('storefrontImage');
  let attachment: File | undefined;
  if (image instanceof File) {
    if (!ACCEPTED_IMAGE_TYPES.includes(image.type as (typeof ACCEPTED_IMAGE_TYPES)[number]) || image.size < 1 || image.size > MAX_STOREFRONT_IMAGE_BYTES) {
      return json({ status: 'UNAVAILABLE', code: 'INVALID_IMAGE', message: 'The attached image must be JPEG, PNG or WebP and no larger than 10 MB.' }, 413);
    }
    if (!await hasValidImageFileSignature(image)) {
      return json({ status: 'UNAVAILABLE', code: 'INVALID_IMAGE_CONTENT', message: 'The attached file does not match its declared image format.' }, 415);
    }
    attachment = image;
  }

  const repository = createQuoteRepository(environment);
  if (!repository) {
    return json({ status: 'UNAVAILABLE', code: 'QUOTE_DELIVERY_NOT_CONFIGURED', message: 'No secure quote-delivery storage is configured. This request was not sent.' }, 503);
  }
  const result = await repository.create(parsed, attachment);
  return json({ status: 'CONFIRMED', id: result.id }, 201);
}
