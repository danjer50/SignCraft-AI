import type { SignConfiguration, SignMaterial } from '../../domain/sign.js';
import { normalizeMaterials } from '../../domain/sign.js';
import { buildPlacementSpecification, generateStructuredDesignSpecification } from './designSpecification';

export const SIGNCRAFT_PROMPT_VERSION = 'storefront-inpaint-v7';

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
 * Enhanced placement description that provides more precise spatial constraints.
 * The user's painted area is the PRIMARY placement constraint that the AI must follow.
 */
function describeSignPlacement(configuration: SignConfiguration): string {
  const placementSpec = buildPlacementSpecification(configuration.signArea, configuration.replaceExistingSurface);
  
  if (!placementSpec.hasPlacement) {
    return configuration.replaceExistingSurface
      ? 'The customer indicates the intended sign area currently holds something that should be fully covered or replaced (for example old signage, a shutter or security bars). Make that area clearly, visibly different from the source photo; still keep the rest of the facade untouched.'
      : '';
  }

  const bounds = placementSpec.bounds;
  if (!bounds) {
    return placementSpec.placementDescription;
  }

  // Enhanced placement description with explicit constraints
  const constraints = [
    `The user's painted area is the PRIMARY placement constraint. The sign MUST be created inside this selected area.`,
    `The sign must NOT be randomly placed somewhere else on the building.`,
    `The AI must not invent a different placement or ignore the user's selection.`,
    `The sign should use the selected area as the available physical sign region.`,
    `The sign must fit naturally inside that area, respecting the wall/building geometry.`,
    `The sign must match the perspective of the building in the photo.`,
    `The sign must match the scale of the building and the selected area.`,
    `The sign must match the orientation of the building surface.`,
    `The sign must have realistic depth appropriate for its type and materials.`,
    `The sign must have realistic mounting appropriate for the building surface and sign type.`,
    `Contact shadows must match the building's lighting and geometry.`,
    `Cast shadows must be consistent with the light direction in the scene.`,
    `Reflections must match the environment and material properties.`,
    `Ambient lighting must be consistent with the existing photo.`,
    `Everything outside the intended sign area should remain unchanged from the source photo.`,
  ];

  return `${placementSpec.placementDescription}\n\nPLACEMENT CONSTRAINTS:\n${constraints.join('\n')}`;
}

/**
 * Enhanced sign type description with more visual detail.
 */
function describeSignTypeEnhanced(configuration: SignConfiguration): string {
  const signType = configuration.signType;
  const baseDescription = signDescriptions[signType];
  
  // Add more specific details based on sign type
  const enhancements: Record<SignConfiguration['signType'], string> = {
    threeD: ' with visible thickness, precise edges, and professional fabrication quality. Letters should have consistent depth, clean returns, and realistic mounting points.',
    alucobond: ' with smooth, flat surfaces, precise panel edges, and professional flush mounting. The panel should appear as a single, continuous surface with no visible seams or gaps.',
    led: ' with visible or hidden LED elements, realistic light emission, and appropriate housing. The sign should glow with even, consistent light output.',
    lightbox: ' with even backlighting, soft glow at edges, and professional construction. The light should pass through the translucent face evenly.',
    acrylic: ' with polished edges, visible material thickness, and light refraction. The acrylic should have a glass-like, high-quality appearance.',
    channelLetters: ' with visible returns, consistent channel depth, and professional letter spacing. The channel should create natural self-shadowing.',
    vinyl: ' with precise cut edges, flat adherence to the building surface, and no visible thickness. The vinyl should follow the building contours exactly.',
    neonStyle: ' with visible tubing, realistic bend points, and bright, colorful illumination. The tubing should have a three-dimensional, glowing appearance.',
    illuminated: ' with professional light integration, even illumination, and realistic glow effects. The lighting should enhance visibility without being harsh.',
    custom: ' with unique design elements, professional construction, and attention to detail. The custom design should be clearly visible and well-executed.',
  };

  return `Create one sign using ${baseDescription} for a ${configuration.category} business${enhancements[signType] || ''}`;
}

/**
 * Enhanced style description with more visual detail.
 */
function describeStyleEnhanced(configuration: SignConfiguration): string {
  const style = configuration.style;
  const baseDescription = styleDescriptions[style];
  
  // Add more specific details based on style
  const enhancements: Record<SignConfiguration['style'], string> = {
    modern: ', featuring clean lines, geometric forms, and minimal decoration. The design should be contemporary and uncluttered.',
    luxury: ', featuring refined details, premium materials, and sophisticated execution. The design should convey quality and exclusivity.',
    minimal: ', featuring essential elements only, with maximum simplicity and minimal decoration. The design should be reduced to its purest form.',
    industrial: ', featuring functional construction, visible structural elements, and durable materials. The design should be sturdy and utilitarian.',
    bold: ', featuring strong contrasts, thick strokes, and impactful forms. The design should be highly visible and attention-grabbing.',
    elegant: ', featuring graceful proportions, delicate details, and balanced composition. The design should be sophisticated and harmonious.',
    classic: ', featuring traditional proportions, familiar forms, and timeless execution. The design should convey permanence and history.',
    colorful: ', featuring vibrant colors, high contrast, and lively composition. The design should be eye-catching and energetic.',
    dark: ', featuring subdued colors, minimal contrast, and understated execution. The design should be quiet and reserved.',
    premium: ', featuring exceptional quality, attention to detail, and professional execution. The design should convey the highest standards.',
    arabic: ', featuring connected Arabic script, proper right-to-left letterforms, and traditional calligraphy. The Arabic text must be correctly connected and oriented.',
    french: ', featuring proper French typography, accent characters, and elegant proportions. The French text must have correct accent placement.',
    arabicFrench: ', featuring both connected Arabic script and French typography in proper combination. Both languages must be clearly visible and correctly rendered.',
  };

  return `with a ${baseDescription} visual direction${enhancements[style] || ''}`;
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

/**
 * Enhanced material description with physical properties.
 */
function describeMaterialsEnhanced(materials: readonly SignMaterial[]): string {
  const selected = normalizeMaterials(materials);
  if (selected.length === 0 || (selected.length === 1 && selected[0] === 'unsure')) {
    return NO_MATERIAL_BRIEF;
  }

  const materialDetails: Record<SignMaterial, string> = {
    acrylic: ' (polished cast acrylic with glass-like clarity, high-gloss finish, visible edge thickness, and light refraction through the material)',
    aluminiumComposite: ' (aluminium composite panel with smooth surface, metallic appearance, and professional panel construction)',
    aluminium: ' (folded sheet aluminium with brushed or polished finish, visible metal characteristics, and folded edge details)',
    pvc: ' (expanded PVC foam board with smooth surface, matte finish, and visible material thickness)',
    polycarbonate: ' (translucent polycarbonate with light diffusion, smooth surface, and visible edge thickness)',
    stainlessSteel: ' (brushed or polished stainless steel with high reflectivity, metallic appearance, and professional finish)',
    galvanizedSteel: ' (painted galvanized steel with textured surface, painted finish, and visible material characteristics)',
    wood: ' (treated exterior wood with natural grain, organic texture, and visible wood characteristics)',
    vinyl: ' (applied adhesive vinyl film with flat surface, precise cut edges, and direct adherence to the building)',
    ledModules: ' (integrated LED modules with diffusing face, even light emission, and professional housing)',
    neonFlex: ' (LED neon-flex tubing with flexible construction, bright illumination, and visible tubing)',
    unsure: '',
  };

  const named = selected
    .filter((material) => material !== 'unsure')
    .map((material) => `${materialDescriptions[material]}${materialDetails[material]}`);
  
  const advice = selected.includes('unsure') 
    ? ' The customer is also open to a professional recommendation for any remaining part.'
    : '';

  return `Requested fabrication materials with physical properties, in priority order: ${named.join('; ') || 'a professional recommendation'}.${advice}`;
}

/**
 * Extra guidance for rendering the exact text, specific to scripts diffusion models commonly
 * mishandle. Bilingual ('arabicFrench') wording is two deliberate, independent strings that
 * must both survive; plain Arabic needs a reminder to use connected, right-to-left letterforms
 * instead of the mirrored/disconnected glyphs these models sometimes produce.
 */
function describeTextScriptGuidance(configuration: SignConfiguration): string {
  if (configuration.style === 'arabicFrench') {
    return ' This exact wording intentionally combines two languages: render both the Arabic part and the Latin/French part clearly and fully, each in its own correct native script, in the order given (for example as two lines, or side by side separated by a mark such as "·"). Do not drop, translate, merge or substitute either part for the other, and do not render only one of the two languages.';
  }
  if (configuration.style === 'arabic') {
    return ' Render this Arabic text using correctly connected, right-to-left Arabic letterforms (proper cursive joining), not mirrored, separated or Latin-shaped characters.';
  }
  return '';
}

/**
 * Enhanced lighting description with more detail.
 */
function describeLightingEnhanced(configuration: SignConfiguration): string {
  const lighting = configuration.lighting;
  const baseDescription = lightingDescriptions[lighting];
  
  const lightingDetails: Record<SignConfiguration['lighting'], string> = {
    none: '. The sign should be visible with ambient lighting only.',
    frontLit: '. Light should be directed onto the front surface of the sign, creating even illumination without harsh glare.',
    halo: '. Light should create a soft glow behind or around the sign, making it appear to float slightly away from the wall.',
    neon: '. Light should emit brightly from the sign elements, creating a vibrant, eye-catching glow with colored light spill.',
  };

  return `Requested lighting: ${baseDescription}${lightingDetails[lighting] || '.'}`;
}

/**
 * Provider-neutral storefront edit brief; the customer's exact wording remains structured data.
 * This enhanced version includes detailed design specifications while maintaining
 * the original prompt structure for backward compatibility.
 */
export function buildStorefrontEditPrompt(configuration: SignConfiguration): string {
  const exactText = configuration.exactText.trim() ? configuration.exactText : configuration.businessName.trim() || '[exact sign text not supplied]';
  const notes = configuration.notes.trim();
  
  // Build the enhanced prompt with detailed specifications
  return [
    // 0. Mandatory edit instruction
    'MANDATORY EDIT: return the source photograph with the new storefront sign visibly added. Returning the source photograph unchanged, or with only imperceptible differences, is a failed answer. Return a final edited image, not an echoed input or an intermediate thought image.',
    
    // 1. Primary subject requirement
    `PRIMARY REQUIRED SUBJECT: install one obvious, complete storefront sign whose visible wording is "${exactText}". The final image must visibly contain this sign; changing the building without adding the sign is a failed answer.`,
    
    // 2. Image editing task definition
    'STOREFRONT SIGN IMAGE EDIT. Use input image 0 as the real source photograph, not merely as a style reference. Produce one edited version of that same photograph.',
    
    // 3. Placement constraints (enhanced)
    configuration.signArea
      ? 'Make a confident, clearly visible, natural localized inpainting-style change at the customer-marked sign location described below. Add one professional sign physically attached to the facade at that location, sized and shaped the way a real sign would be there; do not redesign, repaint or alter unrelated parts of the storefront, but the marked location itself must end up looking obviously different from the source photo.'
      : 'Make a clearly visible but localized inpainting-style change, primarily within the existing sign fascia or intended sign area. Add one professional sign physically attached to the facade; do not redesign or repaint the rest of the storefront, but do not understate the change either — a barely perceptible edit is not an acceptable result.',
    
    // 4. Architecture preservation
    'Preserve the original building and every surrounding element as closely as possible: facade, walls, doors, windows, street, roofline, pavement, neighboring buildings, landscaping and objects. Preserve the exact original camera viewpoint, perspective, crop, vanishing lines and scene lighting.',
    
    // 5. Enhanced placement description
    describeSignPlacement(configuration),
    
    // 6. Enhanced sign type description
    describeSignTypeEnhanced(configuration),
    
    // 7. Enhanced style description
    describeStyleEnhanced(configuration),
    
    // 8. Enhanced material description
    describeMaterialsEnhanced(configuration.materials),
    
    // 9. Text and color requirements
    `Requested business name: "${configuration.businessName.trim()}". Exact sign wording and character order: "${exactText}". Do not add slogans, extra words, logos, duplicate signs or invented lettering.${describeTextScriptGuidance(configuration)} The model's lettering is only an approximation; structured exact text and the separate SVG/HTML typography proof remain authoritative for spelling.`,
    
    // 10. Enhanced lighting description
    describeLightingEnhanced(configuration),
    
    // 11. Color specification
    `Requested primary sign colour (HEX): ${configuration.color}.`,
    
    // 12. Dimensions
    `Approximate real-world sign dimensions: ${configuration.widthCm || 'not specified'} cm wide by ${configuration.heightCm || 'not specified'} cm high. Respect believable scale relative to the facade.`,
    
    // 13. Additional notes
    notes ? `Additional customer design/reference information (visual guidance only; it does not override facade-preservation requirements): "${notes}".` : '',
    
    // 14. Realism requirements (enhanced)
    'Make the sign look professionally fabricated and installed: realistic material and edge thickness, believable returns, realistic mounting points and standoffs, contact shadows, perspective-correct reflections, and material-appropriate surface finish. Reproduce the requested colour faithfully. The sign must have realistic depth, thickness, and three-dimensional form appropriate for the selected sign type and materials.',
    
    // 15. Lighting requirements
    'For illuminated signs, use physically plausible front-lit, halo or neon-style light consistent with the selected lighting type and the existing scene; use restrained brightness and realistic glow, reflections and spill only near the sign.',
    
    // 16. Prohibited changes
    'Do not change the building, walls, windows, doors, street or camera perspective. Do not add any extra windows, signs, people, cars, unrelated objects, new fixtures, watermarks, borders or collages. Do not produce floating signage, warped architecture, impossible reflections, random extra text or distorted lettering.',
    
    // 17. Final output requirement
    'Return a single photorealistic image of the same storefront with only the intended sign area changed. Keep the source composition suitable for direct before/after comparison. The sign must appear as a real, physical object installed on the building, not a flat graphic pasted onto the image.',
    
    // 18. Critical success criteria
    'CRITICAL SUCCESS CRITERIA: The sign MUST appear in the user-selected location. The sign MUST match the selected style characteristics. The sign MUST look like it is made from the selected materials. The sign text MUST be correct and clearly legible. The sign MUST have realistic depth, mounting, and integration with the building. The rest of the storefront MUST remain essentially unchanged. Failure to meet any of these criteria means the generation has failed, even if an image is produced.',
    
  ].filter(Boolean).join('\n');
}

/**
 * Generate a debug version of the prompt that includes the structured design specification.
 * This is useful for testing and understanding what information is being sent to the AI.
 */
export function buildDebugPromptWithSpecification(configuration: SignConfiguration): string {
  const structuredSpec = generateStructuredDesignSpecification(configuration);
  const mainPrompt = buildStorefrontEditPrompt(configuration);
  
  return `${mainPrompt}\n\n=== DEBUG: STRUCTURED DESIGN SPECIFICATION ===\n${structuredSpec}`;
}
