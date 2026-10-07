import type { AIConceptResult, SignConfiguration } from '../domain/sign';

/**
 * All browser persistence for the customer draft lives here so a storage failure (private
 * mode, quota, disabled storage) can never throw into the UI and produce a blank screen.
 */
export const STUDIO_DRAFT_KEY = 'signcraft:studio-draft:v1';

export interface PersistedDraftPhoto {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  transferState: 'LOCAL_ONLY';
  previewDataUrl?: string;
}

export interface StudioDraft {
  id: string;
  configuration: SignConfiguration;
  lastConcept: AIConceptResult | null;
  step: number;
  photo: PersistedDraftPhoto | null;
}

/** Returns the parsed draft, or `null` when nothing usable is stored. Never throws. */
export function readStudioDraft(): unknown | null {
  try {
    const raw = localStorage.getItem(STUDIO_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Best-effort persistence; returns false when the browser refused the write. */
export function writeStudioDraft(draft: StudioDraft): boolean {
  try {
    localStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearStudioDraft(): void {
  try {
    localStorage.removeItem(STUDIO_DRAFT_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

export function isStorageAvailable(): boolean {
  try {
    const probe = 'signcraft:storage-probe';
    localStorage.setItem(probe, probe);
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
