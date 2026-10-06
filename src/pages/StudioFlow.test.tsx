import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from '../context/LanguageContext';
import { ProjectProvider } from '../context/ProjectContext';
import { QuoteDialogContext } from '../components/QuoteDialogContext';
import { StudioPage } from './StudioPage';
import { ResultPage } from './ResultPage';

vi.mock('../services/upload', async () => {
  const actual = await vi.importActual<typeof import('../services/upload')>('../services/upload');
  return {
    ...actual,
    createStorefrontPhoto: vi.fn(async (file: File) => ({
      file,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      transferState: 'LOCAL_ONLY' as const,
      previewDataUrl: 'data:image/jpeg;base64,dGh1bWI=',
      previewUrl: 'data:image/jpeg;base64,dGh1bWI=',
    })),
  };
});

function renderStudioFlow() {
  return render(
    <LanguageProvider>
      <ProjectProvider>
        <QuoteDialogContext.Provider value={() => undefined}>
          <MemoryRouter initialEntries={['/studio']}>
            <Routes>
              <Route path="/studio" element={<StudioPage />} />
              <Route path="/result" element={<ResultPage />} />
            </Routes>
          </MemoryRouter>
        </QuoteDialogContext.Provider>
      </ProjectProvider>
    </LanguageProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('customer studio workflow', () => {
  it('moves from storefront photo to configuration and an honest unavailable result', async () => {
    renderStudioFlow();

    fireEvent.change(screen.getByLabelText(/Nom de l’établissement/i), { target: { value: 'Atelier Sable' } });
    const photo = new File(['front facade'], 'facade.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText('Choisir une photo'), { target: { files: [photo] } });
    await waitFor(() => expect(screen.getByAltText('Photo sélectionnée — facade.webp')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(await screen.findByText('Quel type d’enseigne imaginez-vous ?')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Texte exact à afficher/i), { target: { value: 'ATELIER SABLE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(await screen.findByText('Les détails qui font la différence')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Préparer mon concept/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Votre projet prend forme.' })).toBeInTheDocument();
    expect(screen.getAllByText('ATELIER SABLE').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getAllByText('Aucun rendu IA n’a été créé.').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Votre photo d’origine n’a pas été modifiée/i).length).toBeGreaterThan(0);
  });
});
