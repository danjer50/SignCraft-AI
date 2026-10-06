import { CloudflareFluxProvider } from './providers/cloudflareFlux';
import { DemoAIProvider } from './DemoAIProvider';
import type { AIEnvironment, ServerAIProvider } from './types';

/** Keep provider selection on the server so future models can be swapped without changing the UI. */
export function createAIProvider(environment: AIEnvironment): ServerAIProvider {
  const configuredName = environment.AI_PROVIDER?.trim().toLowerCase();
  if (!configuredName || configuredName === 'demo') return new DemoAIProvider();
  if (configuredName === 'cloudflare-flux') return new CloudflareFluxProvider(environment);
  return new DemoAIProvider(`Provider “${configuredName}” has no server adapter installed yet.`);
}
