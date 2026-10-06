import type { SignType } from './sign';

/** Production-ready domain model; modules stay independent from the customer studio. */
export interface MillimetreDimensions {
  widthMm: number;
  heightMm: number;
  depthMm?: number;
}

export type ProductionMaterial =
  | 'alucobond'
  | 'acrylic'
  | 'aluminium'
  | 'stainless-steel'
  | 'vinyl'
  | 'led-module'
  | 'other';

export interface MaterialRequirement {
  material: ProductionMaterial;
  quantity: number;
  unit: 'sheet' | 'metre' | 'unit' | 'square-metre';
  wasteFactor?: number;
  supplierReference?: string;
}

export interface CuttingPart {
  id: string;
  label: string;
  material: ProductionMaterial;
  dimensions: MillimetreDimensions;
  quantity: number;
  rotationAllowed: boolean;
}

export interface CuttingLayout {
  stockWidthMm: number;
  stockHeightMm: number;
  parts: CuttingPart[];
  exportedFormat?: 'DXF' | 'SVG';
}

export interface LedPlacement {
  componentId: string;
  positionsMm: Array<{ x: number; y: number }>;
  voltage?: 12 | 24;
  colourTemperatureKelvin?: number;
}

export interface ProductionDesign {
  projectId: string;
  signType: SignType;
  dimensions: MillimetreDimensions;
  materials: MaterialRequirement[];
  cuttingLayout?: CuttingLayout;
  letterTemplates?: Array<{ text: string; fontReference: string; outlineSvg?: string }>;
  ledPlacements?: LedPlacement[];
  assemblyNotes: string[];
  installationNotes: string[];
}

export type ProductionStage =
  | 'APPROVED_CONCEPT'
  | 'DIMENSIONED'
  | 'PRODUCTION_DESIGN'
  | 'MATERIALS_CALCULATED'
  | 'CUTTING_READY'
  | 'QUOTED'
  | 'MANUFACTURING'
  | 'INSTALLATION';

export interface ProductionProject {
  id: string;
  quoteRequestId: string;
  stage: ProductionStage;
  design?: ProductionDesign;
  revision: number;
  updatedAt: string;
}

export interface MaterialEstimate {
  status: 'READY' | 'NOT_CONFIGURED';
  lines: Array<MaterialRequirement & { unitPrice?: number; total?: number }>;
  currency?: string;
  disclaimer?: string;
}

export interface MaterialEstimator {
  estimate(design: ProductionDesign): Promise<MaterialEstimate>;
}

export interface CuttingFileExporter {
  exportSvg(layout: CuttingLayout): Promise<string>;
  exportDxf(layout: CuttingLayout): Promise<Uint8Array>;
}
