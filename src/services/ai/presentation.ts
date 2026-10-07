import type { AIConceptResult, AIErrorCode } from '../../domain/sign';

const errorMessageKeys: Record<AIErrorCode, string> = {
  AI_NOT_CONFIGURED: 'ai.errorNotConfigured',
  AI_AUTHENTICATION: 'ai.errorAuthentication',
  AI_RATE_LIMITED: 'ai.errorRateLimited',
  AI_CREDITS_EXHAUSTED: 'ai.errorCredits',
  AI_TIMEOUT: 'ai.errorTimeout',
  AI_PROVIDER_UNAVAILABLE: 'ai.errorUnavailable',
  AI_INVALID_RESPONSE: 'ai.errorInvalidResponse',
  AI_UNCHANGED_IMAGE: 'ai.errorUnchangedImage',
  AI_IMAGE_PREPARATION: 'ai.errorImagePreparation',
  AI_NETWORK_ERROR: 'ai.errorNetwork',
  AI_REQUEST_REJECTED: 'ai.errorRequestRejected',
};

export function aiErrorMessageKey(errorCode?: AIErrorCode): string {
  return errorCode ? errorMessageKeys[errorCode] : 'ai.errorUnavailable';
}

export function photoPrivacyMessageKey(
  concept: AIConceptResult | null,
  aiMode: 'demo' | 'api',
  quoteMode: 'local' | 'api',
): string {
  if (concept?.status === 'GENERATED') return 'studio.photoProcessedNotice';
  if (concept?.errorCode === 'AI_NOT_CONFIGURED' && concept.sourceImageTransfer === 'SENT_TO_SERVER') {
    return 'studio.photoNotForwardedNotice';
  }
  if (concept?.errorCode === 'AI_IMAGE_PREPARATION' || concept?.errorCode === 'AI_NETWORK_ERROR') {
    return concept.sourceImageTransfer === 'LOCAL_ONLY'
      ? 'studio.photoPreparationLocalNotice'
      : 'studio.photoUnknownNotice';
  }
  if (concept?.sourceImageTransfer === 'SENT_TO_SERVER') return 'studio.photoSentNotice';
  if (concept?.sourceImageTransfer === 'UNKNOWN') return 'studio.photoUnknownNotice';
  if (aiMode === 'api' && quoteMode === 'api') return 'studio.photoBothApiNotice';
  if (aiMode === 'api') return 'studio.photoAiApiNotice';
  if (quoteMode === 'api') return 'studio.photoQuoteApiNotice';
  return 'studio.photoLocalNotice';
}
