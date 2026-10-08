import { describe, expect, it } from 'vitest';
import { canonicalJson, conceptMatches, fingerprint, makeProvenance } from './provenance';
import { DEFAULT_SIGN_CONFIGURATION, type AIConceptResult } from './sign';

describe('immutable concept provenance', () => {
  it('hashes canonical key order with SHA-256', () => {
    expect(fingerprint({ b: 2, a: 1 })).toBe(fingerprint({ a: 1, b: 2 }));
    expect(fingerprint({ a: 1 })).toMatch(/^[a-f0-9]{64}$/);
    expect(canonicalJson({ a: [2, 1] })).not.toBe(canonicalJson({ a: [1, 2] }));
  });
  it('preserves the generation input independently of later mutation', () => {
    const config = { ...DEFAULT_SIGN_CONFIGURATION, businessName: 'NAÏA', materials: ['acrylic' as const] };
    const snapshot = makeProvenance(config, 'source-A');
    config.businessName = 'Changed'; config.materials.push('acrylic');
    expect(snapshot.configuration.businessName).toBe('NAÏA');
    expect(snapshot.configuration.materials).toHaveLength(1);
  });
  it('does not present a legacy or changed result as current', () => {
    const provenance = makeProvenance(DEFAULT_SIGN_CONFIGURATION, 'source-A');
    const concept: AIConceptResult = { status: 'GENERATED', providerId: 'fixture', imageUrl: 'data:image/png;base64,aA==', createdAt: new Date().toISOString(), promptVersion: 'test', sourceImageTransfer: 'SENT_TO_SERVER', provenance };
    expect(conceptMatches(concept, DEFAULT_SIGN_CONFIGURATION, 'source-A')).toBe(true);
    expect(conceptMatches(concept, { ...DEFAULT_SIGN_CONFIGURATION, color: '#ffffff' }, 'source-A')).toBe(false);
    expect(conceptMatches(concept, DEFAULT_SIGN_CONFIGURATION, 'source-B')).toBe(false);
    expect(conceptMatches({ ...concept, provenance: undefined }, DEFAULT_SIGN_CONFIGURATION, 'source-A')).toBe(false);
  });
});
