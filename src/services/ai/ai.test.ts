import { describe, expect, it } from 'vitest';
import { DEFAULT_SIGN_CONFIGURATION } from '../../domain/sign';
import { DemoAIProvider } from './demoProvider';
import type { ImageEditingRequest } from './contracts';
import { buildStorefrontEditPrompt } from './promptBuilder';

const configuration = {
  ...DEFAULT_SIGN_CONFIGURATION,
  businessName: 'Atelier Lune',
  exactText: 'ATELIER LUNE · حروف',
  notes: 'Keep the stone arch untouched.',
};

const request: ImageEditingRequest = {
  sourceImage: new File(['storefront'], 'front.webp', { type: 'image/webp' }),
  configuration,
  prompt: buildStorefrontEditPrompt(configuration),
  preserveSourceArchitecture: true,
  exactTextOverlayRequired: true,
};

describe('storefront image-edit architecture', () => {
  it('builds an inpainting brief that protects the source facade and exact text', () => {
    const prompt = buildStorefrontEditPrompt(configuration);
    expect(prompt).toContain('localized inpainting');
    expect(prompt).toContain('doors, windows, street');
    expect(prompt).toContain('camera viewpoint');
    expect(prompt).toContain('realistic mounting points');
    expect(prompt).toContain('ATELIER LUNE · حروف');
    expect(prompt).toContain('separate precise vector text overlay');
    expect(prompt).toContain('Do not add any extra windows');
  });

  it('returns an honest unavailable state instead of a fabricated image', async () => {
    const result = await new DemoAIProvider().generate(request);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.providerId).toBe('demo-unconfigured');
    expect(result).not.toHaveProperty('imageUrl');
    if (result.status === 'UNAVAILABLE' || result.status === 'ERROR') {
      expect(result.message).toMatch(/has not been edited/i);
    }
  });
});
