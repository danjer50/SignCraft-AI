import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from '../context/LanguageContext';
import { ProjectProvider } from '../context/ProjectContext';
import { QuoteDialogContext } from '../components/QuoteDialogContext';
import { DEFAULT_SIGN_CONFIGURATION } from '../domain/sign';
import { STUDIO_DRAFT_KEY } from '../services/draftStorage';
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

function renderStudioFlow(initialEntry = '/studio') {
  return render(
    <LanguageProvider>
      <ProjectProvider>
        <QuoteDialogContext.Provider value={() => undefined}>
          <MemoryRouter initialEntries={[initialEntry]}>
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

/** A saved draft with a preview but no File, exactly like the state after a page reload. */
function seedDraft(overrides: Record<string, unknown> = {}) {
  const draft = {
    id: 'project-test',
    configuration: { ...DEFAULT_SIGN_CONFIGURATION, businessName: 'Atelier Sable' },
    lastConcept: null,
    step: 5,
    photo: {
      fileName: 'facade.webp',
      mimeType: 'image/webp',
      sizeBytes: 2048,
      transferState: 'LOCAL_ONLY',
      previewDataUrl: 'data:image/jpeg;base64,dGh1bWI=',
    },
    ...overrides,
  };
  localStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify(draft));
}

async function uploadPhoto(name = 'facade.webp') {
  const photo = new File(['front facade'], name, { type: 'image/webp' });
  fireEvent.change(screen.getByLabelText('Choisir une photo'), { target: { files: [photo] } });
  await waitFor(() => expect(screen.getByAltText(`Photo sélectionnée — ${name}`)).toBeInTheDocument());
}

const continueButton = () => screen.getByRole('button', { name: 'Continuer' });

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('simplified customer flow', () => {
  it('walks photo → business name → sign type → style → materials → result → quote', async () => {
    renderStudioFlow();

    // 01 · Photo
    expect(screen.getByText('Ajoutez une photo de votre devanture')).toBeInTheDocument();
    await uploadPhoto();
    fireEvent.click(continueButton());

    // 02 · Business name (exact wording stays available, but optional)
    expect(await screen.findByText('Parlez-nous de votre activité')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Nom de l’établissement/), { target: { value: 'Atelier Sable' } });

    // Optional professional details stay collapsed, but nothing is removed from the flow.
    const exactTextField = screen.getByLabelText(/Texte exact à afficher/i);
    expect(exactTextField.closest('.optional-details-panel')).toHaveAttribute('hidden');
    fireEvent.click(screen.getByRole('button', { name: /Plus de détails/i }));
    expect(exactTextField.closest('.optional-details-panel')).not.toHaveAttribute('hidden');
    fireEvent.change(exactTextField, { target: { value: 'ATELIER SABLE' } });
    fireEvent.click(continueButton());

    // 03 · Sign type
    expect(await screen.findByText('Quel type d’enseigne imaginez-vous ?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lettres boîtiers/i }));
    fireEvent.click(continueButton());

    // 04 · Style
    expect(await screen.findByText('Quel style pour votre enseigne ?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Premium' }));
    fireEvent.click(continueButton());

    // 05 · Materials — one sign can combine several of them
    expect(await screen.findByText('Quelles matières pour votre enseigne ?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Acrylique \(plexiglas\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Inox$/i }));
    expect(screen.getByText('2 / 6')).toBeInTheDocument();
    expect(screen.getByText('Acrylique (plexiglas) · Inox')).toBeInTheDocument();

    // Generate → Result
    fireEvent.click(screen.getByRole('button', { name: /Préparer mon concept/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Votre projet prend forme.' })).toBeInTheDocument();

    // Honest demo result: never a fabricated render
    expect(screen.getAllByText('Aucun rendu IA n’a été créé.').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Votre photo d’origine n’a pas été modifiée/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Acrylique (plexiglas) · Inox')).toBeInTheDocument();
    expect(screen.getAllByText('ATELIER SABLE').length).toBeGreaterThan(0);

    // Result → Quote / WhatsApp
    expect(screen.getByRole('button', { name: /Demander un devis/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /WhatsApp/i }).length).toBeGreaterThan(0);
  });

  it('blocks a step with a clear message instead of showing an empty panel', async () => {
    renderStudioFlow();

    fireEvent.click(continueButton());
    expect(screen.getByRole('alert')).toHaveTextContent(/Ajoutez une photo de votre façade/i);
    expect(screen.getByText('Ajoutez une photo de votre devanture')).toBeInTheDocument();

    await uploadPhoto();
    fireEvent.click(continueButton());

    expect(await screen.findByText('Parlez-nous de votre activité')).toBeInTheDocument();
    fireEvent.click(continueButton());
    expect(screen.getByRole('alert')).toHaveTextContent(/Ajoutez le nom de votre établissement/i);
  });

  it('requires at least one material before a concept can be generated', async () => {
    renderStudioFlow();
    await uploadPhoto();
    fireEvent.click(continueButton());
    fireEvent.change(screen.getByLabelText(/^Nom de l’établissement/), { target: { value: 'Atelier Sable' } });
    fireEvent.click(screen.getByRole('button', { name: /Matières/ }));

    expect(await screen.findByText('Quelles matières pour votre enseigne ?')).toBeInTheDocument();
    expect(screen.getByText('0 / 6')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Préparer mon concept/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Choisissez au moins une matière/i);
    expect(screen.queryByRole('heading', { level: 1, name: 'Votre projet prend forme.' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Conseillez-moi/i }));
    expect(screen.getByText('1 / 6')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Préparer mon concept/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Votre projet prend forme.' })).toBeInTheDocument();
  });

  it('keeps the selection order, caps a sign at six materials and allows removal', async () => {
    seedDraft({ configuration: { ...DEFAULT_SIGN_CONFIGURATION, businessName: 'Atelier Sable', materials: ['acrylic', 'stainlessSteel', 'ledModules'] } });
    renderStudioFlow();

    expect(await screen.findByText('Quelles matières pour votre enseigne ?')).toBeInTheDocument();
    expect(screen.getByText('3 / 6')).toBeInTheDocument();
    expect(screen.getByText('Acrylique (plexiglas) · Inox · Modules LED')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Retirer cette matière/ })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: /Retirer cette matière — Inox/i }));
    expect(screen.getByText('2 / 6')).toBeInTheDocument();
    expect(screen.getByText('Acrylique (plexiglas) · Modules LED')).toBeInTheDocument();

    // Reach the documented limit: further materials are refused, not silently dropped.
    fireEvent.click(screen.getByRole('button', { name: /Néon LED flex/i }));
    fireEvent.click(screen.getByRole('button', { name: /Alucobond/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Bois$/i }));
    fireEvent.click(screen.getByRole('button', { name: /PVC expansé/i }));
    expect(screen.getByText('6 / 6')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vinyle adhésif/i })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/Limite de 6 matières atteinte/i);

    fireEvent.click(screen.getByRole('button', { name: /Tout désélectionner/i }));
    expect(screen.getByText('0 / 6')).toBeInTheDocument();
  });

  it('recovers the saved step and explains that a restored draft needs its photo file again', async () => {
    seedDraft({ step: 2 });
    renderStudioFlow();

    expect(await screen.findByText('Parlez-nous de votre activité')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Atelier Sable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Façade/ }));
    expect(await screen.findByText('Projet récupéré sur cet appareil')).toBeInTheDocument();
    expect(screen.getByText(/Resélectionnez le fichier photo/i)).toBeInTheDocument();

    // A restored preview is never treated as a generatable photo: the flow stops early.
    fireEvent.click(continueButton());
    expect(screen.getByRole('alert')).toHaveTextContent(/aperçu local/i);
    expect(screen.getByRole('button', { name: /Matières/ })).toBeDisabled();
    expect(screen.queryByRole('heading', { level: 1, name: 'Votre projet prend forme.' })).not.toBeInTheDocument();
  });
});
