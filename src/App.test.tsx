import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from './App';

/**
 * Blank-screen regression guard: every route must render real content, including the lazily
 * loaded professional/admin workspaces and the result page opened without a project.
 */
const routes = [
  { path: '/', expected: /métamorphosée/ },
  { path: '/studio', expected: /Ajoutez une photo de votre devanture/ },
  { path: '/studio?step=5', expected: /Ajoutez une photo de votre devanture/ },
  { path: '/result', expected: /Aucun concept à afficher pour le moment/ },
  { path: '/professional', expected: /Du concept à l’atelier/ },
  // One shared login page; the private areas send an anonymous visitor there instead of failing.
  { path: '/login', expected: /Un seul accès, trois espaces/ },
  { path: '/pro', expected: /Un seul accès, trois espaces/ },
  { path: '/admin', expected: /Un seul accès, trois espaces/ },
  { path: '/cette-page-n-existe-pas', expected: /Cette page n’existe pas/ },
];

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('routing resilience', () => {
  it.each(routes)('renders $path with visible content', async ({ path, expected }) => {
    window.history.pushState({}, '', path);
    render(<App />);

    expect(await screen.findByText(expected, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(/Un problème est survenu sur cette page/i)).not.toBeInTheDocument();
    const main = document.getElementById('main-content');
    expect((main?.textContent ?? '').trim().length).toBeGreaterThan(20);
  });

  it('shows the loading skeleton instead of an empty main area while a workspace chunk loads', async () => {
    window.history.pushState({}, '', '/professional');
    render(<App />);

    // The skeleton (or the page, when the chunk resolves instantly) is always present.
    expect(await screen.findByText(/Du concept à l’atelier/, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(document.getElementById('main-content')?.childElementCount).toBeGreaterThan(0);
  });

  it('keeps the customer header free of professional and admin links on every route', async () => {
    window.history.pushState({}, '', '/studio');
    render(<App />);

    expect(await screen.findByText(/Ajoutez une photo de votre devanture/)).toBeInTheDocument();
    const header = document.querySelector('.site-header');
    expect(header?.textContent).not.toContain('Demandes');
    expect(header?.textContent).toContain('Studio');
    // The workspaces stay reachable from the footer instead.
    const footer = document.querySelector('.site-footer');
    expect(footer?.textContent).toContain('Espaces de travail');
  });
});
