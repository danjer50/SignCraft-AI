import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { LanguageProvider } from '../context/LanguageContext';
import { STUDIO_DRAFT_KEY } from '../services/draftStorage';

let shouldThrow = true;

function Unstable() {
  if (shouldThrow) throw new Error('panel exploded');
  return <p>studio panel content</p>;
}

function renderBoundary(props: { resetKey?: string; variant?: 'page' | 'root' } = {}) {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <ErrorBoundary {...props}>
          <Unstable />
        </ErrorBoundary>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

let errorLog: ReturnType<typeof vi.spyOn>;

/** jsdom re-reports a caught render error on window; swallow it to keep test output readable. */
function swallowWindowError(event: ErrorEvent) {
  event.preventDefault();
}

/** jsdom cannot navigate; block the default action while keeping the React handler alive. */
function blockNavigation(event: MouseEvent) {
  event.preventDefault();
}

beforeEach(() => {
  localStorage.clear();
  shouldThrow = true;
  window.addEventListener('error', swallowWindowError);
  document.addEventListener('click', blockNavigation, true);
  // React and jsdom both log the intentional crash; keep the test output readable.
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  window.removeEventListener('error', swallowWindowError);
  document.removeEventListener('click', blockNavigation, true);
  errorLog.mockRestore();
});

describe('error boundary recovery', () => {
  it('replaces a crashing panel with a localized recovery screen instead of a blank page', () => {
    renderBoundary();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Un problème est survenu sur cette page' })).toBeInTheDocument();
    expect(screen.getByText(/éviter une page blanche/i)).toBeInTheDocument();
    expect(screen.queryByText('studio panel content')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Réafficher la page/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Retour à l’accueil/i })).toHaveAttribute('href', '/');
  });

  it('recovers on retry once the underlying problem is gone', () => {
    renderBoundary();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /Réafficher la page/i }));

    expect(screen.getByText('studio panel content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the crash screen when the route changes, so one broken page cannot trap the app', () => {
    const { rerender } = renderBoundary({ resetKey: '/studio' });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    rerender(
      <LanguageProvider>
        <MemoryRouter>
          <ErrorBoundary resetKey="/professional">
            <Unstable />
          </ErrorBoundary>
        </MemoryRouter>
      </LanguageProvider>,
    );

    expect(screen.getByText('studio panel content')).toBeInTheDocument();
  });

  it('offers a dedicated boot screen and clears the local draft on request', () => {
    localStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify({ id: 'p', configuration: {}, step: 2, photo: null, lastConcept: null }));
    renderBoundary({ variant: 'root' });

    expect(screen.getByRole('heading', { level: 1, name: 'SignCraft AI n’a pas pu démarrer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recharger/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /Effacer le brouillon local/i }));
    expect(localStorage.getItem(STUDIO_DRAFT_KEY)).toBeNull();
  });

  it('still renders localized text when the language provider itself is unavailable', () => {
    render(
      <ErrorBoundary>
        <Unstable />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Un problème est survenu sur cette page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Réafficher la page/i })).toBeInTheDocument();
  });

  it('exposes the failure message for support without leaking it into the layout', () => {
    renderBoundary();

    const details = screen.getByText('Détails techniques');
    expect(details).toBeInTheDocument();
    expect(screen.getByText('panel exploded')).toBeInTheDocument();
  });
});
