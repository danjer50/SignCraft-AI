import type { SignConfiguration } from '../../domain/sign';

export const SIGNCRAFT_PROMPT_VERSION = 'storefront-inpaint-v1';

/**
 * Provider-neutral edit brief. It explicitly asks for localized inpainting and preserves
 * the source photo; exact lettering is separately rendered as text/SVG in the UI.
 */
export function buildStorefrontEditPrompt(configuration: SignConfiguration): string {
  const exactText = configuration.exactText.trim() || configuration.businessName.trim() || '[exact sign text not supplied]';
  return [
    'IMAGE-TO-IMAGE STOREFRONT SIGN EDIT. Use the supplied original photograph as the immutable base image.',
    'Use localized inpainting only on the existing sign fascia or the explicitly masked sign area. Preserve the original building, facade, doors, windows, street, people, landscaping, neighboring properties and all surrounding objects exactly; do not invent, remove, move, resize or distort them.',
    'Preserve the original camera viewpoint, lens perspective, crop, vanishing lines, lighting direction and overall image dimensions. Do not create a different building or a new scene.',
    `Propose one ${configuration.signType} sign in a ${configuration.style} visual style for the business category ${configuration.category}.`,
    `Sign text, exact spelling and character order: “${exactText}”. Do not add slogans, extra words, logos or duplicate signage. Image-model lettering is a visual approximation only; a separate precise vector text overlay is authoritative.`,
    `Primary sign colour: ${configuration.color}. Lighting: ${configuration.lighting}.`,
    `Approximate dimensions: ${configuration.widthCm || 'not specified'} cm wide × ${configuration.heightCm || 'not specified'} cm high.`,
    configuration.notes.trim() ? `Additional customer requirements: ${configuration.notes.trim()}` : '',
    'Make the sign physically plausible: believable thickness and edge returns, realistic mounting points and standoff depth, material-specific surface finish, contact shadows, perspective-correct reflections, and restrained LED or halo illumination consistent with the scene. Keep lighting on the sign, not across unrelated architecture.',
    'Do not add any extra windows, signs, lettering, fixtures or objects. No facade redesign, no warped geometry, no floating sign, no impossible reflections, no excessive glow, no watermarks, no border, no collage.',
    'Return a single photorealistic edited version of the same source photograph. Preserve enough facade around the sign for direct before/after comparison.',
  ].filter(Boolean).join('\n');
}
