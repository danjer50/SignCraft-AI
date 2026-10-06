import { useState } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QuoteDialogContext } from '../components/QuoteDialogContext';
import { QuoteRequestDialog } from '../components/QuoteRequestDialog';
import { LanguageProvider } from '../context/LanguageContext';
import { ProjectProvider } from '../context/ProjectContext';
import { HomePage } from './HomePage';
import { ResultPage } from './ResultPage';
import { StudioPage } from './StudioPage';
import { STUDIO_DRAFT_KEY } from '../services/draftStorage';
import { SIGN_STYLES, SIGN_TYPES, DEFAULT_SIGN_CONFIGURATION } from '../domain/sign';

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

function seedDraft(overrides: Record<string, unknown> = {}) {
  localStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify({
    id: 'visual-ux',
    step: 1,
    photo: null,
    lastConcept: null,
    configuration: { ...DEFAULT_SIGN_CONFIGURATION },
    ...overrides,
  }));
}

function QuoteHost({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <QuoteDialogContext.Provider value={() => setOpen(true)}>
      {children}
      <QuoteRequestDialog open={open} onClose={() => setOpen(false)} />
    </QuoteDialogContext.Provider>
  );
}

function renderRoutesWithQuoteDialog(initialPath: string) {
  return render(
    <LanguageProvider>
      <ProjectProvider>
        <QuoteHost>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path="/result" element={<ResultPage />} />
            </Routes>
          </MemoryRouter>
        </QuoteHost>
      </ProjectProvider>
    </LanguageProvider>,
  );
}

const openQuote = vi.fn();

function renderRoutes(initialPath: string) {
  return render(
    <LanguageProvider>
      <QuoteDialogContext.Provider value={openQuote}>
        <ProjectProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/studio" element={<StudioPage />} />
            <Route path="/result" element={<ResultPage />} />
          </Routes>
        </MemoryRouter>
        </ProjectProvider>
      </QuoteDialogContext.Provider>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  openQuote.mockClear();
});
afterEach(cleanup);

describe('redesigned customer experience', () => {
  it('opens on an obvious transformation: one photo, one luminous sign, one CTA', () => {
    const { container } = renderRoutes('/');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/métamorphosée/i);
    expect(screen.getAllByRole('link', { name: /Créer mon enseigne/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Voir comment ça marche/i })).toBeInTheDocument();

    // The hero visual is a real before/after of the same facade, not a fake AI render.
    const slider = container.querySelector('.comparison-slider--hero');
    expect(slider).not.toBeNull();
    expect(within(slider as HTMLElement).getAllByRole('img')).toHaveLength(2);
    expect(within(slider as HTMLElement).getByRole('slider')).toBeInTheDocument();
    expect(screen.getByText(/exemple de transformation, non généré par IA/i)).toBeInTheDocument();
  });

  it('lets the hero comparison be driven from the keyboard', () => {
    const { container } = renderRoutes('/');
    const range = within(container.querySelector('.comparison-slider--hero') as HTMLElement).getByRole('slider') as HTMLInputElement;

    fireEvent.change(range, { target: { value: '18' } });
    expect(range.value).toBe('18');
    expect((container.querySelector('.comparison-slider--hero') as HTMLElement).style.getPropertyValue('--compare-position')).toBe('18%');
  });

  it('shows a concrete multi-material combination on the home page', () => {
    renderRoutes('/');

    expect(screen.getByText('Alucobond / Dibond')).toBeInTheDocument();
    expect(screen.getByText('Acrylique (plexiglas)')).toBeInTheDocument();
    expect(screen.getByText('Modules LED')).toBeInTheDocument();
  });

  it('presents every sign type as a visual card with a hidden illustration', () => {
    seedDraft({ step: 3 });
    const { container } = renderRoutes('/studio?step=3');

    const cards = container.querySelectorAll('.sign-type-card');
    expect(cards).toHaveLength(SIGN_TYPES.length);
    expect(container.querySelectorAll('.sign-type-card .sign-art[aria-hidden="true"]')).toHaveLength(SIGN_TYPES.length);
    // The illustration must not pollute the accessible name of the choice.
    expect(screen.getByRole('button', { name: 'Lettres boîtiers' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lettres boîtiers' }));
    expect(screen.getByRole('button', { name: 'Lettres boîtiers' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('presents every style as a visual card', () => {
    seedDraft({ step: 4 });
    const { container } = renderRoutes('/studio?step=4');

    expect(container.querySelectorAll('.style-card')).toHaveLength(SIGN_STYLES.length);
    expect(container.querySelectorAll('.style-card .style-art[aria-hidden="true"]')).toHaveLength(SIGN_STYLES.length);
    fireEvent.click(screen.getByRole('button', { name: 'Premium' }));
    expect(screen.getByRole('button', { name: 'Premium' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers a prominent “let the atelier decide” escape hatch on the materials step', () => {
    seedDraft({ step: 5, configuration: { ...DEFAULT_SIGN_CONFIGURATION, businessName: 'Atelier Sable' } });
    renderRoutes('/studio?step=5');

    const advise = screen.getByRole('button', { name: /Laissez l’atelier décider/i });
    fireEvent.click(advise);

    // It uses the existing `unsure` material: visibly selected in the picker, count 1 / 6.
    expect(screen.getByRole('checkbox', { name: /Conseillez-moi/i })).toBeChecked();
    expect(screen.getByText('1 / 6')).toBeInTheDocument();
    expect(screen.getByText(/L’atelier vous conseille sur les matières/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Laissez l’atelier décider/i }));
    expect(screen.getByRole('checkbox', { name: /Conseillez-moi/i })).not.toBeChecked();
    expect(screen.getByText('0 / 6')).toBeInTheDocument();
  });

  it('walks the whole customer journey and ends in an open quote request', async () => {
    render(
      <LanguageProvider>
        <ProjectProvider>
          <QuoteHost>
            <MemoryRouter initialEntries={['/studio']}>
              <Routes>
                <Route path="/studio" element={<StudioPage />} />
                <Route path="/result" element={<ResultPage />} />
              </Routes>
            </MemoryRouter>
          </QuoteHost>
        </ProjectProvider>
      </LanguageProvider>,
    );
    const next = () => screen.getByRole('button', { name: 'Continuer' });

    // 1 · photo
    const photo = new File(['front facade'], 'facade.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText('Choisir une photo'), { target: { files: [photo] } });
    await waitFor(() => expect(screen.getByAltText('Photo sélectionnée — facade.webp')).toBeInTheDocument());
    fireEvent.click(next());

    // 2 · business name
    fireEvent.change(await screen.findByLabelText(/^Nom de l’établissement/), { target: { value: 'Atelier Sable' } });
    fireEvent.click(next());

    // 3 · sign type (visual card)
    fireEvent.click(await screen.findByRole('button', { name: /Lettres boîtiers/i }));
    fireEvent.click(next());

    // 4 · style (visual card)
    fireEvent.click(await screen.findByRole('button', { name: 'Premium' }));
    fireEvent.click(next());

    // 5 · two materials — the second pick never clears the first
    fireEvent.click(await screen.findByRole('checkbox', { name: /Acrylique \(plexiglas\)/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^Inox$/i }));
    expect(screen.getByRole('checkbox', { name: /Acrylique \(plexiglas\)/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^Inox$/i })).toBeChecked();
    expect(screen.getByText('2 / 6')).toBeInTheDocument();

    // 6 · create → result
    fireEvent.click(screen.getByRole('button', { name: /Créer mon enseigne/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Votre projet prend forme.' })).toBeInTheDocument();

    // 7 · request a quote from the action bar
    fireEvent.click(screen.getByRole('button', { name: /Je veux cette enseigne/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Acrylique \(plexiglas\) · Inox/)).toBeInTheDocument();
  });

  it('opens a simple customer quote from the result screen, with no manufacturing fields', () => {
    seedDraft({
      step: 5,
      configuration: {
        ...DEFAULT_SIGN_CONFIGURATION,
        businessName: 'Atelier Sable',
        signType: 'alucobond',
        style: 'premium',
        materials: ['acrylic', 'ledModules'],
      },
      lastConcept: {
        status: 'GENERATED',
        providerId: 'cloudflare-flux-2-klein-9b',
        imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
        createdAt: '2026-10-06T20:00:00.000Z',
        promptVersion: 'storefront-inpaint-v3',
        sourceImageTransfer: 'SENT_TO_SERVER',
      },
    });
    renderRoutesWithQuoteDialog('/result');

    fireEvent.click(screen.getByRole('button', { name: /Je veux cette enseigne/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Acrylique \(plexiglas\) · Modules LED/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Votre nom/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Adresse e-mail/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Téléphone/i)).toBeInTheDocument();
    // Customer-facing only: no professional manufacturing fields in the quote.
    expect(within(dialog).queryByLabelText(/Surface totale/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Quantité/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Délai/i)).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('puts the generated image first and the quote action in a persistent action bar', () => {
    seedDraft({
      step: 5,
      configuration: { ...DEFAULT_SIGN_CONFIGURATION, businessName: 'Atelier Sable', materials: ['acrylic', 'ledModules'] },
      lastConcept: {
        status: 'GENERATED',
        providerId: 'cloudflare-flux-2-klein-9b',
        imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
        createdAt: '2026-10-06T20:00:00.000Z',
        promptVersion: 'storefront-inpaint-v3',
        sourceImageTransfer: 'SENT_TO_SERVER',
      },
    });
    const { container } = renderRoutes('/result');

    // Media is the first thing in the document flow after the heading.
    const stage = container.querySelector('.result-stage');
    expect(stage).not.toBeNull();
    const bar = container.querySelector('.result-action-bar');
    expect(bar).not.toBeNull();
    expect((stage as Element).compareDocumentPosition(bar as Element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const want = within(bar as HTMLElement).getByRole('button', { name: /Je veux cette enseigne/i });
    fireEvent.click(want);
    expect(openQuote).toHaveBeenCalledTimes(1);
  });
});
