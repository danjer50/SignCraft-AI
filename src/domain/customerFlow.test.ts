import { describe, expect, it } from 'vitest';
import type { SignConfiguration, UploadedStorefrontPhoto } from './sign';
import { DEFAULT_SIGN_CONFIGURATION, MAX_SIGN_MATERIALS, normalizeMaterials, normalizeSignConfiguration } from './sign';
import {
  CUSTOMER_FLOW_STEP_COUNT,
  CUSTOMER_FLOW_STEPS,
  canGenerateConcept,
  clampStep,
  furthestReachableStep,
  generationBlockingMessageKey,
  parseStepParam,
  stepBlockingMessageKey,
  stepKey,
} from './customerFlow';

function photo(withFile: boolean): UploadedStorefrontPhoto {
  return {
    file: withFile ? new File(['facade'], 'facade.jpg', { type: 'image/jpeg' }) : null,
    fileName: 'facade.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 2048,
    transferState: 'LOCAL_ONLY',
    previewDataUrl: 'data:image/jpeg;base64,dGh1bWI=',
    previewUrl: 'data:image/jpeg;base64,dGh1bWI=',
  };
}

function configuration(overrides: Partial<SignConfiguration> = {}): SignConfiguration {
  return { ...DEFAULT_SIGN_CONFIGURATION, ...overrides };
}

describe('customer flow order', () => {
  it('is exactly photo → business name → sign type → style → materials', () => {
    expect(CUSTOMER_FLOW_STEPS).toEqual(['photo', 'business', 'signType', 'style', 'materials']);
    expect(CUSTOMER_FLOW_STEP_COUNT).toBe(5);
    expect(stepKey(3)).toBe('signType');
  });

  it('clamps unusable step values instead of rendering an empty panel', () => {
    expect(clampStep(Number.NaN)).toBe(1);
    expect(clampStep(0)).toBe(1);
    expect(clampStep(-4)).toBe(1);
    expect(clampStep(2.4)).toBe(2);
    expect(clampStep(99)).toBe(CUSTOMER_FLOW_STEP_COUNT);
    expect(parseStepParam(null)).toBeNull();
    expect(parseStepParam('')).toBeNull();
    expect(parseStepParam('not-a-number')).toBeNull();
    expect(parseStepParam('4')).toBe(4);
    expect(parseStepParam('400')).toBe(CUSTOMER_FLOW_STEP_COUNT);
  });
});

describe('customer flow validation', () => {
  it('blocks the photo step until a real file is available', () => {
    expect(stepBlockingMessageKey(1, { configuration: configuration(), photo: null })).toBe('studio.needPhoto');
    expect(stepBlockingMessageKey(1, { configuration: configuration(), photo: photo(false) })).toBe('studio.photoReupload');
    expect(stepBlockingMessageKey(1, { configuration: configuration(), photo: photo(true) })).toBeNull();
  });

  it('blocks the business step on a missing name and the material step on an empty selection', () => {
    const withPhoto = { configuration: configuration(), photo: photo(true) };
    expect(stepBlockingMessageKey(2, withPhoto)).toBe('studio.needName');
    expect(stepBlockingMessageKey(2, { ...withPhoto, configuration: configuration({ businessName: '  A ' }) })).toBe('studio.needName');
    expect(stepBlockingMessageKey(2, { ...withPhoto, configuration: configuration({ businessName: 'Atelier Sable' }) })).toBeNull();
    expect(stepBlockingMessageKey(5, withPhoto)).toBe('studio.needMaterials');
    expect(stepBlockingMessageKey(5, { ...withPhoto, configuration: configuration({ materials: ['unsure'] }) })).toBeNull();
  });

  it('never blocks the sign type or style steps because both always have a value', () => {
    const state = { configuration: configuration(), photo: photo(true) };
    expect(stepBlockingMessageKey(3, state)).toBeNull();
    expect(stepBlockingMessageKey(4, state)).toBeNull();
  });

  it('unlocks forward navigation only as far as the data allows', () => {
    expect(furthestReachableStep({ configuration: configuration(), photo: null })).toBe(1);
    expect(furthestReachableStep({ configuration: configuration(), photo: photo(true) })).toBe(2);
    expect(furthestReachableStep({ configuration: configuration({ businessName: 'Atelier Sable' }), photo: photo(true) })).toBe(CUSTOMER_FLOW_STEP_COUNT);
  });

  it('explains why generation is unavailable instead of failing silently', () => {
    expect(generationBlockingMessageKey({ configuration: configuration({ businessName: 'Atelier Sable', materials: ['acrylic'] }), photo: photo(false) })).toBe('studio.photoReupload');
    expect(generationBlockingMessageKey({ configuration: configuration({ materials: ['acrylic'] }), photo: photo(true) })).toBe('studio.needName');
    expect(generationBlockingMessageKey({ configuration: configuration({ businessName: 'Atelier Sable' }), photo: photo(true) })).toBe('studio.needMaterials');
    expect(canGenerateConcept({ configuration: configuration({ businessName: 'Atelier Sable', materials: ['acrylic'] }), photo: photo(true) })).toBe(true);
    expect(canGenerateConcept({ configuration: configuration({ businessName: 'Atelier Sable', materials: [] }), photo: photo(true) })).toBe(false);
  });
});

describe('material selection rules', () => {
  it('allows several materials, keeps order, removes duplicates and caps the list', () => {
    expect(normalizeMaterials(['ledModules', 'acrylic', 'ledModules'])).toEqual(['ledModules', 'acrylic']);
    expect(normalizeMaterials(['acrylic', 'not-a-material', 7, null, 'wood'])).toEqual(['acrylic', 'wood']);
    expect(normalizeMaterials(['acrylic', 'aluminium', 'pvc', 'wood', 'vinyl', 'ledModules', 'neonFlex', 'unsure']))
      .toHaveLength(MAX_SIGN_MATERIALS);
    expect(normalizeMaterials(undefined)).toEqual([]);
    expect(normalizeMaterials('acrylic')).toEqual([]);
  });
});

describe('draft recovery normalization', () => {
  it('replaces unusable persisted values with safe defaults', () => {
    const restored = normalizeSignConfiguration({
      businessName: 'Atelier Sable',
      category: 'spaceship-port',
      signType: 'laser',
      style: null,
      materials: 'acrylic',
      color: 'red',
      lighting: 'ultraviolet',
      exactText: 42,
      widthCm: '120',
      heightCm: '60',
      notes: 'Keep the arch.',
    });

    expect(restored).toEqual({
      ...DEFAULT_SIGN_CONFIGURATION,
      businessName: 'Atelier Sable',
      widthCm: '120',
      heightCm: '60',
      notes: 'Keep the arch.',
    });
  });

  it('accepts a valid draft unchanged', () => {
    const valid = configuration({ businessName: 'Atelier Sable', materials: ['acrylic', 'ledModules'], color: '#24463f' });
    expect(normalizeSignConfiguration(valid)).toEqual(valid);
    expect(normalizeSignConfiguration(undefined)).toEqual(DEFAULT_SIGN_CONFIGURATION);
    expect(normalizeSignConfiguration('nonsense')).toEqual(DEFAULT_SIGN_CONFIGURATION);
  });
});
