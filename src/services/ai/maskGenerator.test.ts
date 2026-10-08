import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { generateMaskFromSignArea, generateRectangularMaskFromBounds, isMaskGenerationSupported } from './maskGenerator';
import type { SignArea, SignAreaBounds } from '../../domain/sign';

// Mock canvas and its methods
class MockCanvas {
  width = 0;
  height = 0;
  private context: MockCanvasRenderingContext2D | null = null;

  getContext(type: '2d'): MockCanvasRenderingContext2D | null {
    if (type === '2d') {
      this.context = new MockCanvasRenderingContext2D();
      return this.context;
    }
    return null;
  }

  toBlob(callback: (blob: Blob | null) => void, type: string): void {
    // Return a mock blob
    const mockBlob = new Blob(['mock-png-data'], { type });
    callback(mockBlob);
  }
}

class MockCanvasRenderingContext2D {
  fillStyle = '';
  strokeStyle = '';
  lineCap = '';
  lineJoin = '';
  lineWidth = 0;
  private commands: Array<{ type: string; args: unknown[] }> = [];

  fillRect(x: number, y: number, width: number, height: number): void {
    this.commands.push({ type: 'fillRect', args: [x, y, width, height] });
  }

  beginPath(): void {
    this.commands.push({ type: 'beginPath', args: [] });
  }

  moveTo(x: number, y: number): void {
    this.commands.push({ type: 'moveTo', args: [x, y] });
  }

  lineTo(x: number, y: number): void {
    this.commands.push({ type: 'lineTo', args: [x, y] });
  }

  stroke(): void {
    this.commands.push({ type: 'stroke', args: [] });
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void {
    this.commands.push({ type: 'arc', args: [x, y, radius, startAngle, endAngle] });
  }

  fill(): void {
    this.commands.push({ type: 'fill', args: [] });
  }
}

describe('Mask Generation', () => {
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    // Save originals
    originalCreateElement = document.createElement;

    // Mock canvas creation
    vi.stubGlobal('document', {
      ...document,
      createElement: (tagName: string) => {
        if (tagName === 'canvas') {
          return new MockCanvas() as unknown as HTMLCanvasElement;
        }
        return originalCreateElement.call(document, tagName);
      }
    });

    // Mock HTMLCanvasElement to use our mock
    vi.stubGlobal('HTMLCanvasElement', MockCanvas as unknown as typeof HTMLCanvasElement);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('isMaskGenerationSupported', () => {
    it('returns true when document and canvas are available', () => {
      // This test runs in a DOM environment
      expect(isMaskGenerationSupported()).toBe(true);
    });

    it('returns false when document is not available', () => {
      const originalDocument = globalThis.document;
      delete (globalThis as Record<string, unknown>).document;
      try {
        expect(isMaskGenerationSupported()).toBe(false);
      } finally {
        globalThis.document = originalDocument;
      }
    });
  });

  describe('generateMaskFromSignArea', () => {
    it('returns null when signArea is null', async () => {
      const result = await generateMaskFromSignArea(null);
      expect(result).toBeNull();
    });

    it('returns null when signArea has no strokes', async () => {
      const signArea: SignArea = { strokes: [] };
      const result = await generateMaskFromSignArea(signArea);
      expect(result).toBeNull();
    });

    it('returns a blob when signArea has valid strokes', async () => {
      const signArea: SignArea = {
        strokes: [
          {
            points: [
              { xPercent: 10, yPercent: 10 },
              { xPercent: 20, yPercent: 20 },
              { xPercent: 30, yPercent: 10 }
            ]
          }
        ]
      };

      const result = await generateMaskFromSignArea(signArea);
      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(Blob);
    });

    it('handles single point strokes by drawing a circle', async () => {
      const signArea: SignArea = {
        strokes: [
          {
            points: [{ xPercent: 50, yPercent: 50 }]
          }
        ]
      };

      const result = await generateMaskFromSignArea(signArea);
      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(Blob);
    });

    it('handles multiple strokes', async () => {
      const signArea: SignArea = {
        strokes: [
          {
            points: [
              { xPercent: 10, yPercent: 10 },
              { xPercent: 20, yPercent: 10 }
            ]
          },
          {
            points: [
              { xPercent: 30, yPercent: 20 },
              { xPercent: 40, yPercent: 20 }
            ]
          }
        ]
      };

      const result = await generateMaskFromSignArea(signArea);
      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(Blob);
    });
  });

  describe('generateRectangularMaskFromBounds', () => {
    it('returns null when bounds is null', async () => {
      const result = await generateRectangularMaskFromBounds(null, 512, 512);
      expect(result).toBeNull();
    });

    it('returns a blob for valid bounds and dimensions', async () => {
      const bounds: SignAreaBounds = {
        xPercent: 10,
        yPercent: 10,
        widthPercent: 20,
        heightPercent: 20,
        centerXPercent: 20,
        centerYPercent: 20
      };

      const result = await generateRectangularMaskFromBounds(bounds, 512, 512);
      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(Blob);
    });

    it('handles edge cases in bounds calculation', async () => {
      const bounds: SignAreaBounds = {
        xPercent: 0,
        yPercent: 0,
        widthPercent: 100,
        heightPercent: 100,
        centerXPercent: 50,
        centerYPercent: 50
      };

      const result = await generateRectangularMaskFromBounds(bounds, 256, 256);
      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(Blob);
    });
  });
});
