import type { IncomingMessage, ServerResponse } from 'node:http';
import { createAIRequestDiagnosticContext, logAIDiagnostic } from '../../server/ai/diagnostics.js';
import { readAiEnvironment } from '../../server/ai/environment.js';
import { handleAiGeneration } from '../../server/http/ai.js';
import { bridgeVercelRequest } from '../../server/http/vercelAdapter.js';

export const config = { api: { bodyParser: false } };

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const environment = readAiEnvironment();
  const diagnostics = createAIRequestDiagnosticContext();
  await bridgeVercelRequest(
    request,
    response,
    (webRequest) => handleAiGeneration(webRequest, environment, diagnostics),
    {
      aiDiagnosticId: diagnostics.requestId,
      onAIDiagnosticFailure: ({ status, internalErrorCode }) => {
        const failedAttempts = diagnostics.providerAttempts.filter((attempt) => Boolean(attempt.errorCode));
        const selectedAttempt = [...failedAttempts].reverse()[0];
        const providerRequestAttempted = diagnostics.providerAttempts.some((attempt) => attempt.requestAttempted);
        const providerResponseReceived = diagnostics.providerAttempts.some((attempt) => attempt.responseReceived);
        logAIDiagnostic({
          stage: 'request-summary',
          requestId: diagnostics.requestId,
          appHttpStatus: status,
          internalErrorCode,
          provider: selectedAttempt?.providerId ?? 'none',
          model: selectedAttempt?.model,
          providerAdapterInvoked: diagnostics.providerAdapterInvoked,
          providerRequestAttempted,
          providerResponseReceived,
          providerReached: providerResponseReceived ? true : providerRequestAttempted ? null : false,
          providerHttpStatus: selectedAttempt?.providerHttpStatus,
          providerErrorCode: selectedAttempt?.providerErrorCode,
          providerErrorMessage: selectedAttempt?.providerErrorMessage,
          errorMessage: internalErrorCode === 'AI_BRIDGE_BODY_TOO_LARGE'
            ? 'The Vercel request body limit was exceeded before AI validation.'
            : 'The Vercel bridge failed before returning the AI handler response.',
          providerFailures: failedAttempts,
          failedBeforeProviderInvocation: !diagnostics.providerAdapterInvoked,
          imageValidation: diagnostics.imageValidation,
          configurationValidation: diagnostics.configurationValidation,
          sensitiveValues: diagnostics.sensitiveValues,
          validatedImageDataReturned: false,
        }, environment);
      },
    },
  );
}
