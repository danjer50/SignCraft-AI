import type { QuoteRequest } from '../../src/domain/sign';

export interface QuoteEnvironment {
  QUOTE_STORAGE_PROVIDER?: string;
  QUOTE_STORAGE_URL?: string;
  QUOTE_STORAGE_KEY?: string;
}

export interface QuoteRepository {
  create(request: QuoteRequest, image?: File): Promise<{ id: string; confirmed: true }>;
}
