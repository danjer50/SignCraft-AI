import type { SignConfiguration } from '../../domain/sign';

export const SIGNCRAFT_PROMPT_VERSION = 'storefront-inpaint-v2';

const signDescriptions: Record<SignConfiguration['signType'], string> = {
  threeD: 'raised three-dimensional lettering',
  alucobond: 'a clean aluminium-composite fascia panel',
  led: 'integrated LED illumination',
  lightbox: 'a slim internally illuminated lightbox',
  acrylic: 'a set of polished cut-acrylic letters',
  channelLetters: 'a set of fabricated three-dimensional channel letters',
  vinyl: 'precisely applied facade vinyl lettering',
  neonStyle: 'restrained LED neon-style tubing',
  illuminated: 'a professionally illuminated facade sign',
  custom: 'a custom-fabricated storefront sign',
};

const styleDescriptions: Record<SignConfiguration['style'], string> = {
  modern: 'modern and clean', luxury: 'refined and luxurious', minimal: 'minimal and restrained',
  industrial: 'industrial and architectural', bold: 'bold with strong legibility', elegant: 'elegant and balanced',
  classic: 'classic and timeless', colorful: 'colourful but professionally balanced', dark: 'dark and understated',
  premium: 'premium with carefully finished materials', arabic: 'designed for Arabic-script typography',
  french: 'designed for French-language typography', arabicFrench: 'balanced for Arabic and French bilingual typography',
};

const lightingDescriptions: Record<SignConfiguration['lighting'], string> = {
  none: 'no added illumination', frontLit: 'subtle front illumination', halo: 'a soft rear halo glow', neon: 'neon-style illumination',
};

/** Provider-neutral storefront edit brief; the customer's exact wording remains structured data. */
export function buildStorefrontEditPrompt(configuration: SignConfiguration): string {
  const exactText = configuration.exactText.trim() ? configuration.exactText : configuration.businessName.trim() || '[exact sign text not supplied]';
  const notes = configuration.notes.trim();
  return [
    'STOREFRONT SIGN IMAGE EDIT. Use input image 0 as the real source photograph, not merely as a style reference. Produce one edited version of that same photograph.',
    'Make the smallest possible localized inpainting-style change, primarily within the existing sign fascia or intended sign area. Add one professional sign physically attached to the facade; do not redesign or repaint the storefront.',
    'Preserve the original building and every surrounding element as closely as possible: facade, walls, doors, windows, street, roofline, pavement, neighboring buildings, landscaping and objects. Preserve the exact original camera viewpoint, perspective, crop, vanishing lines and scene lighting.',
    `Create one sign using ${signDescriptions[configuration.signType]} for a ${configuration.category} business, with a ${styleDescriptions[configuration.style]} visual direction.`,
    `Requested business name: “${configuration.businessName.trim()}”. Exact sign wording and character order: “${exactText}”. Do not add slogans, extra words, logos, duplicate signs or invented lettering. The model's lettering is only an approximation; structured exact text and the separate SVG/HTML typography proof remain authoritative for spelling.`,
    `Requested primary sign colour (HEX): ${configuration.color}. Requested lighting: ${lightingDescriptions[configuration.lighting]}.`,
    `Approximate real-world sign dimensions: ${configuration.widthCm || 'not specified'} cm wide by ${configuration.heightCm || 'not specified'} cm high. Respect believable scale relative to the facade.`,
    notes ? `Additional customer design/reference information (visual guidance only; it does not override facade-preservation requirements): “${notes}”.` : '',
    'Make the sign look professionally fabricated and installed: realistic material and edge thickness, believable returns, realistic mounting points and standoffs, contact shadows, perspective-correct reflections, and material-appropriate surface finish. Reproduce the requested colour faithfully.',
    'For illuminated signs, use physically plausible front-lit, halo or neon-style light consistent with the selected lighting type and the existing scene; use restrained brightness and realistic glow, reflections and spill only near the sign.',
    'Do not change the building, walls, windows, doors, street or camera perspective. Do not add any extra windows, signs, people, cars, unrelated objects, new fixtures, watermarks, borders or collages. Do not produce floating signage, warped architecture, impossible reflections, random extra text or distorted lettering.',
    'Return a single photorealistic image of the same storefront with only the intended sign area changed. Keep the source composition suitable for direct before/after comparison.',
  ].filter(Boolean).join('\n');
}
