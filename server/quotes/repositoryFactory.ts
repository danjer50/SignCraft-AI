import type { QuoteEnvironment, QuoteRepository } from './types.js';

/** No persistence is enabled by default. Add a repository adapter before confirming delivery. */
export function createQuoteRepository(_environment: QuoteEnvironment): QuoteRepository | null {
  return null;
}
