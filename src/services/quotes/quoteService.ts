import type { QuoteRequest, QuoteStatus } from '../../domain/sign';
import { QUOTE_STATUSES, normalizeSignConfiguration } from '../../domain/sign';
import { canonicalJson } from '../../domain/provenance';
import { clientConfig, type QuoteMode } from '../config';

const STORAGE_KEY = 'signcraft:quote-requests:v1';
const MAX_QUOTE_JSON_CHARS = 4 * 1024 * 1024;
export const QUOTE_TIMEOUT_MS = 20_000;
const text = (v: unknown, max = 254) => typeof v === 'string' ? v.slice(0, max) : '';

function normalizeLocalQuote(value: unknown): QuoteRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Partial<QuoteRequest>;
  if (!source.id || typeof source.id !== 'string' || !source.customer || typeof source.customer.email !== 'string') return null;
  const configuration = normalizeSignConfiguration(source.signConfiguration);
  const image = source.imageReference;
  const concept = source.conceptReference;
  return {
    id: source.id.slice(0, 100),
    createdAt: typeof source.createdAt === 'string' && Number.isFinite(Date.parse(source.createdAt)) ? source.createdAt : new Date(0).toISOString(),
    status: QUOTE_STATUSES.includes(source.status as QuoteStatus) ? source.status as QuoteStatus : 'NEW',
    deliveryState: source.deliveryState === 'CONFIRMED' ? 'CONFIRMED' : 'LOCAL_DRAFT',
    customer: { name: text(source.customer.name, 120), email: text(source.customer.email), phone: text(source.customer.phone, 80) },
    business: { name: text(source.business?.name, 120) || configuration.businessName, category: configuration.category },
    signConfiguration: configuration,
    imageReference: image && typeof image.fileName === 'string' ? {
      fileName: image.fileName.slice(0, 240), mimeType: text(image.mimeType, 100), sizeBytes: Number.isFinite(image.sizeBytes) ? image.sizeBytes : 0,
      transferState: image.transferState === 'UPLOADED' ? 'UPLOADED' : 'LOCAL_ONLY',
      ...(typeof image.previewDataUrl === 'string' && image.previewDataUrl.length <= 400_000 && /^data:image\/(jpeg|png|webp);base64,/.test(image.previewDataUrl) ? { previewDataUrl: image.previewDataUrl } : {}),
    } : null,
    conceptReference: concept && ['NOT_GENERATED', 'GENERATED', 'UNAVAILABLE', 'ERROR'].includes(concept.status) ? {
      status: concept.status, providerId: text(concept.providerId, 80), message: text(concept.message, 500), createdAt: text(concept.createdAt, 60),
    } : { status: 'NOT_GENERATED', providerId: 'none' },
  };
}
function safeRead(): QuoteRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeLocalQuote).filter((v): v is QuoteRequest => v !== null) : [];
  } catch { return []; }
}
function persist(requests: QuoteRequest[]): boolean {
  try {
    const value = JSON.stringify(requests);
    if (value.length > MAX_QUOTE_JSON_CHARS) return false;
    localStorage.setItem(STORAGE_KEY, value);
    return true;
  } catch { return false; }
}
export function getLocalQuoteRequests(): QuoteRequest[] { return safeRead().sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export function saveLocalQuoteRequest(request: QuoteRequest): boolean {
  const normalized = normalizeLocalQuote(request);
  if (!normalized) return false;
  if (!persist([normalized, ...safeRead().filter((existing) => existing.id !== request.id)])) return false;
  return canonicalJson(safeRead().find((v) => v.id === request.id)) === canonicalJson(normalized);
}
export function updateLocalQuoteStatus(id: string, status: QuoteStatus): boolean {
  if (!QUOTE_STATUSES.includes(status)) return false;
  const requests = safeRead();
  if (!requests.some((request) => request.id === id)) return false;
  return persist(requests.map((request) => request.id === id ? { ...request, status } : request));
}
export type QuoteDeliveryResult =
  | { state: 'CONFIRMED'; requestId: string }
  | { state: 'LOCAL_DRAFT'; requestId: string; reason: 'LOCAL_DEMO' | 'DELIVERY_UNAVAILABLE' | 'LOCAL_STORAGE_UNAVAILABLE' };
export async function submitQuoteRequest(request: QuoteRequest, imageFile?: File | null, mode: QuoteMode = clientConfig.quoteMode): Promise<QuoteDeliveryResult> {
  if (mode === 'api') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUOTE_TIMEOUT_MS);
    try {
      const payload = new FormData();
      payload.append('quote', JSON.stringify({ ...request, imageReference: request.imageReference ? { ...request.imageReference, previewDataUrl: undefined } : null }));
      if (imageFile) payload.append('storefrontImage', imageFile, imageFile.name);
      const response = await fetch('/api/quotes', { method: 'POST', body: payload, signal: controller.signal });
      const result = await response.json() as { status?: string; id?: string } | null;
      if (response.status === 201 && result?.status === 'CONFIRMED' && typeof result.id === 'string') return { state: 'CONFIRMED', requestId: result.id };
    } catch { /* Unconfirmed delivery preserves a checked local copy, never claims sent. */ }
    finally { clearTimeout(timer); }
    const saved = saveLocalQuoteRequest({ ...request, deliveryState: 'LOCAL_DRAFT' });
    return { state: 'LOCAL_DRAFT', requestId: request.id, reason: saved ? 'DELIVERY_UNAVAILABLE' : 'LOCAL_STORAGE_UNAVAILABLE' };
  }
  const saved = saveLocalQuoteRequest({ ...request, deliveryState: 'LOCAL_DRAFT' });
  return { state: 'LOCAL_DRAFT', requestId: request.id, reason: saved ? 'LOCAL_DEMO' : 'LOCAL_STORAGE_UNAVAILABLE' };
}
export function createRequestId(): string { return globalThis.crypto?.randomUUID?.() ?? `sc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
