import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SIGN_CONFIGURATION, normalizeMaterials } from '../../domain/sign';
import { DemoAIProvider } from './demoProvider';
import type { ImageEditingRequest } from './contracts';
import { buildStorefrontEditPrompt, SIGNCRAFT_PROMPT_VERSION } from './promptBuilder';

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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('storefront image-edit architecture', () => {
  it('builds an inpainting brief that protects the source facade and exact text', () => {
    const prompt = buildStorefrontEditPrompt(configuration);
    expect(prompt).toContain('localized inpainting');
    expect(prompt).toContain('doors, windows, street');
    expect(prompt).toContain('camera viewpoint');
    expect(prompt).toContain('realistic mounting points');
    expect(prompt).toContain('ATELIER LUNE · حروف');
    expect(prompt).toContain('structured exact text and the separate SVG/HTML typography proof remain authoritative for spelling');
    expect(prompt).toContain('Do not add any extra windows');
  });

  it('leads with a mandatory visible edit and versions the strengthened prompt', () => {
    expect(SIGNCRAFT_PROMPT_VERSION).toBe('storefront-inpaint-v6');
    const prompt = buildStorefrontEditPrompt(configuration);
    expect(prompt.startsWith('MANDATORY EDIT: return the source photograph with the new storefront sign visibly added.')).toBe(true);
    expect(prompt).toContain('Returning the source photograph unchanged');
    expect(prompt).toContain('is a failed answer');
  });

  it('describes every requested material, in the customer’s own priority order', () => {
    const prompt = buildStorefrontEditPrompt({
      ...configuration,
      materials: ['stainlessSteel', 'ledModules', 'acrylic'],
    });
    expect(prompt).toContain("Requested fabrication materials, in the customer's priority order: brushed or polished stainless steel; integrated LED modules with a diffusing face; polished cast acrylic (plexiglass).");
    expect(prompt).toContain('combine them plausibly on one sign');
    expect(prompt).toContain('instead of duplicating the sign');
  });

  it('never invents a material when the customer has not chosen one', () => {
    const prompt = buildStorefrontEditPrompt({ ...configuration, materials: [] });
    expect(prompt).toContain('No specific material was requested yet');
    expect(prompt).toContain('without inventing branded products');
    expect(prompt).not.toContain('polished cast acrylic');

    const unsureOnly = buildStorefrontEditPrompt({ ...configuration, materials: ['unsure'] });
    expect(unsureOnly).toContain('No specific material was requested yet');
  });

  it('keeps the “advise me” choice honest when it is combined with real materials', () => {
    const prompt = buildStorefrontEditPrompt({ ...configuration, materials: ['wood', 'unsure'] });
    expect(prompt).toContain('treated exterior wood');
    expect(prompt).toContain('open to a professional recommendation for any remaining part');
    expect(prompt).not.toContain('a professionally appropriate material chosen by the sign maker');
  });

  it('ignores impossible material values instead of leaking them into the prompt', () => {
    const prompt = buildStorefrontEditPrompt({
      ...configuration,
      materials: normalizeMaterials(['acrylic', 'unobtainium', 'acrylic', 'pvc']),
    });
    expect(prompt).toContain('polished cast acrylic (plexiglass); expanded PVC foam board');
    expect(prompt).not.toContain('unobtainium');
  });

  it('describes a customer-painted sign area as an indicative location, not an exact crop', () => {
    const prompt = buildStorefrontEditPrompt({
      ...configuration,
      signArea: { strokes: [{ points: [{ xPercent: 10, yPercent: 15.4 }, { xPercent: 45.6, yPercent: 27.4 }] }] },
    });
    expect(prompt).toContain('centered at about (28%, 21%)');
    expect(prompt).toContain('(10%, 15%) to (46%, 27%)');
    expect(prompt).toContain('not an exact crop, mask or size');
    expect(prompt).toContain('confident, clearly visible, natural localized');
  });

  it('demands a clearly visible result in the marked area instead of a barely-perceptible edit', () => {
    const prompt = buildStorefrontEditPrompt({
      ...configuration,
      signArea: { strokes: [{ points: [{ xPercent: 10, yPercent: 15 }, { xPercent: 45, yPercent: 27 }] }] },
    });
    expect(prompt).toContain('MUST look clearly, unmistakably different from the source photo');
    expect(prompt).toContain('is a failed edit');
  });

  it('spans every painted stroke, not just the first one, when describing the marked location', () => {
    const prompt = buildStorefrontEditPrompt({
      ...configuration,
      signArea: {
        strokes: [
          { points: [{ xPercent: 10, yPercent: 10 }] },
          { points: [{ xPercent: 50, yPercent: 30 }] },
        ],
      },
    });
    expect(prompt).toContain('(10%, 10%) to (50%, 30%)');
  });

  it('allows a marked area to be fully replaced when the customer flags existing surface', () => {
    const prompt = buildStorefrontEditPrompt({
      ...configuration,
      signArea: { strokes: [{ points: [{ xPercent: 10, yPercent: 15 }, { xPercent: 45, yPercent: 27 }] }] },
      replaceExistingSurface: true,
    });
    expect(prompt).toContain('fully removed, covered or wrapped and replaced with one confident');
    expect(prompt).toContain('its texture or its colour partially visible underneath or around the new one');
  });

  it('keeps asking for a visible change even without a marked area, instead of an understated edit', () => {
    const prompt = buildStorefrontEditPrompt(configuration);
    expect(prompt).toContain('clearly visible but localized inpainting-style change');
    expect(prompt).toContain('a barely perceptible edit is not an acceptable result');
    expect(prompt).not.toContain('marked sign area');
  });

  it('still asks for a localized change even when "replace existing surface" is set without a marked area', () => {
    const prompt = buildStorefrontEditPrompt({ ...configuration, replaceExistingSurface: true });
    expect(prompt).toContain('currently holds something that should be fully covered or replaced');
  });

  it('instructs the model to render both languages when the bilingual Arabic + French style is chosen', () => {
    const prompt = buildStorefrontEditPrompt({ ...configuration, style: 'arabicFrench', exactText: 'مقهى · CAFÉ' });
    expect(prompt).toContain('مقهى · CAFÉ');
    expect(prompt).toContain('intentionally combines two languages');
    expect(prompt).toContain('do not render only one of the two languages');
  });

  it('asks for correctly connected Arabic letterforms when the Arabic-only style is chosen', () => {
    const prompt = buildStorefrontEditPrompt({ ...configuration, style: 'arabic', exactText: 'مقهى' });
    expect(prompt).toContain('correctly connected, right-to-left Arabic letterforms');
  });

  it('adds no extra script guidance for styles unrelated to Arabic or bilingual text', () => {
    const prompt = buildStorefrontEditPrompt({ ...configuration, style: 'modern' });
    expect(prompt).not.toContain('intentionally combines two languages');
    expect(prompt).not.toContain('connected, right-to-left Arabic letterforms');
  });

  it('preserves exact sign text including intentional surrounding whitespace', () => {
    const exactText = '  Atelier Sable · حرف  ';
    expect(buildStorefrontEditPrompt({ ...configuration, exactText })).toContain(`Exact sign wording and character order: “${exactText}”.`);
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

  it('keeps the offline demo mode local and unavailable, only when it is explicitly requested', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_AI_MODE', 'demo');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { generateStorefrontConcept: generateInDemoMode } = await import('./client');

    const result = await generateInDemoMode({ sourceImage: request.sourceImage, configuration: request.configuration });

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.sourceImageTransfer).toBe('LOCAL_ONLY');
    expect(result).not.toHaveProperty('imageUrl');
    // Nothing left the browser: the demo provider never touches the network.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
