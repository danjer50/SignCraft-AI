import type { SignArea, SignAreaBounds } from '../../domain/sign';

/**
 * Mask generation constants and utilities.
 * Creates a binary PNG from user brush strokes for a future provider-specific native inpainting
 * adapter. Current providers do not consume this generic mask; callers must match the documented
 * provider dimensions and polarity before adding it to an upstream request.
 */

const MASK_CANVAS_SIZE = 512;
const MASK_COLOR_ON = 255; // White = area to edit
const MASK_COLOR_OFF = 0; // Black = area to preserve

/**
 * Convert percentage coordinates to canvas pixel coordinates.
 */
function percentToPixel(percent: number, size: number): number {
  return Math.round((percent / 100) * (size - 1));
}

/**
 * Create a canvas and draw the brush strokes as a mask.
 * The mask is white (255) where the user painted (area to edit)
 * and black (0) everywhere else (area to preserve).
 */
function createMaskCanvas(signArea: SignArea, size: number = MASK_CANVAS_SIZE): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Cannot create mask: 2D context unavailable');
  }

  // Fill with black (preserve everywhere by default)
  ctx.fillStyle = `rgb(${MASK_COLOR_OFF}, ${MASK_COLOR_OFF}, ${MASK_COLOR_OFF})`;
  ctx.fillRect(0, 0, size, size);

  // Draw each stroke as white (edit area)
  ctx.strokeStyle = `rgb(${MASK_COLOR_ON}, ${MASK_COLOR_ON}, ${MASK_COLOR_ON})`;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, Math.round(size * 0.01)); // Scale brush width with canvas size

  for (const stroke of signArea.strokes) {
    if (stroke.points.length === 0) continue;
    
    // Convert percentage points to pixel coordinates
    const pixels = stroke.points.map(point => ({
      x: percentToPixel(point.xPercent, size),
      y: percentToPixel(point.yPercent, size)
    }));
    
    if (pixels.length === 1) {
      // Single point: draw a small circle
      ctx.beginPath();
      ctx.arc(pixels[0].x, pixels[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${MASK_COLOR_ON}, ${MASK_COLOR_ON}, ${MASK_COLOR_ON})`;
      ctx.fill();
    } else {
      // Multiple points: draw a polyline
      ctx.beginPath();
      ctx.moveTo(pixels[0].x, pixels[0].y);
      for (let i = 1; i < pixels.length; i++) {
        ctx.lineTo(pixels[i].x, pixels[i].y);
      }
      ctx.stroke();
    }
  }

  return canvas;
}

/**
 * Generate a generic 512×512 binary mask blob from the user's brush strokes.
 * This is not currently uploaded; provider adapters require provider-specific formats and source-matched dimensions.
 */
export async function generateMaskFromSignArea(signArea: SignArea | null): Promise<Blob | null> {
  if (!signArea || signArea.strokes.length === 0) {
    return null;
  }

  const canvas = createMaskCanvas(signArea);
  
  try {
    // Convert canvas to PNG blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/png');
    });
    
    return blob;
  } catch (error) {
    console.error('Failed to generate mask:', error);
    return null;
  } finally {
    // Clean up canvas to free memory
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Generate a mask that covers the entire sign area bounds as a rectangle.
 * This is a fallback when stroke-based mask generation fails or for
 * providers that work better with rectangular masks.
 */
export async function generateRectangularMaskFromBounds(
  bounds: SignAreaBounds | null,
  imageWidth: number,
  imageHeight: number
): Promise<Blob | null> {
  if (!bounds) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  // Fill with black (preserve)
  ctx.fillStyle = `rgb(${MASK_COLOR_OFF}, ${MASK_COLOR_OFF}, ${MASK_COLOR_OFF})`;
  ctx.fillRect(0, 0, imageWidth, imageHeight);

  // Calculate pixel coordinates from percentages
  const x = percentToPixel(bounds.xPercent, imageWidth);
  const y = percentToPixel(bounds.yPercent, imageHeight);
  const width = Math.max(1, percentToPixel(bounds.widthPercent, imageWidth));
  const height = Math.max(1, percentToPixel(bounds.heightPercent, imageHeight));

  // Fill the rectangular area with white (edit)
  ctx.fillStyle = `rgb(${MASK_COLOR_ON}, ${MASK_COLOR_ON}, ${MASK_COLOR_ON})`;
  ctx.fillRect(x, y, width, height);

  try {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/png');
    });
    return blob;
  } catch {
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Check if the current environment supports mask generation.
 * Mask generation requires canvas support which may not be available
 * in all server-side environments.
 */
export function isMaskGenerationSupported(): boolean {
  return typeof document !== 'undefined' && 
         typeof HTMLCanvasElement !== 'undefined' &&
         typeof document.createElement === 'function';
}
