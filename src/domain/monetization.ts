export type ProductEntitlement =
  | 'FREE_CONCEPT'
  | 'PREMIUM_CONCEPT'
  | 'ADDITIONAL_REVISION'
  | 'PROFESSIONAL_PACKAGE'
  | 'RUSH_SERVICE'
  | 'SUBSCRIPTION'
  | 'WHITE_LABEL';

export interface CustomerEntitlements {
  plan: 'FREE' | 'PRO' | 'STUDIO' | 'WHITE_LABEL';
  freeConceptsRemaining: number;
  premiumConcepts: number;
  additionalRevisions: number;
  rushServiceAvailable: boolean;
  whiteLabelEnabled: boolean;
}

/** Payment is intentionally not implemented; a provider can be injected later. */
export interface BillingProvider {
  createCheckout(entitlement: ProductEntitlement, customerId: string): Promise<
    | { status: 'READY'; checkoutUrl: string }
    | { status: 'UNAVAILABLE'; reason: string }
  >;
}
