import type { BillingProvider, ProductEntitlement } from '../../domain/monetization';

/** Billing remains a no-op until pricing, taxes and a payment provider are chosen. */
export class UnconfiguredBillingProvider implements BillingProvider {
  async createCheckout(_entitlement: ProductEntitlement, _customerId: string) {
    return { status: 'UNAVAILABLE' as const, reason: 'Payment processing is not enabled.' };
  }
}
