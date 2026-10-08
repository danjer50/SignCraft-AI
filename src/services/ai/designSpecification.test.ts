import { describe, expect, it } from 'vitest';
import { DEFAULT_SIGN_CONFIGURATION } from '../../domain/sign';
import {
  buildDesignSpecification,
  buildPlacementSpecification,
  generateStructuredDesignSpecification,
  getMaterialSpecification,
  getStyleSpecification,
  getSignTypeSpecification,
  getLightingSpecification,
  getBusinessCategorySpecification
} from './designSpecification';
import type { SignConfiguration } from '../../domain/sign';

describe('Design Specification', () => {
  describe('buildDesignSpecification', () => {
    it('builds a complete design specification from configuration', () => {
      const configuration: SignConfiguration = {
        ...DEFAULT_SIGN_CONFIGURATION,
        businessName: 'Test Business',
        category: 'retail',
        signType: 'threeD',
        style: 'modern',
        materials: ['acrylic', 'aluminium'],
        color: '#ff0000',
        lighting: 'halo',
        exactText: 'TEST SIGN',
        widthCm: '100',
        heightCm: '50',
        notes: 'Test notes',
        signArea: null,
        replaceExistingSurface: false,
      };

      const spec = buildDesignSpecification(configuration);

      expect(spec.signType.name).toBe('3D Letters');
      expect(spec.style.name).toBe('Modern');
      expect(spec.materials.length).toBe(2);
      expect(spec.materials[0].name).toBe('Acrylic');
      expect(spec.materials[1].name).toBe('Aluminium');
      expect(spec.lighting.name).toBe('Halo Illumination');
      expect(spec.businessCategory.name).toBe('Retail');
      expect(spec.text).toBe('TEST SIGN');
      expect(spec.color).toBe('#ff0000');
      expect(spec.dimensions.widthCm).toBe('100');
      expect(spec.dimensions.heightCm).toBe('50');
      expect(spec.notes).toBe('Test notes');
    });

    it('handles empty materials', () => {
      const configuration: SignConfiguration = {
        ...DEFAULT_SIGN_CONFIGURATION,
        materials: [],
      };

      const spec = buildDesignSpecification(configuration);
      expect(spec.materials.length).toBe(0);
    });

    it('handles empty notes', () => {
      const configuration: SignConfiguration = {
        ...DEFAULT_SIGN_CONFIGURATION,
        notes: '   ',
      };

      const spec = buildDesignSpecification(configuration);
      expect(spec.notes).toBeNull();
    });

    it('uses businessName as fallback for text', () => {
      const configuration: SignConfiguration = {
        ...DEFAULT_SIGN_CONFIGURATION,
        businessName: 'Fallback Business',
        exactText: '',
      };

      const spec = buildDesignSpecification(configuration);
      expect(spec.text).toBe('Fallback Business');
    });
  });

  describe('buildPlacementSpecification', () => {
    it('returns hasPlacement false when signArea is null', () => {
      const spec = buildPlacementSpecification(null, false);
      expect(spec.hasPlacement).toBe(false);
      expect(spec.bounds).toBeNull();
      expect(spec.replaceExistingSurface).toBe(false);
    });

    it('returns hasPlacement true when signArea has strokes', () => {
      const signArea = {
        strokes: [
          {
            points: [
              { xPercent: 10, yPercent: 10 },
              { xPercent: 20, yPercent: 20 }
            ]
          }
        ]
      };

      const spec = buildPlacementSpecification(signArea, false);
      expect(spec.hasPlacement).toBe(true);
      expect(spec.bounds).not.toBeNull();
      expect(spec.bounds?.xPercent).toBeCloseTo(10, 0);
      expect(spec.bounds?.yPercent).toBeCloseTo(10, 0);
    });

    it('calculates bounds correctly for multiple strokes', () => {
      const signArea = {
        strokes: [
          {
            points: [
              { xPercent: 10, yPercent: 10 },
              { xPercent: 20, yPercent: 10 }
            ]
          },
          {
            points: [
              { xPercent: 15, yPercent: 5 },
              { xPercent: 25, yPercent: 15 }
            ]
          }
        ]
      };

      const spec = buildPlacementSpecification(signArea, false);
      expect(spec.bounds).not.toBeNull();
      expect(spec.bounds?.xPercent).toBeCloseTo(10, 0);
      expect(spec.bounds?.yPercent).toBeCloseTo(5, 0);
    });

    it('includes replaceExistingSurface in the description', () => {
      const signArea = {
        strokes: [
          {
            points: [
              { xPercent: 10, yPercent: 10 },
              { xPercent: 20, yPercent: 20 }
            ]
          }
        ]
      };

      const spec = buildPlacementSpecification(signArea, true);
      expect(spec.replaceExistingSurface).toBe(true);
      expect(spec.placementDescription).toContain('fully covered or replaced');
    });
  });

  describe('generateStructuredDesignSpecification', () => {
    it('generates a comprehensive structured specification', () => {
      const configuration: SignConfiguration = {
        ...DEFAULT_SIGN_CONFIGURATION,
        businessName: 'Test Business',
        category: 'restaurant',
        signType: 'led',
        style: 'luxury',
        materials: ['stainlessSteel', 'ledModules'],
        color: '#ffffff',
        lighting: 'neon',
        exactText: 'LUXURY RESTAURANT',
        widthCm: '200',
        heightCm: '80',
        notes: 'High-end design',
        signArea: {
          strokes: [
            {
              points: [
                { xPercent: 20, yPercent: 20 },
                { xPercent: 40, yPercent: 40 }
              ]
            }
          ]
        },
        replaceExistingSurface: true,
      };

      const spec = generateStructuredDesignSpecification(configuration);

      // Check that all major sections are included
      expect(spec).toContain('=== PLACEMENT SPECIFICATION ===');
      expect(spec).toContain('=== SIGN TYPE SPECIFICATION ===');
      expect(spec).toContain('=== STYLE SPECIFICATION ===');
      expect(spec).toContain('=== MATERIAL SPECIFICATIONS ===');
      expect(spec).toContain('=== LIGHTING SPECIFICATION ===');
      expect(spec).toContain('=== BUSINESS CONTEXT ===');
      expect(spec).toContain('=== TEXT AND COLOR ===');

      // Check specific content
      expect(spec).toContain('LED Sign');
      expect(spec).toContain('Luxury');
      expect(spec).toContain('Stainless Steel');
      expect(spec).toContain('LED Modules');
      expect(spec).toContain('Neon-Style Illumination');
      expect(spec).toContain('Restaurant');
      expect(spec).toContain('LUXURY RESTAURANT');
      expect(spec).toContain('#ffffff');
      expect(spec).toContain('200');
      expect(spec).toContain('80');
      expect(spec).toContain('High-end design');
    });

    it('handles minimal configuration', () => {
      const configuration: SignConfiguration = {
        ...DEFAULT_SIGN_CONFIGURATION,
        businessName: 'Minimal',
        signArea: null,
      };

      const spec = generateStructuredDesignSpecification(configuration);

      expect(spec).toContain('=== PLACEMENT SPECIFICATION ===');
      expect(spec).toContain('=== SIGN TYPE SPECIFICATION ===');
      expect(spec).not.toContain('=== ADDITIONAL NOTES ===');
    });
  });

  describe('Individual Specification Getters', () => {
    it('getMaterialSpecification returns correct specification for acrylic', () => {
      const spec = getMaterialSpecification('acrylic');
      expect(spec.name).toBe('Acrylic');
      expect(spec.description).toContain('Polished cast acrylic');
      expect(spec.surfaceAppearance).toContain('Smooth, glossy surface');
      expect(spec.glossFinish).toBe('High-gloss, reflective finish that mirrors surroundings');
    });

    it('getStyleSpecification returns correct specification for modern', () => {
      const spec = getStyleSpecification('modern');
      expect(spec.name).toBe('Modern');
      expect(spec.description).toContain('Clean, contemporary design');
      expect(spec.visualCharacter).toContain('Minimalist, uncluttered');
    });

    it('getSignTypeSpecification returns correct specification for threeD', () => {
      const spec = getSignTypeSpecification('threeD');
      expect(spec.name).toBe('3D Letters');
      expect(spec.description).toContain('Three-dimensional raised lettering');
      expect(spec.construction).toContain('Individual letters fabricated from solid material');
    });

    it('getLightingSpecification returns correct specification for halo', () => {
      const spec = getLightingSpecification('halo');
      expect(spec.name).toBe('Halo Illumination');
      expect(spec.description).toContain('A soft rear halo glow');
      expect(spec.glowEffect).toContain('Soft halo glow around the sign perimeter');
    });

    it('getBusinessCategorySpecification returns correct specification for cafe', () => {
      const spec = getBusinessCategorySpecification('cafe');
      expect(spec.name).toBe('Café');
      expect(spec.description).toContain('Café or coffee shop');
      expect(spec.typicalSignStyle).toContain('Casual, inviting');
    });
  });
});
