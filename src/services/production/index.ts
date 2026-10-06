import type { CuttingFileExporter, MaterialEstimate, MaterialEstimator, ProductionDesign } from '../../domain/professional';

/** Explicit not-configured adapters; they never invent prices or fabrication files. */
export class UnconfiguredMaterialEstimator implements MaterialEstimator {
  async estimate(_design: ProductionDesign): Promise<MaterialEstimate> {
    return {
      status: 'NOT_CONFIGURED',
      lines: [],
      disclaimer: 'Material prices, waste factors and supplier data must be configured before estimates can be produced.',
    };
  }
}

export class UnconfiguredCuttingFileExporter implements CuttingFileExporter {
  async exportSvg(_layout: NonNullable<ProductionDesign['cuttingLayout']>): Promise<string> {
    throw new Error('SVG/CNC export is not configured yet.');
  }

  async exportDxf(_layout: NonNullable<ProductionDesign['cuttingLayout']>): Promise<Uint8Array> {
    throw new Error('DXF/CNC export is not configured yet.');
  }
}
