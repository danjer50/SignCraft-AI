import { DemoAIProvider } from './DemoAIProvider';
import type { AIEnvironment, ServerAIProvider } from './types';

/** Add a real provider adapter here; credentials are read only from server environment. */
export function createAIProvider(environment: AIEnvironment): ServerAIProvider {
  const configuredName = environment.AI_PROVIDER?.trim().toLowerCase();
  if (!configuredName || configuredName === 'demo') return new DemoAIProvider();
  return new DemoAIProvider(`Provider “${configuredName}” has no server adapter installed yet.`);
}
