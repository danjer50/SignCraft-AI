import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from '../App';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { STUDIO_DRAFT_KEY } from '../services/draftStorage';

const DRAFTS: Record<string, unknown> = {
  none: null,
  // Shape persisted by the version that was live on main before the redesign:
  // no `step`, no `materials` field at all.
  legacyMain: {
    id: 'legacy-1',
    configuration: {
      businessName: 'Café Nour',
      category: 'cafe',
      signType: 'led',
      style: 'luxury',
      color: '#24463f',
      lighting: 'halo',
      exactText: '',
      widthCm: '',
      heightCm: '',
      notes: '',
    },
    lastConcept: null,
    photo: null,
  },
  legacyWithPhoto: {
    id: 'legacy-2',
    configuration: { businessName: 'Café Nour', category: 'cafe', signType: 'led', style: 'luxury', color: '#24463f', lighting: 'halo', exactText: '', widthCm: '', heightCm: '', notes: '' },
    lastConcept: null,
    photo: { fileName: 'facade.jpg', mimeType: 'image/jpeg', sizeBytes: 4096, transferState: 'LOCAL_ONLY', previewDataUrl: 'data:image/jpeg;base64,dGh1bWI=' },
  },
  legacyGenerated: {
    id: 'legacy-3',
    configuration: { businessName: 'Café Nour', category: 'cafe', signType: 'neonStyle', style: 'arabicFrench', color: '#24463f', lighting: 'neon', exactText: 'CAFÉ NOUR', widthCm: '120', heightCm: '40', notes: '' },
    lastConcept: { status: 'GENERATED', providerId: 'cloudflare-flux-2-klein-9b', imageUrl: 'data:image/png;base64,iVBORw0KGgo=', createdAt: '2026-09-30T10:00:00.000Z', promptVersion: 'storefront-inpaint-v3', sourceImageTransfer: 'SENT_TO_SERVER' },
    photo: { fileName: 'facade.jpg', mimeType: 'image/jpeg', sizeBytes: 4096, transferState: 'LOCAL_ONLY', previewDataUrl: 'data:image/jpeg;base64,dGh1bWI=' },
  },
  legacyUnavailable: {
    id: 'legacy-4',
    configuration: { businessName: 'Café Nour', category: 'cafe', signType: 'led', style: 'luxury', color: '#24463f', lighting: 'halo', exactText: '', widthCm: '', heightCm: '', notes: '' },
    lastConcept: { status: 'UNAVAILABLE', providerId: 'cloudflare-flux-2-klein-9b', message: 'Demo mode: no AI key configured.', createdAt: '2026-09-30T10:00:00.000Z', sourceImageTransfer: 'LOCAL_ONLY' },
    photo: { fileName: 'facade.jpg', mimeType: 'image/jpeg', sizeBytes: 4096, transferState: 'LOCAL_ONLY', previewDataUrl: 'data:image/jpeg;base64,dGh1bWI=' },
  },
  errorConcept: {
    id: 'err-1',
    step: 5,
    configuration: { businessName: 'Café Nour', category: 'cafe', signType: 'channelLetters', style: 'premium', color: '#f2b878', lighting: 'frontLit', exactText: '', widthCm: '', heightCm: '', notes: '', materials: ['acrylic', 'ledModules'] },
    lastConcept: { status: 'ERROR', providerId: 'cloudflare-flux-2-klein-9b', message: 'Upstream error', errorCode: 'UPSTREAM_ERROR', createdAt: '2026-10-06T10:00:00.000Z', sourceImageTransfer: 'SENT_TO_SERVER' },
    photo: { fileName: 'facade.jpg', mimeType: 'image/jpeg', sizeBytes: 4096, transferState: 'LOCAL_ONLY', previewDataUrl: 'data:image/jpeg;base64,dGh1bWI=' },
  },
  restoredStep5: {
    id: 'restored-1',
    step: 5,
    configuration: { businessName: 'Atelier Sable', category: 'retail', signType: 'alucobond', style: 'modern', color: '#ffffff', lighting: 'none', exactText: '', widthCm: '', heightCm: '', notes: '', materials: ['aluminiumComposite'] },
    lastConcept: null,
    photo: { fileName: 'facade.webp', mimeType: 'image/webp', sizeBytes: 2048, transferState: 'LOCAL_ONLY', previewDataUrl: 'data:image/jpeg;base64,dGh1bWI=' },
  },
  generatedWithPhoto: {
    id: 'gen-1',
    step: 5,
    configuration: { businessName: 'Atelier Sable', category: 'retail', signType: 'threeD', style: 'minimal', color: '#101010', lighting: 'halo', exactText: 'ATELIER', widthCm: '200', heightCm: '60', notes: 'notes', materials: ['acrylic', 'stainlessSteel', 'ledModules'] },
    lastConcept: { status: 'GENERATED', providerId: 'cloudflare-flux-2-klein-9b', imageUrl: 'data:image/png;base64,iVBORw0KGgo=', createdAt: '2026-10-06T10:00:00.000Z', promptVersion: 'storefront-inpaint-v3', sourceImageTransfer: 'SENT_TO_SERVER' },
    photo: { fileName: 'facade.webp', mimeType: 'image/webp', sizeBytes: 2048, transferState: 'LOCAL_ONLY', previewDataUrl: 'data:image/jpeg;base64,dGh1bWI=' },
  },
  materialsAsString: {
    id: 'str-1',
    step: 5,
    configuration: { businessName: 'X', category: 'other', signType: 'custom', style: 'bold', color: '#ffffff', lighting: 'none', exactText: '', widthCm: '', heightCm: '', notes: '', materials: 'acrylic' },
    lastConcept: null,
    photo: null,
  },
  singularMaterialLegacy: {
    id: 'sing-1',
    step: 5,
    configuration: { businessName: 'X', category: 'other', signType: 'custom', style: 'bold', color: '#ffffff', lighting: 'none', exactText: '', widthCm: '', heightCm: '', notes: '', material: 'acrylic' },
    lastConcept: null,
    photo: null,
  },
  garbage: { id: 12345, step: 'seven', configuration: 'oops', photo: 'nope', lastConcept: [] },
  nulls: { id: null, step: null, configuration: null, photo: null, lastConcept: null },
  hugeStep: { id: 'h-1', step: 99, configuration: { businessName: 'X' }, lastConcept: null, photo: null },
};

const ROUTES = ['/', '/studio', '/studio?step=3', '/studio?step=5', '/result'];
const LOCALES = ['fr', 'ar'];

const failures: string[] = [];

beforeEach(() => {
  localStorage.clear();
  window.scrollTo = (() => undefined) as unknown as typeof window.scrollTo;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('saved-draft compatibility at boot (every route, fr + ar)', () => {
  it.each(Object.keys(DRAFTS))('draft "%s" never trips the root error boundary', async (draftName) => {
    for (const locale of LOCALES) {
      for (const route of ROUTES) {
        localStorage.clear();
        localStorage.setItem('signcraft:locale', locale);
        const draft = DRAFTS[draftName];
        if (draft) localStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify(draft));
        window.history.pushState({}, '', route);

        render(
          <StrictMode>
            <ErrorBoundary variant="root">
              <App />
            </ErrorBoundary>
          </StrictMode>,
        );

        const crashed = screen.queryByText(/erreur inattendue|unexpected error|خطأ غير متوقع|Un problème est survenu/i);
        if (crashed) {
          const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
            .map((call) => call.map((entry) => (entry instanceof Error ? `${entry.name}: ${entry.message}` : String(entry))).join(' | '))
            .join('\n');
          failures.push(`[${draftName} · ${locale} · ${route}]\n${logged.slice(0, 1200)}`);
        }
        cleanup();
      }
    }
    expect(failures, failures.join('\n\n----\n\n')).toHaveLength(0);
  });
});
