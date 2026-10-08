import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import {
  fetchSessionSnapshot,
  requestSignIn,
  requestSignOut,
  type SessionSnapshot,
} from './services/auth/authClient';
import { fetchAdminAccounts, fetchAdminOverview } from './services/auth/adminClient';
import { ADMIN_SECTION_IDS } from './domain/admin';
import type { AccountRole, AuthSession } from './domain/auth';

/**
 * Route protection, end to end through the real app shell.
 *
 * The server-side checks (401 for an anonymous caller, 403 for a PRO account on an admin endpoint,
 * cookie signing, password hashing) are covered in `server/http/authHttp.test.ts`. These cases
 * verify what the *routes* do: nobody reaches a private area without the right role, nobody gets a
 * blank screen, and the public customer journey never requires an account.
 */
vi.mock('./services/auth/authClient', () => ({
  fetchSessionSnapshot: vi.fn(),
  requestSignIn: vi.fn(),
  requestSignOut: vi.fn(),
}));

vi.mock('./services/auth/adminClient', () => ({
  fetchAdminOverview: vi.fn(),
  fetchAdminAccounts: vi.fn(),
}));

function sessionFor(role: AccountRole): AuthSession {
  return {
    account: {
      id: role === 'ADMIN' ? 'owner' : role === 'PRO' ? 'pro-atelier' : 'customer-sami',
      username: role === 'ADMIN' ? 'owner' : role === 'PRO' ? 'atelier' : 'sami',
      email: `${role.toLowerCase()}@signcraft.example`,
      role,
      status: 'ACTIVE',
      createdAt: new Date(0).toISOString(),
    },
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

function setSession(snapshot: SessionSnapshot) {
  vi.mocked(fetchSessionSnapshot).mockResolvedValue(snapshot);
}

function signedInAs(role: AccountRole) {
  setSession({ status: 'authenticated', session: sessionFor(role), failure: null });
}

function anonymous() {
  setSession({ status: 'anonymous', session: null, failure: null });
}

function goTo(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

beforeEach(() => {
  localStorage.clear();
  window.scrollTo = (() => undefined) as unknown as typeof window.scrollTo;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.mocked(requestSignIn).mockResolvedValue({ status: 'REJECTED', failure: { code: 'INVALID_CREDENTIALS', message: '' } });
  vi.mocked(requestSignOut).mockResolvedValue(true);
  anonymous();
  vi.mocked(fetchAdminOverview).mockResolvedValue({
    status: 'OK',
    data: {
      generatedAt: new Date(0).toISOString(),
      signedInAs: { id: 'owner', role: 'ADMIN' },
      sections: ADMIN_SECTION_IDS.map((id) => ({ id, state: id === 'quoteRequests' ? 'local-only' : 'foundation', metrics: { sample: 1 }, issues: [] })),
    },
  });
  vi.mocked(fetchAdminAccounts).mockResolvedValue({
    status: 'OK',
    data: {
      accounts: [
        { id: 'owner', username: 'owner', email: 'owner@signcraft.example', role: 'ADMIN', status: 'ACTIVE' },
        { id: 'pro-atelier', username: 'atelier', email: 'atelier@signcraft.example', role: 'PRO', status: 'ACTIVE' },
      ],
      writable: false,
      issues: [],
    },
  });
});

afterEach(cleanup);

describe('private routes are protected by the signed-in role', () => {
  it('sends an anonymous visitor from /admin to the single login page, remembering the target', async () => {
    goTo('/admin');

    expect(await screen.findByRole('heading', { level: 1, name: /Un seul accès, trois espaces/i })).toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe('/login?next=%2Fadmin');
    expect(screen.queryByText(/Pilotage de SignCraft AI/i)).toBeNull();
  });

  it('denies a signed-in PRO account on /admin and offers its own area', async () => {
    signedInAs('PRO');
    goTo('/admin');

    expect(await screen.findByRole('alert')).toHaveTextContent(/Accès non autorisé/i);
    expect(screen.getByText(/n’a pas accès à cet espace/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Aller à mon espace/i })).toHaveAttribute('href', '/pro');
    // The console itself never rendered, and the panel states which role is signed in.
    expect(screen.queryByText(/Pilotage de SignCraft AI/i)).toBeNull();
    const panel = document.querySelector('.access-denied') as HTMLElement;
    expect(within(panel).getByText('Professionnel')).toBeInTheDocument();
    expect(within(panel).getByText('atelier')).toBeInTheDocument();
  });

  it('denies a signed-in customer on /admin and on /pro', async () => {
    signedInAs('CUSTOMER');
    goTo('/admin');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Accès non autorisé/i);
    expect(screen.getByRole('link', { name: /Aller à mon espace/i })).toHaveAttribute('href', '/');
    cleanup();

    signedInAs('CUSTOMER');
    goTo('/pro');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Accès non autorisé/i);
    expect(screen.queryByText(/Le mode professionnel est en préparation/i)).toBeNull();
  });

  it('opens /pro for a PRO account with an honest “being prepared” placeholder', async () => {
    signedInAs('PRO');
    goTo('/pro');

    expect(await screen.findByRole('heading', { level: 1, name: /Le mode professionnel est en préparation/i })).toBeInTheDocument();
    expect(screen.getByText(/L’accès est sécurisé et réservé aux comptes PRO/i)).toBeInTheDocument();
    expect(screen.getByText('atelier')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voir la présentation du workflow/i })).toHaveAttribute('href', '/professional');
    // No production tooling is pretended to exist: the roadmap chips are decorative and the copy
    // says plainly that nothing is enabled yet.
    expect(screen.getByText(/rien n’est encore activé ici/i)).toBeInTheDocument();
    expect(document.querySelector('.pro-modules-preview')).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelector('.pro-page form')).toBeNull();
  });

  it('opens the admin console for the ADMIN account with the eight sections', async () => {
    signedInAs('ADMIN');
    goTo('/admin');

    expect(await screen.findByRole('heading', { level: 1, name: /Pilotage de SignCraft AI/i })).toBeInTheDocument();
    const sections = document.querySelector('.admin-sections');
    expect(sections).not.toBeNull();
    expect(within(sections as HTMLElement).getAllByRole('button')).toHaveLength(ADMIN_SECTION_IDS.length);
    for (const label of ['Utilisateurs', 'Comptes pro', 'Projets clients', 'Demandes de devis', 'Usage IA', 'Réglages du site', 'Fonctionnalités', 'Système & erreurs']) {
      expect(within(sections as HTMLElement).getByText(label)).toBeInTheDocument();
    }

    // The existing quote inbox is still there, unchanged, inside its section.
    expect(screen.getByText(/Suivez les demandes présentes dans ce navigateur/i)).toBeInTheDocument();

    // And the account data comes from the server, without credential material.
    fireEvent.click(within(sections as HTMLElement).getByText('Comptes pro'));
    expect(await screen.findByText('atelier@signcraft.example')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('pbkdf2-sha256');
    expect(document.body.textContent).not.toContain('passwordHash');
  });

  it('signs out from the footer, which closes the private area again', async () => {
    signedInAs('ADMIN');
    goTo('/admin');
    expect(await screen.findByRole('heading', { level: 1, name: /Pilotage de SignCraft AI/i })).toBeInTheDocument();

    // After signing out the session snapshot becomes anonymous, exactly like a fresh page load.
    vi.mocked(requestSignOut).mockResolvedValue(true);
    anonymous();
    const footer = document.querySelector('.site-footer') as HTMLElement;
    fireEvent.click(within(footer).getByRole('button', { name: /Se déconnecter/i }));

    await waitFor(() => expect(vi.mocked(requestSignOut)).toHaveBeenCalled());
    expect(await screen.findByRole('heading', { level: 1, name: /Un seul accès, trois espaces/i })).toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toContain('/login');
    expect(screen.queryByText(/Pilotage de SignCraft AI/i)).toBeNull();
  });

  it('shows the login page (never a blank screen) when the auth service is unavailable', async () => {
    setSession({ status: 'unavailable', session: null, failure: { code: 'AUTH_NOT_CONFIGURED', message: '' } });
    goTo('/admin');

    expect(await screen.findByRole('heading', { level: 1, name: /Un seul accès, trois espaces/i })).toBeInTheDocument();
    expect(await screen.findByText(/L’authentification n’est pas encore configurée/i)).toBeInTheDocument();
    expect(document.querySelector('.error-screen')).toBeNull();
  });
});

describe('the public customer experience needs no account', () => {
  it.each([
    ['/', /métamorphosée/i],
    ['/studio', /Ajoutez une photo de votre devanture/i],
    ['/result', /Aucun concept à afficher pour le moment/i],
  ])('renders %s for an anonymous visitor', async (path, expected) => {
    anonymous();
    goTo(path);

    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: /Un seul accès, trois espaces/i })).toBeNull();
    expect(window.location.pathname).toBe(path);
  });

  it('renders the studio for a signed-in customer without redirecting anywhere', async () => {
    signedInAs('CUSTOMER');
    goTo('/studio?step=5');

    expect(await screen.findByText(/Ajoutez une photo de votre devanture/i)).toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe('/studio?step=5');
  });

  it('keeps working when the session service cannot be reached at all', async () => {
    vi.mocked(fetchSessionSnapshot).mockRejectedValue(new Error('network down'));
    goTo('/studio');

    expect(await screen.findByText(/Ajoutez une photo de votre devanture/i)).toBeInTheDocument();
    expect(document.querySelector('.error-screen')).toBeNull();
  });

  it('offers a discreet sign-in entry in the footer, not on the customer home page hero', async () => {
    anonymous();
    goTo('/');
    await screen.findByText(/métamorphosée/i);

    const footer = document.querySelector('.site-footer');
    expect(footer?.textContent).toContain('Se connecter');
    expect(within(footer as HTMLElement).getByRole('link', { name: /Se connecter/i })).toHaveAttribute('href', '/login');

    const hero = document.querySelector('.hero-copy');
    expect(hero?.textContent ?? '').not.toContain('Se connecter');
    expect(hero?.textContent ?? '').not.toMatch(/ADMIN/i);
    const header = document.querySelector('.site-header');
    expect(header?.textContent ?? '').not.toMatch(/ADMIN/i);
  });
});
