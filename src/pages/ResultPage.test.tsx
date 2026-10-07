import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from '../context/LanguageContext';
import { ProjectProvider } from '../context/ProjectContext';
import { QuoteDialogContext } from '../components/QuoteDialogContext';
import { DEFAULT_SIGN_CONFIGURATION } from '../domain/sign';
import { STUDIO_DRAFT_KEY } from '../services/draftStorage';
import { ResultPage } from './ResultPage';

const tinyImage = 'data:image/png;base64,iVBORw0KGgo=';

function renderResult() {
  return render(
    <LanguageProvider>
      <ProjectProvider>
        <QuoteDialogContext.Provider value={() => undefined}>
          <MemoryRouter initialEntries={['/result']}>
            <Routes>
              <Route path="/result" element={<ResultPage />} />
              <Route path="/studio" element={<p>studio route rendered</p>} />
            </Routes>
          </MemoryRouter>
        </QuoteDialogContext.Provider>
      </ProjectProvider>
    </LanguageProvider>,
  );
}

function seedDraft(concept: unknown, overrides: Record<string, unknown> = {}) {
  localStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify({
    id: 'project-result',
    configuration: {
      ...DEFAULT_SIGN_CONFIGURATION,
      businessName: 'Atelier Sable',
      exactText: 'ATELIER SABLE',
      signType: 'channelLetters',
      materials: ['acrylic', 'ledModules'],
      ...overrides.configuration as object,
    },
    lastConcept: concept,
    step: 5,
    photo: {
      fileName: 'facade.webp',
      mimeType: 'image/webp',
      sizeBytes: 4096,
      transferState: 'LOCAL_ONLY',
      previewDataUrl: tinyImage,
    },
    ...overrides,
  }));
}

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('result page states', () => {
  it('never renders an empty page when /result is opened without a project', () => {
    renderResult();

    expect(screen.getByRole('heading', { level: 2, name: 'Aucun concept à afficher pour le moment' })).toBeInTheDocument();
    expect(screen.getByText(/Commencez par ajouter une photo/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /Ouvrir le studio/i }));
    expect(screen.getByText('studio route rendered')).toBeInTheDocument();
  });

  it('explains a failed generation, keeps the brief and offers the next step', () => {
    seedDraft({
      status: 'ERROR',
      providerId: 'cloudflare-flux-2-klein-9b',
      errorCode: 'AI_PROVIDER_UNAVAILABLE',
      message: 'Cloudflare Workers AI is temporarily unavailable. Please retry.',
      createdAt: '2026-10-05T09:00:00.000Z',
      sourceImageTransfer: 'SENT_TO_SERVER',
    });
    renderResult();

    expect(screen.getAllByText('Génération non confirmée').length).toBeGreaterThan(0);
    expect(screen.getByText(/temporairement indisponible/i)).toBeInTheDocument();
    expect(screen.getByText(/Une erreur n’efface pas votre brief/i)).toBeInTheDocument();

    // The restored photo is a preview only, so the retry stays honestly disabled.
    expect(screen.getByRole('button', { name: /Réessayer le rendu/i })).toBeDisabled();

    // The brief still shows every choice, including the two materials.
    expect(screen.getByText('Acrylique (plexiglas) · Modules LED')).toBeInTheDocument();
    expect(screen.getByText('Lettres boîtiers')).toBeInTheDocument();
    expect(screen.getByText(/Étape suivante : devis ou WhatsApp/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Je veux cette enseigne/i })).toBeInTheDocument();
  });

  it('shows the generated concept beside the original photo when a provider confirmed an image', () => {
    seedDraft({
      status: 'GENERATED',
      providerId: 'cloudflare-flux-2-klein-9b',
      imageUrl: tinyImage,
      createdAt: '2026-10-05T09:05:00.000Z',
      promptVersion: 'storefront-inpaint-v3',
      sourceImageTransfer: 'SENT_TO_SERVER',
    });
    renderResult();

    expect(screen.getByText('Concept généré par IA')).toBeInTheDocument();
    expect(screen.queryByText('Aucun rendu IA n’a été créé.')).not.toBeInTheDocument();
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
    expect(images.map((image) => image.getAttribute('alt'))).toEqual(['CONCEPT IA', 'PHOTO ORIGINALE']);
    expect(screen.getByText('Photo traitée avec succès par IA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Réessayer le rendu/i })).toBeDisabled();
  });

  it('explains an unanswered AI request instead of blaming demo mode when the app runs against the API', () => {
    seedDraft({
      status: 'UNAVAILABLE',
      providerId: 'demo-unconfigured',
      message: 'No image-editing provider is configured. Your storefront photo has not been edited.',
      createdAt: '2026-10-05T09:10:00.000Z',
      sourceImageTransfer: 'LOCAL_ONLY',
    });
    renderResult();

    expect(screen.getAllByText('Aucun rendu IA n’a été créé.').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Le service d’IA n’a pas renvoyé de rendu/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Le mode démo n’a pas de fournisseur/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Votre photo d’origine n’a pas été modifiée/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Photo locale · non transmise à l’IA')).toBeInTheDocument();
    expect(screen.getAllByText('ATELIER SABLE').length).toBeGreaterThan(0);
  });
});
