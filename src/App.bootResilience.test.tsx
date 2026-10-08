import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { STUDIO_DRAFT_KEY } from './services/draftStorage';

/**
 * Boot-level resilience.
 *
 * `ScrollToTop`, `LanguageProvider` and `Seo` run outside the page error boundary: when one of
 * them throws, React unmounts the whole tree into the root crash screen ("SignCraft AI n'a pas
 * pu démarrer"). jsdom never reproduces that on its own — `window.scrollTo` is simply
 * "not implemented" there — so each case below simulates a real browser that refuses the call
 * (Safari < 15.4 throws on the `instant` ScrollBehavior enum, sandboxed frames block scrolling
 * or head metadata entirely).
 */

const originalScrollTo = window.scrollTo;
const originalTitleDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'title')
  ?? Object.getOwnPropertyDescriptor(document, 'title');

/** A fresh module registry per case: the scroll feature probe is module-level state. */
async function renderApp(route: string) {
  vi.resetModules();
  const { default: App } = await import('./App');
  window.history.pushState({}, '', route);
  return render(
    <StrictMode>
      <ErrorBoundary variant="root">
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

function crashScreen() {
  return screen.queryByText(/erreur inattendue|Un problème est survenu sur cette page|could not start/i);
}

function seedDraft(draft: unknown) {
  localStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify(draft));
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.scrollTo = originalScrollTo;
  if (originalTitleDescriptor) Object.defineProperty(Document.prototype, 'title', originalTitleDescriptor);
});

describe('boot never falls into the root crash screen', () => {
  it('scrolls with the legacy signature when the browser rejects behavior: "instant"', async () => {
    const legacyCalls: unknown[][] = [];
    window.scrollTo = ((...args: unknown[]) => {
      if (args.length === 1 && typeof args[0] === 'object') {
        throw new TypeError("Failed to execute 'scrollTo' on 'Window': The provided value 'instant' is not a valid enum value of type ScrollBehavior.");
      }
      legacyCalls.push(args);
    }) as unknown as typeof window.scrollTo;

    await renderApp('/studio');

    expect(crashScreen()).toBeNull();
    expect(screen.getByText('Ajoutez une photo de votre devanture')).toBeInTheDocument();
    expect(legacyCalls).toContainEqual([0, 0]);
  });

  it('boots when window.scrollTo is not available at all', async () => {
    window.scrollTo = undefined as unknown as typeof window.scrollTo;

    await renderApp('/');

    expect(crashScreen()).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/métamorphosée/i);
  });

  it('boots when every scrolling API throws (sandboxed frame)', async () => {
    window.scrollTo = (() => { throw new Error('scrolling is blocked in this frame'); }) as unknown as typeof window.scrollTo;

    await renderApp('/result');

    expect(crashScreen()).toBeNull();
    expect(screen.getByText(/Aucun concept à afficher pour le moment/i)).toBeInTheDocument();
  });

  it('keeps rendering customer pages when the document refuses metadata writes', async () => {
    Object.defineProperty(Document.prototype, 'title', {
      configurable: true,
      get: () => '',
      set: () => { throw new Error('document.title is blocked in this frame'); },
    });

    await renderApp('/studio?step=5');

    expect(crashScreen()).toBeNull();
    expect(screen.getByText('Ajoutez une photo de votre devanture')).toBeInTheDocument();
  });

  it('migrates a legacy single-material draft instead of dropping the choice', async () => {
    seedDraft({
      id: 'legacy-single',
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
        material: 'acrylic',
      },
      lastConcept: null,
      photo: null,
    });

    await renderApp('/studio?step=5');

    expect(crashScreen()).toBeNull();
    const saved = JSON.parse(localStorage.getItem(STUDIO_DRAFT_KEY)!);
    expect(saved.configuration.materials).toEqual(['acrylic']);
    expect(screen.getByText('Ajoutez une photo de votre devanture')).toBeInTheDocument();
  });

  it('boots a draft saved by the release that predates the step flow', async () => {
    seedDraft({
      id: 'pre-flow',
      configuration: {
        businessName: 'Café Nour',
        category: 'cafe',
        signType: 'neonStyle',
        style: 'arabicFrench',
        color: '#24463f',
        lighting: 'neon',
        exactText: 'CAFÉ NOUR',
        widthCm: '120',
        heightCm: '40',
        notes: '',
      },
      lastConcept: null,
      photo: { fileName: 'facade.jpg', mimeType: 'image/jpeg', sizeBytes: 4096, transferState: 'LOCAL_ONLY', previewDataUrl: 'data:image/jpeg;base64,dGh1bWI=' },
    });

    await renderApp('/studio');

    expect(crashScreen()).toBeNull();
    // Step 1 with the saved photo preview restored, and the brief kept for the next steps.
    expect(screen.getByAltText('Photo sélectionnée — facade.jpg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeInTheDocument();
  });
});
