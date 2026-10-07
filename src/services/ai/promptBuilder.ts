import type { SignConfiguration, SignMaterial } from '../../domain/sign.js';
import { computeSignAreaBounds, normalizeMaterials } from '../../domain/sign.js';

export const SIGNCRAFT_PROMPT_VERSION = 'storefront-inpaint-v6';

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

const materialDescriptions: Record<SignMaterial, string> = {
  acrylic: 'polished cast acrylic (plexiglass)',
  aluminiumComposite: 'aluminium composite panel (Alucobond/Dibond)',
  aluminium: 'folded sheet aluminium',
  pvc: 'expanded PVC foam board',
  polycarbonate: 'translucent polycarbonate',
  stainlessSteel: 'brushed or polished stainless steel',
  galvanizedSteel: 'painted galvanized steel',
  wood: 'treated exterior wood',
  vinyl: 'applied adhesive vinyl film',
  ledModules: 'integrated LED modules with a diffusing face',
  neonFlex: 'LED neon-flex tubing',
  unsure: 'a professionally appropriate material chosen by the sign maker',
};

const NO_MATERIAL_BRIEF = 'No specific material was requested yet; use one professionally plausible material for this sign type without inventing branded products.';

/**
 * Translate the customer's painted brush marks (percentages of the source photo) into an
 * explicit but non-prescriptive location brief, and state plainly whether the marked spot must
 * be fully replaced (e.g. an old sign, a shutter or security bars) rather than only receiving a
 * small localized addition. The painted marks indicate WHERE the sign goes, never its exact
 * size or shape: the model must still choose believable proportions for a real sign there.
 */
function describeSignPlacement(configuration: SignConfiguration): string {
  const bounds = computeSignAreaBounds(configuration.signArea);
  if (!bounds) {
    return configuration.replaceExistingSurface
      ? 'The customer indicates the intended sign area currently holds something that should be fully covered or replaced (for example old signage, a shutter or security bars). Make that area clearly, visibly different from the source photo; still keep the rest of the facade untouched.'
      : '';
  }
  const centerX = Math.round(bounds.centerXPercent);
  const centerY = Math.round(bounds.centerYPercent);
  const left = Math.round(bounds.xPercent);
  const top = Math.round(bounds.yPercent);
  const right = Math.min(100, Math.round(bounds.xPercent + bounds.widthPercent));
  const bottom = Math.min(100, Math.round(bounds.yPercent + bounds.heightPercent));
  const placement = `The customer painted a mark on the source photo to show roughly WHERE the sign belongs, centered at about (${centerX}%, ${centerY}%) of the image, within a general zone spanning approximately (${left}%, ${top}%) to (${right}%, ${bottom}%) of the frame. This mark is only a location indicator, not an exact crop, mask or size: do not crop, letterbox or force the sign to fill exactly this painted shape. Instead, place one sign naturally at that facade location, choosing realistic proportions and scale for that spot and sign type, the way a real sign would actually be mounted there. Keep the change generally limited to that area and its immediate surroundings; everything well outside it should remain close to the source photo.`;
  const coverage = configuration.replaceExistingSurface
    ? ' Whatever currently occupies that general location (for example an old sign, a shutter, security bars, pillars, grilles or a blank wall) must be fully removed, covered or wrapped and replaced with one confident, complete, professionally fabricated sign or decorative cladding; do not leave the old element, its texture or its colour partially visible underneath or around the new one.'
    : ' Add the new sign at that general location.';
  const mandatoryChange = ' This edit is the whole point of the request: the marked area MUST look clearly, unmistakably different from the source photo in the final image. A result where that area looks the same, almost the same, or only subtly different from the original photo is a failed edit, even if the rest of the photo is preserved perfectly.';
  return placement + coverage + mandatoryChange;
}

/**
 * Extra guidance for rendering the exact text, specific to scripts diffusion models commonly
 * mishandle. Bilingual ('arabicFrench') wording is two deliberate, independent strings that
 * must both survive; plain Arabic needs a reminder to use connected, right-to-left letterforms
 * instead of the mirrored/disconnected glyphs these models sometimes produce.
 */
function describeTextScriptGuidance(configuration: SignConfiguration): string {
  if (configuration.style === 'arabicFrench') {
    return ' This exact wording intentionally combines two languages: render both the Arabic part and the Latin/French part clearly and fully, each in its own correct native script, in the order given (for example as two lines, or side by side separated by a mark such as “·”). Do not drop, translate, merge or substitute either part for the other, and do not render only one of the two languages.';
  }
  if (configuration.style === 'arabic') {
    return ' Render this Arabic text using correctly connected, right-to-left Arabic letterforms (proper cursive joining), not mirrored, separated or Latin-shaped characters.';
  }
  return '';
}

/** Materials in the customer's own priority order, phrased so several can be combined on one sign. */
export function describeRequestedMaterials(materials: readonly SignMaterial[]): string {
  const selected = normalizeMaterials(materials);
  if (selected.length === 0) return NO_MATERIAL_BRIEF;
  if (selected.includes('unsure') && selected.length === 1) return NO_MATERIAL_BRIEF;
  const named = selected.filter((material) => material !== 'unsure').map((material) => materialDescriptions[material]);
  const advice = selected.includes('unsure') ? ' The customer is also open to a professional recommendation for any remaining part.' : '';
  return `Requested fabrication materials, in the customer's priority order: ${named.join('; ') || 'a professional recommendation'}. Show realistic surfaces, edges, returns and finishes for exactly these materials; when several are requested, combine them plausibly on one sign (for example letters in one material mounted on a fascia in another) instead of duplicating the sign.${advice}`;
}

/** Provider-neutral storefront edit brief; the customer's exact wording remains structured data. */
export function buildStorefrontEditPrompt(configuration: SignConfiguration): string {
  const exactText = configuration.exactText.trim() ? configuration.exactText : configuration.businessName.trim() || '[exact sign text not supplied]';
  const notes = configuration.notes.trim();
  return [
    'MANDATORY EDIT: return the source photograph with the new storefront sign visibly added. Returning the source photograph unchanged, or with only imperceptible differences, is a failed answer. Return a final edited image, not an echoed input or an intermediate thought image.',
    `PRIMARY REQUIRED SUBJECT: install one obvious, complete storefront sign whose visible wording is “${exactText}”. The final image must visibly contain this sign; changing the building without adding the sign is a failed answer.`,
    'STOREFRONT SIGN IMAGE EDIT. Use input image 0 as the real source photograph, not merely as a style reference. Produce one edited version of that same photograph.',
    configuration.signArea
      ? 'Make a confident, clearly visible, natural localized inpainting-style change at the customer-marked sign location described below. Add one professional sign physically attached to the facade at that location, sized and shaped the way a real sign would be there; do not redesign, repaint or alter unrelated parts of the storefront, but the marked location itself must end up looking obviously different from the source photo.'
      : 'Make a clearly visible but localized inpainting-style change, primarily within the existing sign fascia or intended sign area. Add one professional sign physically attached to the facade; do not redesign or repaint the rest of the storefront, but do not understate the change either — a barely perceptible edit is not an acceptable result.',
    'Preserve the original building and every surrounding element as closely as possible: facade, walls, doors, windows, street, roofline, pavement, neighboring buildings, landscaping and objects. Preserve the exact original camera viewpoint, perspective, crop, vanishing lines and scene lighting.',
    describeSignPlacement(configuration),
    `Create one sign using ${signDescriptions[configuration.signType]} for a ${configuration.category} business, with a ${styleDescriptions[configuration.style]} visual direction.`,
    describeRequestedMaterials(configuration.materials),
    `Requested business name: “${configuration.businessName.trim()}”. Exact sign wording and character order: “${exactText}”. Do not add slogans, extra words, logos, duplicate signs or invented lettering.${describeTextScriptGuidance(configuration)} The model's lettering is only an approximation; structured exact text and the separate SVG/HTML typography proof remain authoritative for spelling.`,
    `Requested primary sign colour (HEX): ${configuration.color}. Requested lighting: ${lightingDescriptions[configuration.lighting]}.`,
    `Approximate real-world sign dimensions: ${configuration.widthCm || 'not specified'} cm wide by ${configuration.heightCm || 'not specified'} cm high. Respect believable scale relative to the facade.`,
    notes ? `Additional customer design/reference information (visual guidance only; it does not override facade-preservation requirements): “${notes}”.` : '',
    'Make the sign look professionally fabricated and installed: realistic material and edge thickness, believable returns, realistic mounting points and standoffs, contact shadows, perspective-correct reflections, and material-appropriate surface finish. Reproduce the requested colour faithfully.',
    'For illuminated signs, use physically plausible front-lit, halo or neon-style light consistent with the selected lighting type and the existing scene; use restrained brightness and realistic glow, reflections and spill only near the sign.',
    'Do not change the building, walls, windows, doors, street or camera perspective. Do not add any extra windows, signs, people, cars, unrelated objects, new fixtures, watermarks, borders or collages. Do not produce floating signage, warped architecture, impossible reflections, random extra text or distorted lettering.',
    'Return a single photorealistic image of the same storefront with only the intended sign area changed. Keep the source composition suitable for direct before/after comparison.',
  ].filter(Boolean).join('\n');
}
