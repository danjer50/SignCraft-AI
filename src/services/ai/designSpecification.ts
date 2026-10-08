import type { SignConfiguration, SignMaterial, SignStyle, SignType, LightingType, BusinessCategory, SignAreaBounds } from '../../domain/sign';

/**
 * Structured design specifications that provide detailed, AI-ready descriptions
 * for each design choice. These go beyond simple labels to give the AI model
 * concrete visual guidance.
 */

// ============================================================================
// SIGN TYPE SPECIFICATIONS
// ============================================================================

interface SignTypeSpecification {
  name: string;
  description: string;
  construction: string;
  typography: string;
  dimensionality: string;
  depth: string;
  mounting: string;
  illumination: string;
  shadows: string;
  realism: string;
}

const SIGN_TYPE_SPECIFICATIONS: Record<SignType, SignTypeSpecification> = {
  threeD: {
    name: '3D Letters',
    description: 'Three-dimensional raised lettering sign',
    construction: 'Individual letters fabricated from solid material with depth, mounted on standoffs or directly to the facade',
    typography: 'Bold, block letters with clean lines, designed for maximum legibility at a distance',
    dimensionality: 'Fully three-dimensional with front face, sides (returns), and back surface',
    depth: 'Typically 3-10cm deep depending on letter height, with consistent depth across all characters',
    mounting: 'Individual letter mounting with hidden fixings, spacing between letters maintained precisely',
    illumination: 'Optional individual letter illumination or external lighting',
    shadows: 'Strong contact shadows where letters meet the wall, subtle self-shadowing on letter sides',
    realism: 'Highly realistic with visible material thickness, precise edges, and professional fabrication quality',
  },
  alucobond: {
    name: 'Alucobond Panel',
    description: 'Aluminium composite panel fascia sign',
    construction: 'Flat panel sign made from aluminium composite material (two thin aluminium sheets bonded to a plastic core)',
    typography: 'Flat cut-out letters or printed graphics on a flat panel surface',
    dimensionality: 'Flat two-dimensional sign with minimal depth',
    depth: 'Typically 3-6mm panel thickness, appears flat when mounted',
    mounting: 'Panel mounted flush to facade with hidden fixings around the edges',
    illumination: 'Optional backlit halo effect or front illumination',
    shadows: 'Subtle edge shadow where panel meets wall, minimal self-shadowing',
    realism: 'Clean, modern appearance with smooth surfaces, precise panel edges, and professional installation',
  },
  led: {
    name: 'LED Sign',
    description: 'Integrated LED illuminated sign',
    construction: 'Sign with integrated LED modules or strips, designed for illumination',
    typography: 'Letters designed with LED placement in mind, may have cut-outs or channels for light',
    dimensionality: 'Can be 2D or 3D depending on construction, with LED elements adding depth',
    depth: 'Variable depending on LED module placement, typically 5-15cm for housing',
    mounting: 'Mounted with consideration for heat dissipation and electrical access',
    illumination: 'Bright, even LED illumination with consistent color temperature, visible light source or diffused',
    shadows: 'Glow effects on surrounding surfaces, light spill on adjacent areas',
    realism: 'Professional LED integration with realistic light behavior, visible LED modules or diffused lighting',
  },
  lightbox: {
    name: 'Lightbox',
    description: 'Internally illuminated lightbox sign',
    construction: 'Translucent face with internal light source, creating a backlit effect',
    typography: 'Printed or cut-out graphics on translucent material, designed for backlighting',
    dimensionality: 'Flat front surface with depth for light housing',
    depth: 'Typically 5-15cm deep to accommodate light source',
    mounting: 'Mounted slightly away from wall to allow light to wrap around edges',
    illumination: 'Even backlighting across the entire sign face, soft glow at edges',
    shadows: 'Soft halo effect around the sign perimeter, even illumination on the sign face',
    realism: 'Professional lightbox construction with even lighting, visible frame or border, and realistic glow',
  },
  acrylic: {
    name: 'Acrylic Letters',
    description: 'Polished cut acrylic lettering',
    construction: 'Individual letters cut from solid acrylic with polished edges',
    typography: 'Clean, modern typography with crisp edges, acrylic thickness visible at letter edges',
    dimensionality: 'Three-dimensional with visible edge thickness',
    depth: 'Typically 1-3cm thick acrylic, with polished edges showing depth',
    mounting: 'Individual letter mounting with standoffs or directly to facade',
    illumination: 'Optional edge lighting or backlighting through translucent acrylic',
    shadows: 'Contact shadows where letters meet the wall, edge reflections from polished surfaces',
    realism: 'Highly polished acrylic appearance with visible edge thickness, light refraction through material',
  },
  channelLetters: {
    name: 'Channel Letters',
    description: 'Fabricated three-dimensional channel letters',
    construction: 'Letters with a channel or return on the sides, creating a U-shaped cross-section',
    typography: 'Bold, readable typography with consistent channel depth around each letter',
    dimensionality: 'Fully three-dimensional with front face, side returns, and back surface',
    depth: 'Typically 8-15cm deep with consistent channel depth',
    mounting: 'Individual letter mounting with returns facing the wall, creating a floating appearance',
    illumination: 'Optional internal illumination through the channel or external lighting',
    shadows: 'Strong shadows within the channel, contact shadows on the wall, self-shadowing on letter faces',
    realism: 'Professional channel letter fabrication with visible returns, precise edges, and consistent depth',
  },
  vinyl: {
    name: 'Vinyl Lettering',
    description: 'Adhesive vinyl lettering applied directly to surface',
    construction: 'Flat vinyl film cut to shape and applied directly to the building surface',
    typography: 'Any typography style, limited only by vinyl cutting capabilities',
    dimensionality: 'Completely flat, adhering directly to the building surface',
    depth: 'Minimal thickness, typically less than 1mm, appears as flat graphics on the wall',
    mounting: 'Directly applied to clean, smooth surfaces with adhesive backing',
    illumination: 'No built-in illumination, relies on ambient or external lighting',
    shadows: 'Minimal to no self-shadowing, follows the contours of the building surface',
    realism: 'Flat appearance with visible vinyl edges if not perfectly applied, follows building surface texture',
  },
  neonStyle: {
    name: 'Neon Style',
    description: 'Neon-style LED tubing sign',
    construction: 'Flexible LED tubing bent to form letters and shapes, mimicking traditional neon',
    typography: 'Continuous line typography designed for tubing, with rounded corners and connections',
    dimensionality: 'Tubular three-dimensional appearance with visible tube cross-section',
    depth: 'Tubing typically 1-2cm in diameter, with mounting standoffs adding additional depth',
    mounting: 'Mounted with standoffs away from wall, creating a floating tube effect',
    illumination: 'Bright, colorful LED illumination with neon-like glow and color',
    shadows: 'Multiple shadow layers from the tubing, glow on surrounding surfaces, light reflections',
    realism: 'Visible LED tubing with realistic bend points, mounting brackets, and electrical connections',
  },
  illuminated: {
    name: 'Illuminated Sign',
    description: 'Professionally illuminated facade sign',
    construction: 'Sign with professional illumination system, either internal or external',
    typography: 'Designed for visibility with illumination, may have enhanced contrast for night viewing',
    dimensionality: 'Can be 2D or 3D depending on the specific illuminated sign type',
    depth: 'Variable depending on illumination method, typically includes housing for light sources',
    mounting: 'Professional mounting with consideration for electrical access and heat dissipation',
    illumination: 'Professional, even illumination with appropriate brightness and color temperature',
    shadows: 'Light spill on surrounding areas, glow effects, realistic illumination behavior',
    realism: 'High-quality professional installation with visible but unobtrusive lighting components',
  },
  custom: {
    name: 'Custom Fabricated Sign',
    description: 'Custom-fabricated storefront sign with unique design',
    construction: 'Bespoke sign construction tailored to specific requirements and design vision',
    typography: 'Custom typography designed for the specific application',
    dimensionality: 'Variable based on custom design, can include multiple materials and construction techniques',
    depth: 'Variable based on custom design requirements',
    mounting: 'Custom mounting solution designed for the specific installation',
    illumination: 'Custom illumination designed for the specific sign and location',
    shadows: 'Realistic shadows based on custom design and mounting',
    realism: 'Professional custom fabrication with attention to detail and quality finish',
  },
};

// ============================================================================
// STYLE SPECIFICATIONS
// ============================================================================

interface StyleSpecification {
  name: string;
  description: string;
  visualCharacter: string;
  typography: string;
  letterShape: string;
  dimensionality: string;
  depth: string;
  edgeTreatment: string;
  finish: string;
  mountingStyle: string;
  lightingBehavior: string;
  shadows: string;
  realism: string;
}

const STYLE_SPECIFICATIONS: Record<SignStyle, StyleSpecification> = {
  modern: {
    name: 'Modern',
    description: 'Clean, contemporary design aesthetic',
    visualCharacter: 'Minimalist, uncluttered, with clean lines and geometric forms',
    typography: 'Sans-serif fonts with geometric construction, consistent stroke weights, modern proportions',
    letterShape: 'Clean, geometric letterforms without decorative elements',
    dimensionality: 'Flat or subtle 3D with clean edges',
    depth: 'Minimal to moderate depth, emphasizing clean lines over thickness',
    edgeTreatment: 'Sharp, precise edges with minimal decoration',
    finish: 'Smooth, matte or satin finishes, avoiding excessive gloss',
    mountingStyle: 'Hidden or minimal mounting hardware, clean installation',
    lightingBehavior: 'Subtle, even illumination without harsh shadows or glare',
    shadows: 'Soft, natural shadows that emphasize form without being distracting',
    realism: 'Professional, understated appearance with emphasis on clean execution',
  },
  luxury: {
    name: 'Luxury',
    description: 'Refined, high-end aesthetic',
    visualCharacter: 'Elegant, sophisticated, with premium materials and fine details',
    typography: 'Serif or custom fonts with refined proportions, delicate details, and balanced spacing',
    letterShape: 'Elegant letterforms with subtle decorative elements and refined proportions',
    dimensionality: 'Subtle to pronounced 3D with attention to detail',
    depth: 'Moderate depth with fine details and layered construction',
    edgeTreatment: 'Polished or brushed finishes with precise, clean edges',
    finish: 'High-quality finishes with consistent texture, may include metallic or premium surfaces',
    mountingStyle: 'Discreet, high-quality mounting with attention to detail',
    lightingBehavior: 'Warm, inviting illumination with subtle highlights on premium materials',
    shadows: 'Soft, layered shadows that enhance the sense of depth and quality',
    realism: 'Exceptional craftsmanship with visible attention to detail and premium materials',
  },
  minimal: {
    name: 'Minimal',
    description: 'Restrained, understated design',
    visualCharacter: 'Reduced to essential elements, with maximum simplicity and minimal decoration',
    typography: 'Simple, clean fonts with minimal stroke variation, generous spacing',
    letterShape: 'Basic geometric forms without decorative elements',
    dimensionality: 'Flat or very subtle 3D, emphasizing simplicity',
    depth: 'Minimal depth, often appearing almost flat',
    edgeTreatment: 'Clean, unadorned edges with no additional treatment',
    finish: 'Matte or unpolished finishes that minimize reflections',
    mountingStyle: 'Minimal or hidden mounting, emphasizing the sign itself over the hardware',
    lightingBehavior: 'Subtle, understated lighting that doesn\'t draw attention to itself',
    shadows: 'Minimal shadows, with clean, simple forms',
    realism: 'Simple, honest construction with no unnecessary elements or decorations',
  },
  industrial: {
    name: 'Industrial',
    description: 'Architectural, utilitarian design',
    visualCharacter: 'Functional, sturdy, with an emphasis on durability and structural honesty',
    typography: 'Bold, sans-serif fonts with mechanical construction, consistent stroke weights',
    letterShape: 'Strong, angular letterforms with industrial precision',
    dimensionality: 'Pronounced 3D with visible construction details',
    depth: 'Moderate to significant depth with visible structural elements',
    edgeTreatment: 'Raw or minimally finished edges, visible material thickness',
    finish: 'Natural material finishes, may show texture or patina',
    mountingStyle: 'Visible, sturdy mounting with industrial hardware',
    lightingBehavior: 'Practical, functional illumination without decorative effects',
    shadows: 'Strong, angular shadows that emphasize the industrial character',
    realism: 'Honest, functional construction with visible structural elements and durable materials',
  },
  bold: {
    name: 'Bold',
    description: 'Strong, impactful design',
    visualCharacter: 'High contrast, strong presence, designed for maximum visibility and impact',
    typography: 'Bold, heavy fonts with thick strokes, condensed proportions for impact',
    letterShape: 'Strong, bold letterforms with maximum legibility',
    dimensionality: 'Pronounced 3D with bold, thick forms',
    depth: 'Significant depth with bold, substantial construction',
    edgeTreatment: 'Clean, bold edges that emphasize the form',
    finish: 'High-contrast finishes, may include glossy or reflective surfaces for impact',
    mountingStyle: 'Substantial mounting that supports the bold character',
    lightingBehavior: 'Strong, high-contrast lighting that enhances visibility',
    shadows: 'Deep, strong shadows that emphasize the bold, three-dimensional form',
    realism: 'Substantial, impactful construction with bold, confident execution',
  },
  elegant: {
    name: 'Elegant',
    description: 'Graceful, refined design',
    visualCharacter: 'Balanced, harmonious, with careful attention to proportions and details',
    typography: 'Serif or custom fonts with elegant proportions, delicate details, and refined spacing',
    letterShape: 'Graceful letterforms with subtle decorative elements and balanced proportions',
    dimensionality: 'Subtle to moderate 3D with elegant, refined forms',
    depth: 'Moderate depth with elegant, flowing construction',
    edgeTreatment: 'Refined, precise edges with subtle decorative elements',
    finish: 'High-quality finishes with subtle texture or pattern',
    mountingStyle: 'Elegant, discreet mounting that complements the design',
    lightingBehavior: 'Soft, warm lighting with subtle highlights and gentle shadows',
    shadows: 'Soft, elegant shadows that enhance the sense of grace and refinement',
    realism: 'Refined craftsmanship with attention to elegant details and balanced proportions',
  },
  classic: {
    name: 'Classic',
    description: 'Timeless, traditional design',
    visualCharacter: 'Traditional, enduring, with classic proportions and familiar forms',
    typography: 'Serif fonts with classic proportions, traditional details, and familiar letterforms',
    letterShape: 'Traditional letterforms with classic serifs and familiar construction',
    dimensionality: 'Moderate 3D with classic, familiar forms',
    depth: 'Moderate depth with classic, traditional construction techniques',
    edgeTreatment: 'Traditional edge treatments with familiar decorative elements',
    finish: 'Classic finishes that may show age or patina appropriately',
    mountingStyle: 'Traditional mounting methods with visible, familiar hardware',
    lightingBehavior: 'Warm, traditional lighting with classic illumination patterns',
    shadows: 'Natural, traditional shadows that create a sense of permanence and history',
    realism: 'Traditional craftsmanship with familiar techniques and timeless quality',
  },
  colorful: {
    name: 'Colorful',
    description: 'Vibrant, multicolored design',
    visualCharacter: 'Bright, lively, with multiple colors and vibrant contrasts',
    typography: 'Any font style, with emphasis on color variety and contrast',
    letterShape: 'Colorful letterforms with multiple colors or gradients',
    dimensionality: 'Variable, often with color used to create the illusion of depth',
    depth: 'Variable, may use color and contrast to create depth perception',
    edgeTreatment: 'Clean edges that allow colors to stand out clearly',
    finish: 'Glossy or satin finishes that enhance color vibrancy',
    mountingStyle: 'Mounting that allows colors to be visible and impactful',
    lightingBehavior: 'Bright, colorful lighting that enhances the multicolored design',
    shadows: 'Colorful shadows or reflections that complement the vibrant palette',
    realism: 'Vibrant, multicolored construction with careful attention to color harmony and contrast',
  },
  dark: {
    name: 'Dark',
    description: 'Understated, muted design',
    visualCharacter: 'Subdued, quiet, with dark colors and minimal contrast',
    typography: 'Any font style, typically in dark colors with subtle contrast',
    letterShape: 'Subtle letterforms that don\'t draw excessive attention',
    dimensionality: 'Subtle to moderate 3D with dark, understated forms',
    depth: 'Moderate depth with dark, muted materials',
    edgeTreatment: 'Matte or dark finishes that minimize reflections and highlights',
    finish: 'Dark, muted finishes with minimal reflections',
    mountingStyle: 'Discreet, dark mounting hardware that blends with the design',
    lightingBehavior: 'Subtle, understated lighting that doesn\'t create harsh contrasts',
    shadows: 'Soft, dark shadows that blend with the overall muted appearance',
    realism: 'Understated, quiet construction with dark materials and subtle execution',
  },
  premium: {
    name: 'Premium',
    description: 'High-quality, luxurious design',
    visualCharacter: 'Exceptional quality, with premium materials and flawless execution',
    typography: 'Custom or premium fonts with perfect proportions and exceptional detail',
    letterShape: 'Premium letterforms with exceptional craftsmanship and attention to detail',
    dimensionality: 'Subtle to pronounced 3D with premium materials and construction',
    depth: 'Moderate to significant depth with premium materials and layered construction',
    edgeTreatment: 'Perfectly finished edges with premium materials and flawless execution',
    finish: 'Premium finishes with exceptional quality, may include rare or luxury materials',
    mountingStyle: 'Premium mounting with exceptional quality and attention to detail',
    lightingBehavior: 'Perfect, even illumination with premium lighting equipment',
    shadows: 'Subtle, premium shadows that enhance the sense of exceptional quality',
    realism: 'Exceptional craftsmanship with premium materials, flawless execution, and attention to every detail',
  },
  arabic: {
    name: 'Arabic Script',
    description: 'Designed for Arabic typography',
    visualCharacter: 'Flowing, connected Arabic script with traditional calligraphic elements',
    typography: 'Arabic script fonts with connected, flowing letterforms and traditional calligraphy',
    letterShape: 'Connected, right-to-left Arabic letterforms with traditional calligraphic strokes',
    dimensionality: 'Often flat or subtle 3D to preserve the flow of the script',
    depth: 'Minimal to moderate depth, with emphasis on preserving the script flow',
    edgeTreatment: 'Clean edges that don\'t disrupt the flow of the Arabic script',
    finish: 'Smooth finishes that allow the Arabic script to be clearly visible',
    mountingStyle: 'Mounting that accommodates the right-to-left flow of Arabic script',
    lightingBehavior: 'Even, clear lighting that ensures the Arabic script is fully legible',
    shadows: 'Soft shadows that don\'t disrupt the readability of the connected script',
    realism: 'Authentic Arabic calligraphy with proper letter connections and traditional execution',
  },
  french: {
    name: 'French Typography',
    description: 'Designed for French language typography',
    visualCharacter: 'Elegant, French-inspired design with attention to accent characters and French typographic traditions',
    typography: 'French-inspired fonts with proper accent characters, elegant proportions, and French typographic conventions',
    letterShape: 'French letterforms with proper accent placement and traditional French typography',
    dimensionality: 'Variable, often with elegant, French-inspired forms',
    depth: 'Moderate depth with elegant, French-inspired construction',
    edgeTreatment: 'Clean, elegant edges that complement French typography',
    finish: 'Elegant finishes that complement French-inspired design',
    mountingStyle: 'Elegant mounting that complements French design traditions',
    lightingBehavior: 'Soft, elegant lighting that enhances French typography',
    shadows: 'Soft, elegant shadows that complement French design aesthetics',
    realism: 'Authentic French typography with proper accent characters and traditional French design elements',
  },
  arabicFrench: {
    name: 'Arabic and French Bilingual',
    description: 'Balanced for Arabic and French bilingual typography',
    visualCharacter: 'Harmonious combination of Arabic script and French typography, balanced and respectful to both languages',
    typography: 'Combines Arabic script and French typography with proper proportions and spacing for both languages',
    letterShape: 'Both connected Arabic script and French letterforms with proper character shapes for each language',
    dimensionality: 'Variable, designed to accommodate both right-to-left and left-to-right scripts',
    depth: 'Moderate depth that works for both Arabic and French typography',
    edgeTreatment: 'Clean edges that work for both scripts without favoring one over the other',
    finish: 'Neutral finishes that complement both Arabic and French typography',
    mountingStyle: 'Balanced mounting that accommodates both languages appropriately',
    lightingBehavior: 'Even, clear lighting that ensures both Arabic and French text are fully legible',
    shadows: 'Neutral shadows that don\'t disrupt the readability of either script',
    realism: 'Authentic bilingual execution with proper Arabic connections and French accent characters',
  },
};

// ============================================================================
// MATERIAL SPECIFICATIONS
// ============================================================================

interface MaterialSpecification {
  name: string;
  description: string;
  surfaceAppearance: string;
  texture: string;
  glossFinish: string;
  reflectivity: string;
  metallicBehavior: string;
  transparency: string;
  thickness: string;
  edges: string;
  depth: string;
  physicalConstruction: string;
  mounting: string;
  realisticLightResponse: string;
  shadowsReflections: string;
}

const MATERIAL_SPECIFICATIONS: Record<SignMaterial, MaterialSpecification> = {
  acrylic: {
    name: 'Acrylic',
    description: 'Polished cast acrylic (plexiglass)',
    surfaceAppearance: 'Smooth, glossy surface with high clarity and depth',
    texture: 'Completely smooth, glass-like texture with no visible grain',
    glossFinish: 'High-gloss, reflective finish that mirrors surroundings',
    reflectivity: 'Highly reflective, creates clear reflections of environment and light sources',
    metallicBehavior: 'Non-metallic, transparent/translucent with light refraction',
    transparency: 'Can be transparent, translucent, or opaque depending on type and color',
    thickness: 'Typically 3-20mm thick, with visible edge thickness when viewed from the side',
    edges: 'Polished edges that are crystal-clear and smooth, may show color and depth',
    depth: 'Visible material thickness at edges, with light passing through translucent varieties',
    physicalConstruction: 'Solid cast acrylic sheets, cut to shape with precision tools',
    mounting: 'Mounted with clear or colored standoffs, may have visible mounting points',
    realisticLightResponse: 'Light passes through translucent acrylic, creating glow effects; opaque acrylic reflects light with high clarity',
    shadowsReflections: 'Sharp, clear reflections on glossy surfaces; soft shadows from edges; light refraction through transparent edges',
  },
  aluminiumComposite: {
    name: 'Aluminium Composite',
    description: 'Aluminium composite panel (Alucobond/Dibond)',
    surfaceAppearance: 'Smooth, flat panel with consistent color and finish',
    texture: 'Smooth, uniform texture with no visible grain or imperfections',
    glossFinish: 'Matte, satin, or gloss finish depending on the specific product',
    reflectivity: 'Moderate reflectivity, creates soft reflections without being mirror-like',
    metallicBehavior: 'Aluminium surface with metallic appearance, may show brushed metal texture',
    transparency: 'Completely opaque, no light passes through',
    thickness: 'Typically 3-6mm thick, with aluminium sheets on both sides of a plastic core',
    edges: 'Clean, straight edges with visible layering when cut (aluminium-plastic-aluminium)',
    depth: 'Minimal visible depth, appears as a flat panel when mounted',
    physicalConstruction: 'Two thin aluminium sheets bonded to a plastic core, creating a lightweight, rigid panel',
    mounting: 'Panel mounted flush to facade with hidden fixings around the edges',
    realisticLightResponse: 'Reflects light with a metallic sheen, color remains consistent under different lighting conditions',
    shadowsReflections: 'Soft, even reflections on the aluminium surface; minimal self-shadowing due to flat construction',
  },
  aluminium: {
    name: 'Aluminium',
    description: 'Folded sheet aluminium',
    surfaceAppearance: 'Smooth or brushed aluminium surface with metallic appearance',
    texture: 'Brushed or polished texture, may show visible metal grain or polishing lines',
    glossFinish: 'Brushed matte, satin, or polished high-gloss finish',
    reflectivity: 'High reflectivity, especially when polished, creates mirror-like reflections',
    metallicBehavior: 'Clearly metallic, with visible aluminium characteristics and oxidation patterns',
    transparency: 'Completely opaque, no light passes through',
    thickness: 'Typically 1-6mm thick, with visible material thickness at folded edges',
    edges: 'Folded edges with visible bend lines, may show the reverse side color',
    depth: 'Visible depth at folded edges and returns, creating a three-dimensional appearance',
    physicalConstruction: 'Solid aluminium sheets, folded and formed into the desired shape',
    mounting: 'Mounted with aluminium-compatible hardware, may have visible folding and seams',
    realisticLightResponse: 'Highly reflective metallic surface that mirrors the environment, especially when polished',
    shadowsReflections: 'Sharp, clear reflections on polished surfaces; soft shadows from folded edges; metallic sheen visible from all angles',
  },
  pvc: {
    name: 'PVC',
    description: 'Expanded PVC foam board',
    surfaceAppearance: 'Smooth, matte surface with uniform color',
    texture: 'Smooth, slightly porous texture that can be painted or printed on',
    glossFinish: 'Typically matte or satin finish, can be painted to any gloss level',
    reflectivity: 'Low to moderate reflectivity, depending on paint or finish',
    metallicBehavior: 'Non-metallic, plastic appearance with no metallic characteristics',
    transparency: 'Completely opaque, no light passes through',
    thickness: 'Typically 3-20mm thick, with visible material thickness at edges',
    edges: 'Clean, straight edges that may show the cellular structure of the foam when cut',
    depth: 'Visible material thickness, especially at routed or cut edges',
    physicalConstruction: 'Expanded PVC foam board, lightweight and easy to work with',
    mounting: 'Mounted with screws, adhesive, or standoffs appropriate for PVC material',
    realisticLightResponse: 'Absorbs and diffuses light softly, painted surfaces reflect light according to paint finish',
    shadowsReflections: 'Soft, diffused reflections on painted surfaces; soft shadows from edges; plastic appearance with subtle texture',
  },
  polycarbonate: {
    name: 'Polycarbonate',
    description: 'Translucent polycarbonate',
    surfaceAppearance: 'Smooth, slightly textured surface with translucent appearance',
    texture: 'Smooth texture with slight surface pattern for diffusion',
    glossFinish: 'Glossy or matte finish, often with a slight haze for diffusion',
    reflectivity: 'Moderate reflectivity with light diffusion, creates soft, scattered reflections',
    metallicBehavior: 'Non-metallic, plastic appearance with light transmission characteristics',
    transparency: 'Translucent, allows light to pass through while diffusing it evenly',
    thickness: 'Typically 2-10mm thick, with visible edge thickness',
    edges: 'Clean edges that may show slight translucency and color at the edges',
    depth: 'Visible material thickness, with light passing through translucent edges',
    physicalConstruction: 'Solid polycarbonate sheets, often used for illuminated signs',
    mounting: 'Mounted with consideration for light transmission, often in frames or housings',
    realisticLightResponse: 'Transmits and diffuses light evenly, creating a soft glow effect when backlit',
    shadowsReflections: 'Soft, diffused reflections; glow effects from transmitted light; soft shadows from edges',
  },
  stainlessSteel: {
    name: 'Stainless Steel',
    description: 'Brushed or polished stainless steel',
    surfaceAppearance: 'Smooth, metallic surface with stainless steel characteristics',
    texture: 'Brushed or polished texture, may show visible brushing lines or polishing marks',
    glossFinish: 'Brushed matte, satin, or mirror-polished high-gloss finish',
    reflectivity: 'Very high reflectivity, especially when polished, creates mirror-like reflections',
    metallicBehavior: 'Clearly metallic with stainless steel appearance, resistant to corrosion and oxidation',
    transparency: 'Completely opaque, no light passes through',
    thickness: 'Typically 1-6mm thick, with visible material thickness at edges',
    edges: 'Sharp, clean edges with visible metal thickness, may show polishing or brushing at edges',
    depth: 'Visible depth at edges and returns, with metallic reflections visible',
    physicalConstruction: 'Solid stainless steel sheets, fabricated and formed into the desired shape',
    mounting: 'Mounted with stainless steel-compatible hardware, may have visible welding or joining',
    realisticLightResponse: 'Highly reflective metallic surface that creates clear, sharp reflections of the environment',
    shadowsReflections: 'Sharp, mirror-like reflections on polished surfaces; brushed surfaces show directional reflections; strong metallic appearance from all angles',
  },
  galvanizedSteel: {
    name: 'Galvanized Steel',
    description: 'Painted galvanized steel',
    surfaceAppearance: 'Textured galvanized surface, typically painted with a colored finish',
    texture: 'Visible galvanized texture with paint applied over it, may show slight surface irregularities',
    glossFinish: 'Matte, satin, or gloss finish depending on the paint applied',
    reflectivity: 'Low to moderate reflectivity depending on paint finish, galvanized layer may show through in places',
    metallicBehavior: 'Metallic base with painted finish, may show galvanized characteristics at edges or scratches',
    transparency: 'Completely opaque, no light passes through',
    thickness: 'Typically 1-3mm thick for sign applications, with visible material thickness',
    edges: 'Edges may show the galvanized layer and paint, with possible rough or cut edges',
    depth: 'Visible material thickness, with paint and galvanized layers visible at edges',
    physicalConstruction: 'Galvanized steel sheets, painted and fabricated into the desired shape',
    mounting: 'Mounted with steel-compatible hardware, may show weathering or age appropriate for outdoor use',
    realisticLightResponse: 'Painted surface reflects light according to paint finish, galvanized layer may create subtle metallic reflections',
    shadowsReflections: 'Soft reflections according to paint finish; galvanized layer may create subtle metallic highlights; weathered appearance appropriate for outdoor use',
  },
  wood: {
    name: 'Wood',
    description: 'Treated exterior wood',
    surfaceAppearance: 'Natural wood grain and texture, with visible growth rings and wood characteristics',
    texture: 'Visible wood grain, may be smooth or slightly rough depending on finish',
    glossFinish: 'Matte, satin, or gloss finish depending on staining and sealing',
    reflectivity: 'Low to moderate reflectivity depending on finish, natural wood characteristics visible',
    metallicBehavior: 'Non-metallic, natural wood appearance with organic characteristics',
    transparency: 'Completely opaque, no light passes through',
    thickness: 'Typically 10-50mm thick for exterior applications, with visible wood grain at edges',
    edges: 'Natural wood edges showing growth rings and grain, may be routed or cut to shape',
    depth: 'Visible wood thickness with natural grain and texture visible at all edges',
    physicalConstruction: 'Solid wood panels or carved elements, treated for exterior durability',
    mounting: 'Mounted with wood-compatible hardware, may show natural wood characteristics and aging',
    realisticLightResponse: 'Natural wood surface absorbs and reflects light softly, with grain pattern visible under different lighting conditions',
    shadowsReflections: 'Soft, natural reflections on sealed surfaces; wood grain visible in shadows; natural, organic appearance',
  },
  vinyl: {
    name: 'Vinyl',
    description: 'Applied adhesive vinyl film',
    surfaceAppearance: 'Flat, smooth surface that adheres directly to the building',
    texture: 'Smooth, uniform texture with no visible thickness or depth',
    glossFinish: 'Gloss, matte, or satin finish depending on the specific vinyl product',
    reflectivity: 'Low to high reflectivity depending on vinyl finish, typically matte for most applications',
    metallicBehavior: 'Non-metallic, plastic appearance with vinyl characteristics',
    transparency: 'Completely opaque for most applications, can be translucent for window graphics',
    thickness: 'Very thin, typically less than 1mm, appears as a flat graphic on the surface',
    edges: 'Precision-cut edges that follow the design exactly, may show slight vinyl thickness at edges',
    depth: 'Minimal to no visible depth, adheres directly to the building surface',
    physicalConstruction: 'Adhesive vinyl film, cut to shape and applied directly to clean surfaces',
    mounting: 'Directly applied to building surface with adhesive backing, no separate mounting hardware',
    realisticLightResponse: 'Flat surface reflects light according to vinyl finish, adheres directly to building texture',
    shadowsReflections: 'Minimal self-shadowing, follows the contours of the building surface; clean, precise edges visible against the building',
  },
  ledModules: {
    name: 'LED Modules',
    description: 'Integrated LED modules with a diffusing face',
    surfaceAppearance: 'Uniform, diffused light surface with LED modules visible or hidden behind diffuser',
    texture: 'Smooth diffuser surface or visible LED module pattern, depending on the design',
    glossFinish: 'Matte or slightly textured finish for light diffusion',
    reflectivity: 'Low reflectivity, designed to transmit rather than reflect light',
    metallicBehavior: 'Non-metallic, electronic appearance with LED characteristics',
    transparency: 'Translucent diffuser allows light to pass through, LED modules may be visible or hidden',
    thickness: 'Variable depending on LED module size and housing, typically 2-10cm for complete assembly',
    edges: 'Clean edges with visible LED module housing or diffuser frame',
    depth: 'Visible depth from LED modules and housing, with light-emitting surfaces',
    physicalConstruction: 'LED modules arranged in a grid or pattern, with diffuser face and housing',
    mounting: 'Mounted with consideration for electrical access and heat dissipation, may have visible housing or frame',
    realisticLightResponse: 'Emits bright, even light from the LED modules, diffuser creates even light distribution',
    shadowsReflections: 'Bright light emission from the sign face; glow effects on surrounding surfaces; LED module pattern may be visible when off',
  },
  neonFlex: {
    name: 'Neon Flex',
    description: 'LED neon-flex tubing',
    surfaceAppearance: 'Flexible tubing with visible or hidden LED elements, creating a neon-like appearance',
    texture: 'Smooth, flexible tubing with consistent diameter',
    glossFinish: 'Glossy or matte tubing finish, typically with a colored appearance',
    reflectivity: 'Moderate reflectivity with colored light emission, tubing surface may reflect environment',
    metallicBehavior: 'Non-metallic, plastic tubing appearance with LED characteristics',
    transparency: 'Translucent tubing allows LED light to pass through, creating the neon effect',
    thickness: 'Tubing typically 8-15mm in diameter, with visible tubing thickness',
    edges: 'Rounded tubing edges with visible bend points and connections',
    depth: 'Visible tubing diameter with LED light passing through, creating a three-dimensional line',
    physicalConstruction: 'Flexible LED tubing, bent to form letters and shapes, with electrical connections',
    mounting: 'Mounted with standoffs or directly to surface, with visible tubing and mounting points',
    realisticLightResponse: 'Emits bright, colored light from the LED elements within the tubing, creating a neon-like glow',
    shadowsReflections: 'Multiple shadow layers from the tubing; colored glow on surrounding surfaces; tubing reflections visible',
  },
  unsure: {
    name: 'Professional Recommendation',
    description: 'A professionally appropriate material chosen by the sign maker',
    surfaceAppearance: 'Professional appearance appropriate for the specific application and environment',
    texture: 'Appropriate texture for the chosen material and application',
    glossFinish: 'Appropriate finish for the chosen material and design',
    reflectivity: 'Appropriate reflectivity for the chosen material',
    metallicBehavior: 'Appropriate metallic or non-metallic characteristics',
    transparency: 'Appropriate transparency for the chosen material',
    thickness: 'Appropriate thickness for the chosen material and application',
    edges: 'Professionally finished edges appropriate for the chosen material',
    depth: 'Appropriate depth for the chosen material and construction method',
    physicalConstruction: 'Professional construction using appropriate materials and methods',
    mounting: 'Professional mounting appropriate for the chosen material and application',
    realisticLightResponse: 'Appropriate light response for the chosen material',
    shadowsReflections: 'Appropriate shadows and reflections for the chosen material and environment',
  },
};

// ============================================================================
// LIGHTING TYPE SPECIFICATIONS
// ============================================================================

interface LightingSpecification {
  name: string;
  description: string;
  illuminationType: string;
  lightSourceVisibility: string;
  brightness: string;
  colorTemperature: string;
  glowEffect: string;
  reflections: string;
  shadows: string;
  powerConsumption: string;
}

const LIGHTING_SPECIFICATIONS: Record<LightingType, LightingSpecification> = {
  none: {
    name: 'No Illumination',
    description: 'No added illumination, relies on ambient light',
    illuminationType: 'None, sign is visible only with ambient or external lighting',
    lightSourceVisibility: 'No light sources visible',
    brightness: 'Depends entirely on ambient lighting conditions',
    colorTemperature: 'N/A, uses ambient light color',
    glowEffect: 'No glow effect, sign appears as a flat surface',
    reflections: 'Reflects ambient light according to material finish',
    shadows: 'Natural shadows based on ambient light direction and material characteristics',
    powerConsumption: 'Zero power consumption',
  },
  frontLit: {
    name: 'Front Illumination',
    description: 'Subtle front illumination',
    illuminationType: 'Light directed onto the front surface of the sign',
    lightSourceVisibility: 'Light sources may be visible or hidden depending on design',
    brightness: 'Moderate brightness, sufficient for night visibility without being harsh',
    colorTemperature: 'Warm white to neutral white (2700K-4000K)',
    glowEffect: 'Subtle glow on the sign surface, light spill on immediate surroundings',
    reflections: 'Light reflects off the sign surface according to material finish',
    shadows: 'Soft shadows cast by the sign on the building, minimal self-shadowing on the sign',
    powerConsumption: 'Moderate power consumption',
  },
  halo: {
    name: 'Halo Illumination',
    description: 'A soft rear halo glow',
    illuminationType: 'Light directed behind or around the sign, creating a halo effect',
    lightSourceVisibility: 'Light sources typically hidden behind the sign',
    brightness: 'Soft to moderate brightness, creating a gentle glow without harsh light',
    colorTemperature: 'Warm white (2700K-3000K) for inviting appearance',
    glowEffect: 'Soft halo glow around the sign perimeter, creating a floating appearance',
    reflections: 'Soft reflections on the wall behind the sign from the halo light',
    shadows: 'Minimal shadows on the building, sign appears to float with soft glow',
    powerConsumption: 'Moderate power consumption',
  },
  neon: {
    name: 'Neon-Style Illumination',
    description: 'Neon-style illumination',
    illuminationType: 'Bright, colorful light emission from the sign elements',
    lightSourceVisibility: 'Light sources are the sign elements themselves (LED tubing or similar)',
    brightness: 'High brightness, designed for maximum visibility and impact',
    colorTemperature: 'Various colors depending on design, typically bright and saturated',
    glowEffect: 'Strong neon-like glow with colored light spill on surrounding surfaces',
    reflections: 'Colored reflections on surrounding surfaces, creating a vibrant appearance',
    shadows: 'Multiple shadow layers with colored edges, strong contrast between light and dark',
    powerConsumption: 'Higher power consumption due to bright illumination',
  },
};

// ============================================================================
// BUSINESS CATEGORY SPECIFICATIONS
// ============================================================================

interface BusinessCategorySpecification {
  name: string;
  description: string;
  typicalSignStyle: string;
  colorPreferences: string;
  visibilityRequirements: string;
  professionalAppearance: string;
}

const BUSINESS_CATEGORY_SPECIFICATIONS: Record<BusinessCategory, BusinessCategorySpecification> = {
  retail: {
    name: 'Retail',
    description: 'Retail store or shop',
    typicalSignStyle: 'Modern, clean, and highly visible with clear brand identification',
    colorPreferences: 'Brand colors with high contrast for visibility',
    visibilityRequirements: 'High visibility from street level, clear brand recognition',
    professionalAppearance: 'Professional retail appearance that attracts customers and communicates brand identity',
  },
  restaurant: {
    name: 'Restaurant',
    description: 'Restaurant or dining establishment',
    typicalSignStyle: 'Warm, inviting, with a sense of quality and dining experience',
    colorPreferences: 'Warm colors (reds, oranges, browns) or brand colors, creating an appetizing appearance',
    visibilityRequirements: 'Visible from a distance, communicates dining experience and quality',
    professionalAppearance: 'Professional restaurant appearance that conveys quality, ambiance, and dining experience',
  },
  cafe: {
    name: 'Café',
    description: 'Café or coffee shop',
    typicalSignStyle: 'Casual, inviting, with a sense of warmth and comfort',
    colorPreferences: 'Warm, earthy colors or brand colors, creating a cozy, welcoming appearance',
    visibilityRequirements: 'Visible to passing pedestrians, communicates warmth and quality',
    professionalAppearance: 'Professional café appearance that conveys warmth, quality, and a welcoming atmosphere',
  },
  beauty: {
    name: 'Beauty',
    description: 'Beauty salon, spa, or cosmetic business',
    typicalSignStyle: 'Elegant, sophisticated, with a sense of luxury and personal care',
    colorPreferences: 'Soft, elegant colors (pinks, purples, golds) or brand colors, creating a luxurious appearance',
    visibilityRequirements: 'High visibility with elegant appearance, communicates luxury and quality',
    professionalAppearance: 'Professional beauty appearance that conveys elegance, luxury, and personal care quality',
  },
  health: {
    name: 'Health',
    description: 'Health clinic, medical practice, or wellness center',
    typicalSignStyle: 'Clean, professional, with a sense of trust and competence',
    colorPreferences: 'Clean, professional colors (blues, greens, whites) or brand colors, creating a trustworthy appearance',
    visibilityRequirements: 'Clear visibility with professional appearance, communicates trust and competence',
    professionalAppearance: 'Professional health appearance that conveys trust, competence, and professional care',
  },
  hotel: {
    name: 'Hotel',
    description: 'Hotel or accommodation business',
    typicalSignStyle: 'Elegant, professional, with a sense of comfort and quality',
    colorPreferences: 'Elegant colors (golds, blues, greens) or brand colors, creating a comfortable, quality appearance',
    visibilityRequirements: 'High visibility from a distance, communicates comfort, quality, and professional service',
    professionalAppearance: 'Professional hotel appearance that conveys comfort, quality, and professional hospitality',
  },
  services: {
    name: 'Services',
    description: 'Professional services business',
    typicalSignStyle: 'Professional, clean, with clear communication of services offered',
    colorPreferences: 'Professional colors (blues, grays, blacks) or brand colors, creating a competent, professional appearance',
    visibilityRequirements: 'Clear visibility with professional appearance, communicates competence and reliability',
    professionalAppearance: 'Professional services appearance that conveys competence, reliability, and professional expertise',
  },
  culture: {
    name: 'Culture',
    description: 'Cultural institution, gallery, or artistic business',
    typicalSignStyle: 'Artistic, creative, with a sense of cultural significance and artistic expression',
    colorPreferences: 'Artistic colors or brand colors, creating a culturally significant and expressive appearance',
    visibilityRequirements: 'Visible with artistic appearance, communicates cultural significance and creative expression',
    professionalAppearance: 'Professional cultural appearance that conveys artistic significance, cultural importance, and creative expression',
  },
  other: {
    name: 'Other',
    description: 'Other business type',
    typicalSignStyle: 'Appropriate for the specific business and its requirements',
    colorPreferences: 'Appropriate colors for the specific business and its brand',
    visibilityRequirements: 'Appropriate visibility for the specific business and its location',
    professionalAppearance: 'Professional appearance appropriate for the specific business and its requirements',
  },
};

// ============================================================================
// DESIGN SPECIFICATION BUILDER
// ============================================================================

/**
 * Build a comprehensive design specification from the user's selections.
 * This provides structured, detailed information that the AI can use to
 * generate a sign that accurately reflects all the user's choices.
 */
export function buildDesignSpecification(configuration: SignConfiguration): {
  signType: SignTypeSpecification;
  style: StyleSpecification;
  materials: MaterialSpecification[];
  lighting: LightingSpecification;
  businessCategory: BusinessCategorySpecification;
  text: string;
  color: string;
  dimensions: {
    widthCm: string | null;
    heightCm: string | null;
  };
  notes: string | null;
} {
  return {
    signType: SIGN_TYPE_SPECIFICATIONS[configuration.signType],
    style: STYLE_SPECIFICATIONS[configuration.style],
    materials: configuration.materials.map(material => MATERIAL_SPECIFICATIONS[material]),
    lighting: LIGHTING_SPECIFICATIONS[configuration.lighting],
    businessCategory: BUSINESS_CATEGORY_SPECIFICATIONS[configuration.category],
    text: configuration.exactText.trim() || configuration.businessName.trim() || '',
    color: configuration.color,
    dimensions: {
      widthCm: configuration.widthCm || null,
      heightCm: configuration.heightCm || null,
    },
    notes: configuration.notes.trim() || null,
  };
}

/**
 * Generate detailed placement instructions from the sign area configuration.
 * This provides the AI with precise information about where to place the sign.
 */
export function buildPlacementSpecification(
  signArea: SignConfiguration['signArea'],
  replaceExistingSurface: boolean
): {
  hasPlacement: boolean;
  bounds: SignAreaBounds | null;
  replaceExistingSurface: boolean;
  placementDescription: string;
} {
  const bounds = signArea ? {
    xPercent: Math.round(signArea.strokes.flatMap(s => s.points).reduce((min, p) => Math.min(min, p.xPercent), 100)),
    yPercent: Math.round(signArea.strokes.flatMap(s => s.points).reduce((min, p) => Math.min(min, p.yPercent), 100)),
    widthPercent: Math.max(1, Math.round(
      signArea.strokes.flatMap(s => s.points).reduce((max, p) => Math.max(max, p.xPercent), 0) - 
      signArea.strokes.flatMap(s => s.points).reduce((min, p) => Math.min(min, p.xPercent), 100)
    )),
    heightPercent: Math.max(1, Math.round(
      signArea.strokes.flatMap(s => s.points).reduce((max, p) => Math.max(max, p.yPercent), 0) - 
      signArea.strokes.flatMap(s => s.points).reduce((min, p) => Math.min(min, p.yPercent), 100)
    )),
    centerXPercent: Math.round(
      signArea.strokes.flatMap(s => s.points).reduce((sum, p) => sum + p.xPercent, 0) / 
      signArea.strokes.flatMap(s => s.points).length
    ),
    centerYPercent: Math.round(
      signArea.strokes.flatMap(s => s.points).reduce((sum, p) => sum + p.yPercent, 0) / 
      signArea.strokes.flatMap(s => s.points).length
    ),
  } : null;

  const placementDescription = buildPlacementDescription(bounds, replaceExistingSurface);

  return {
    hasPlacement: !!signArea,
    bounds,
    replaceExistingSurface,
    placementDescription,
  };
}

function buildPlacementDescription(bounds: SignAreaBounds | null, replaceExistingSurface: boolean): string {
  if (!bounds) {
    return replaceExistingSurface
      ? 'The sign should be placed in the most appropriate location on the facade. The current surface in that area should be fully covered or replaced as it holds something that needs to be hidden.'
      : 'The sign should be placed in the most appropriate location on the facade, following professional sign placement principles.';
  }

  const centerX = bounds.centerXPercent;
  const centerY = bounds.centerYPercent;
  const left = bounds.xPercent;
  const top = bounds.yPercent;
  const right = Math.min(100, bounds.xPercent + bounds.widthPercent);
  const bottom = Math.min(100, bounds.yPercent + bounds.heightPercent);

  return `The user has marked a specific area for the sign: centered at approximately (${centerX}%, ${centerY}%) of the image, spanning from (${left}%, ${top}%) to (${right}%, ${bottom}%) of the frame. This marked area indicates WHERE the sign should be placed, not its exact size or shape. The sign must be positioned naturally within this marked zone, with realistic proportions and scale for a sign at that location on the facade. The sign should be physically attached to the building surface at this location, following the building's geometry, perspective, and architectural lines.` +
    (replaceExistingSurface
      ? ' The current surface in this marked area should be fully covered or replaced, as it holds something (old sign, shutter, bars, etc.) that needs to be hidden. The new sign should completely cover this area without leaving any part of the old surface visible.'
      : ' The sign should be added to this location while preserving the existing building surface outside the sign area.');
}

/**
 * Generate a complete, structured prompt that incorporates all design specifications.
 * This is used by the enhanced prompt builder to create detailed AI instructions.
 */
export function generateStructuredDesignSpecification(configuration: SignConfiguration): string {
  const designSpec = buildDesignSpecification(configuration);
  const placementSpec = buildPlacementSpecification(configuration.signArea, configuration.replaceExistingSurface);

  const sections: string[] = [];

  // 1. Placement Information
  sections.push('=== PLACEMENT SPECIFICATION ===');
  sections.push(placementSpec.placementDescription);
  
  if (placementSpec.bounds) {
    sections.push(`Exact bounds: x=${placementSpec.bounds.xPercent}%, y=${placementSpec.bounds.yPercent}%, width=${placementSpec.bounds.widthPercent}%, height=${placementSpec.bounds.heightPercent}%, center=(${placementSpec.bounds.centerXPercent}%, ${placementSpec.bounds.centerYPercent}%)`);
  }

  // 2. Sign Type Specification
  sections.push('');
  sections.push('=== SIGN TYPE SPECIFICATION ===');
  sections.push(`Type: ${designSpec.signType.name}`);
  sections.push(`Construction: ${designSpec.signType.construction}`);
  sections.push(`Typography: ${designSpec.signType.typography}`);
  sections.push(`Dimensionality: ${designSpec.signType.dimensionality}`);
  sections.push(`Depth: ${designSpec.signType.depth}`);
  sections.push(`Mounting: ${designSpec.signType.mounting}`);
  sections.push(`Illumination: ${designSpec.signType.illumination}`);
  sections.push(`Shadows: ${designSpec.signType.shadows}`);
  sections.push(`Realism: ${designSpec.signType.realism}`);

  // 3. Style Specification
  sections.push('');
  sections.push('=== STYLE SPECIFICATION ===');
  sections.push(`Style: ${designSpec.style.name}`);
  sections.push(`Visual Character: ${designSpec.style.visualCharacter}`);
  sections.push(`Typography: ${designSpec.style.typography}`);
  sections.push(`Letter Shape: ${designSpec.style.letterShape}`);
  sections.push(`Dimensionality: ${designSpec.style.dimensionality}`);
  sections.push(`Depth: ${designSpec.style.depth}`);
  sections.push(`Edge Treatment: ${designSpec.style.edgeTreatment}`);
  sections.push(`Finish: ${designSpec.style.finish}`);
  sections.push(`Mounting Style: ${designSpec.style.mountingStyle}`);
  sections.push(`Lighting Behavior: ${designSpec.style.lightingBehavior}`);
  sections.push(`Shadows: ${designSpec.style.shadows}`);
  sections.push(`Realism: ${designSpec.style.realism}`);

  // 4. Material Specifications
  sections.push('');
  sections.push('=== MATERIAL SPECIFICATIONS ===');
  if (designSpec.materials.length === 0) {
    sections.push('No specific materials requested. Use professionally appropriate materials for this sign type.');
  } else {
    designSpec.materials.forEach((material, index) => {
      sections.push(`Material ${index + 1}: ${material.name}`);
      sections.push(`  Surface Appearance: ${material.surfaceAppearance}`);
      sections.push(`  Texture: ${material.texture}`);
      sections.push(`  Gloss Finish: ${material.glossFinish}`);
      sections.push(`  Reflectivity: ${material.reflectivity}`);
      sections.push(`  Metallic Behavior: ${material.metallicBehavior}`);
      sections.push(`  Transparency: ${material.transparency}`);
      sections.push(`  Thickness: ${material.thickness}`);
      sections.push(`  Edges: ${material.edges}`);
      sections.push(`  Depth: ${material.depth}`);
      sections.push(`  Physical Construction: ${material.physicalConstruction}`);
      sections.push(`  Mounting: ${material.mounting}`);
      sections.push(`  Realistic Light Response: ${material.realisticLightResponse}`);
      sections.push(`  Shadows/Reflections: ${material.shadowsReflections}`);
    });
  }

  // 5. Lighting Specification
  sections.push('');
  sections.push('=== LIGHTING SPECIFICATION ===');
  sections.push(`Lighting Type: ${designSpec.lighting.name}`);
  sections.push(`Illumination Type: ${designSpec.lighting.illuminationType}`);
  sections.push(`Light Source Visibility: ${designSpec.lighting.lightSourceVisibility}`);
  sections.push(`Brightness: ${designSpec.lighting.brightness}`);
  sections.push(`Color Temperature: ${designSpec.lighting.colorTemperature}`);
  sections.push(`Glow Effect: ${designSpec.lighting.glowEffect}`);
  sections.push(`Reflections: ${designSpec.lighting.reflections}`);
  sections.push(`Shadows: ${designSpec.lighting.shadows}`);

  // 6. Business Category Context
  sections.push('');
  sections.push('=== BUSINESS CONTEXT ===');
  sections.push(`Business Category: ${designSpec.businessCategory.name}`);
  sections.push(`Typical Sign Style: ${designSpec.businessCategory.typicalSignStyle}`);
  sections.push(`Color Preferences: ${designSpec.businessCategory.colorPreferences}`);
  sections.push(`Visibility Requirements: ${designSpec.businessCategory.visibilityRequirements}`);
  sections.push(`Professional Appearance: ${designSpec.businessCategory.professionalAppearance}`);

  // 7. Text and Color
  sections.push('');
  sections.push('=== TEXT AND COLOR ===');
  sections.push(`Exact Text: "${designSpec.text}"`);
  sections.push(`Primary Color: ${designSpec.color}`);
  if (designSpec.dimensions.widthCm || designSpec.dimensions.heightCm) {
    sections.push(`Dimensions: ${designSpec.dimensions.widthCm || 'N/A'}cm × ${designSpec.dimensions.heightCm || 'N/A'}cm`);
  }

  // 8. Additional Notes
  if (designSpec.notes) {
    sections.push('');
    sections.push('=== ADDITIONAL NOTES ===');
    sections.push(designSpec.notes);
  }

  return sections.join('\n');
}

/**
 * Get a specific material specification by material type.
 */
export function getMaterialSpecification(material: SignMaterial): MaterialSpecification {
  return MATERIAL_SPECIFICATIONS[material];
}

/**
 * Get a specific style specification by style type.
 */
export function getStyleSpecification(style: SignStyle): StyleSpecification {
  return STYLE_SPECIFICATIONS[style];
}

/**
 * Get a specific sign type specification by sign type.
 */
export function getSignTypeSpecification(signType: SignType): SignTypeSpecification {
  return SIGN_TYPE_SPECIFICATIONS[signType];
}

/**
 * Get a specific lighting specification by lighting type.
 */
export function getLightingSpecification(lighting: LightingType): LightingSpecification {
  return LIGHTING_SPECIFICATIONS[lighting];
}

/**
 * Get a specific business category specification by category type.
 */
export function getBusinessCategorySpecification(category: BusinessCategory): BusinessCategorySpecification {
  return BUSINESS_CATEGORY_SPECIFICATIONS[category];
}
