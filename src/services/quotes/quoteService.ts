import type { QuoteRequest, QuoteStatus } from '../../domain/sign';
import { clientConfig, type QuoteMode } from '../config';

const STORAGE_KEY = 'signcraft:quote-requests:v1';

function safeRead(): QuoteRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is QuoteRequest =>
      typeof item === 'object' && item !== null &&
      typeof (item as QuoteRequest).id === 'string' &&
      typeof (item as QuoteRequest).createdAt === 'string' &&
      typeof (item as QuoteRequest).status === 'string' &&
      typeof (item as QuoteRequest).customer?.email === 'string',
    );
  } catch {
    return [];
  }
}

function persist(requests: QuoteRequest[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
  } catch {
    // The UI reports local-only status; storage quotas should not imply delivery.
  }
}

export function getLocalQuoteRequests(): QuoteRequest[] {
  return safeRead().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveLocalQuoteRequest(request: QuoteRequest): boolean {
  const requests = safeRead();
  persist([request, ...requests.filter((existing) => existing.id !== request.id)]);
  return safeRead().some((item) => item.id === request.id);
}

export function updateLocalQuoteStatus(id: string, status: QuoteStatus): boolean {
  const requests = safeRead();
  const found = requests.some((request) => request.id === id);
  if (!found) return false;
  persist(requests.map((request) => request.id === id ? { ...request, status } : request));
  return true;
}

export type QuoteDeliveryResult =
  | { state: 'CONFIRMED'; requestId: string }
  | { state: 'LOCAL_DRAFT'; requestId: string; reason: 'LOCAL_DEMO' | 'DELIVERY_UNAVAILABLE' | 'LOCAL_STORAGE_UNAVAILABLE' };

export async function submitQuoteRequest(
  request: QuoteRequest,
  imageFile?: File | null,
  mode: QuoteMode = clientConfig.quoteMode,
): Promise<QuoteDeliveryResult> {
  if (mode === 'api') {
    try {
      const payload = new FormData();
      const serverRequest = {
        ...request,
        imageReference: request.imageReference
          ? { ...request.imageReference, previewDataUrl: undefined }
          : null,
      };
      payload.append('quote', JSON.stringify(serverRequest));
      if (imageFile) payload.append('storefrontImage', imageFile, imageFile.name);
      const response = await fetch('/api/quotes', { method: 'POST', body: payload });
      const result = await response.json().catch(() => ({})) as { status?: string; id?: string };
      if (response.ok && response.status === 201 && result.status === 'CONFIRMED' && result.id) {
        return { state: 'CONFIRMED', requestId: result.id };
      }
      const saved = saveLocalQuoteRequest({ ...request, deliveryState: 'LOCAL_DRAFT' });
      return {
        state: 'LOCAL_DRAFT',
        requestId: request.id,
        reason: saved ? 'DELIVERY_UNAVAILABLE' : 'LOCAL_STORAGE_UNAVAILABLE',
      };
    } catch {
      const saved = saveLocalQuoteRequest({ ...request, deliveryState: 'LOCAL_DRAFT' });
      return {
        state: 'LOCAL_DRAFT',
        requestId: request.id,
        reason: saved ? 'DELIVERY_UNAVAILABLE' : 'LOCAL_STORAGE_UNAVAILABLE',
      };
    }
  }

  const saved = saveLocalQuoteRequest({ ...request, deliveryState: 'LOCAL_DRAFT' });
  return {
    state: 'LOCAL_DRAFT',
    requestId: request.id,
    reason: saved ? 'LOCAL_DEMO' : 'LOCAL_STORAGE_UNAVAILABLE',
  };
}

export function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `sc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
