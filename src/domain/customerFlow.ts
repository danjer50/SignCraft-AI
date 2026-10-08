import type { SignConfiguration, UploadedStorefrontPhoto } from './sign';
import { MAX_SIGN_MATERIALS } from './sign';

/**
 * The simplified customer journey:
 * Photo → Business name → Sign type → Style → Materials → Generate → Result → Quote/WhatsApp.
 *
 * Professional and admin work is intentionally NOT part of this list; those live on their own
 * routes and are reached from the footer workspace section only.
 */
export const CUSTOMER_FLOW_STEPS = ['photo', 'business', 'signType', 'style', 'materials'] as const;

export type CustomerFlowStep = (typeof CUSTOMER_FLOW_STEPS)[number];

export const CUSTOMER_FLOW_STEP_COUNT = CUSTOMER_FLOW_STEPS.length;

/** Short labels used by the progress bar. */
export const STEP_LABEL_KEYS: Record<CustomerFlowStep, string> = {
  photo: 'studio.stepPhoto',
  business: 'studio.stepBusiness',
  signType: 'studio.stepSignType',
  style: 'studio.stepStyle',
  materials: 'studio.stepMaterials',
};

/** Panel headings, one per step. */
export const STEP_TITLE_KEYS: Record<CustomerFlowStep, string> = {
  photo: 'studio.photoTitle',
  business: 'studio.businessTitle',
  signType: 'studio.designTitle',
  style: 'studio.styleTitle',
  materials: 'studio.materialsTitle',
};

/** Supporting copy under each panel heading. */
export const STEP_BODY_KEYS: Record<CustomerFlowStep, string> = {
  photo: 'studio.photoBody',
  business: 'studio.businessBody',
  signType: 'studio.signTypeBody',
  style: 'studio.styleBody',
  materials: 'studio.materialsBody',
};

export function stepKey(step: number): CustomerFlowStep {
  return CUSTOMER_FLOW_STEPS[clampStep(step) - 1];
}

/** Any unusable step value (NaN, 0, 99, -3) falls back to the first step instead of a blank panel. */
export function clampStep(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(CUSTOMER_FLOW_STEP_COUNT, Math.max(1, Math.round(value)));
}

export function parseStepParam(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clampStep(parsed) : null;
}

export interface CustomerFlowState {
  configuration: SignConfiguration;
  photo: UploadedStorefrontPhoto | null;
}

/**
 * Returns the i18n key of the message blocking this step, or `null` when the customer may
 * continue. Validation never throws, so a broken draft cannot freeze the wizard.
 */
export function stepBlockingMessageKey(step: number, state: CustomerFlowState): string | null {
  switch (stepKey(step)) {
    case 'photo':
      if (!state.photo) return 'studio.needPhoto';
      if (!state.photo.file) return 'studio.photoReupload';
      return null;
    case 'business':
      return state.configuration.businessName.trim().length >= 2 ? null : 'studio.needName';
    case 'signType':
    case 'style':
      return null;
    case 'materials':
      return state.configuration.materials.length > 0 ? null : 'studio.needMaterials';
  }
}

export function isStepComplete(step: number, state: CustomerFlowState): boolean {
  return stepBlockingMessageKey(step, state) === null;
}

/** Highest step the customer has legitimately unlocked, used to re-enable progress-bar clicks. */
export function furthestReachableStep(state: CustomerFlowState): number {
  let reachable = 1;
  for (let step = 1; step <= CUSTOMER_FLOW_STEP_COUNT; step += 1) {
    if (!isStepComplete(step, state)) break;
    reachable = Math.min(CUSTOMER_FLOW_STEP_COUNT, step + 1);
  }
  return reachable;
}

/** Generation is only offered once the photo file, business name and at least one material exist. */
export function canGenerateConcept(state: CustomerFlowState): boolean {
  return Boolean(state.photo?.file) &&
    state.configuration.businessName.trim().length >= 2 &&
    state.configuration.materials.length > 0;
}

export function generationBlockingMessageKey(state: CustomerFlowState): string | null {
  if (!state.photo) return 'studio.needPhoto';
  if (!state.photo.file) return 'studio.photoReupload';
  if (state.configuration.businessName.trim().length < 2) return 'studio.needName';
  if (state.configuration.materials.length === 0) return 'studio.needMaterials';
  return null;
}

export { MAX_SIGN_MATERIALS };

/** A restored preview unlocks non-destructive brief editing, never generation. */
export function furthestEditableStep(state: CustomerFlowState): number {
  if (!state.photo?.file && !state.photo?.previewUrl) return 1;
  if (state.configuration.businessName.trim().length < 2) return 2;
  return CUSTOMER_FLOW_STEP_COUNT;
}
