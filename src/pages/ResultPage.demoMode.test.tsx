import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from '../context/LanguageContext';
import { ProjectProvider } from '../context/ProjectContext';
import { QuoteDialogContext } from '../components/QuoteDialogContext';
import { DEFAULT_SIGN_CONFIGURATION } from '../domain/sign';
import { STUDIO_DRAFT_KEY } from '../services/draftStorage';
import { ResultPage } from './ResultPage';

/**
 * The demo wording is only truthful when the build really is the offline demonstration build, so
 * this file pins `aiMode: 'demo'` and checks that the result page says so — and that the API-mode
 * wording is what the default build shows instead (see `ResultPage.test.tsx`).
 */
vi.mock('../services/config', async () => {
  const actual = await vi.importActual<typeof import('../services/config')>('../services/config');
  return { ...actual, clientConfig: { ...actual.clientConfig, aiMode: 'demo' as const } };
});

const tinyImage = 'data:image/png;base64,iVBORw0KGgo=';

function seedDraft(concept: unknown) {
  localStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify({
    id: 'project-demo',
    configuration: { ...DEFAULT_SIGN_CONFIGURATION, businessName: 'Atelier Sable', exactText: 'ATELIER SABLE' },
    lastConcept: concept,
    step: 5,
    photo: {
      fileName: 'facade.webp',
      mimeType: 'image/webp',
      sizeBytes: 4096,
      transferState: 'LOCAL_ONLY',
      previewDataUrl: tinyImage,
    },
  }));
}

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('result page in demo mode', () => {
  it('keeps the honest demo explanation and never claims the AI service was called', () => {
    seedDraft({
      status: 'UNAVAILABLE',
      providerId: 'demo-unconfigured',
      message: 'No image-editing provider is configured. Your storefront photo has not been edited.',
      createdAt: '2026-10-05T09:10:00.000Z',
      sourceImageTransfer: 'LOCAL_ONLY',
    });

    render(
      <LanguageProvider>
        <ProjectProvider>
          <QuoteDialogContext.Provider value={() => undefined}>
            <MemoryRouter initialEntries={['/result']}>
              <Routes>
                <Route path="/result" element={<ResultPage />} />
              </Routes>
            </MemoryRouter>
          </QuoteDialogContext.Provider>
        </ProjectProvider>
      </LanguageProvider>,
    );

    expect(screen.getAllByText('Aucun rendu IA n’a été créé.').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Le mode démo n’a pas de fournisseur d’édition d’image configuré/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Le service d’IA n’a pas renvoyé de rendu/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('IA non configurée').length).toBeGreaterThan(0);
  });
});
