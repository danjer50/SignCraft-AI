import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from '../context/LanguageContext';
import { AuthProvider } from '../context/AuthContext';
import { LoginPage } from './LoginPage';
import {
  fetchSessionSnapshot,
  requestSignIn,
  requestSignOut,
  type SessionSnapshot,
  type SignInOutcome,
} from '../services/auth/authClient';
import type { AccountRole, AuthSession } from '../domain/auth';

/**
 * The auth client is mocked at its boundary: the server contract (hashing, cookies, role checks)
 * is covered by `server/auth` and `server/http` tests. These cases verify what the *page* does with
 * each answer, including the answers that must never become a blank screen.
 */
vi.mock('../services/auth/authClient', () => ({
  fetchSessionSnapshot: vi.fn(),
  requestSignIn: vi.fn(),
  requestSignOut: vi.fn(),
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

function setSignInOutcome(outcome: SignInOutcome) {
  vi.mocked(requestSignIn).mockResolvedValue(outcome);
}

const anonymous: SessionSnapshot = { status: 'anonymous', session: null, failure: null };

function renderLogin(initialEntry = '/login') {
  return render(
    <LanguageProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin" element={<div className="stub-admin">ADMIN AREA</div>} />
            <Route path="/pro" element={<div className="stub-pro">PRO AREA</div>} />
            <Route path="/studio" element={<div className="stub-studio">STUDIO</div>} />
            <Route path="/" element={<div className="stub-home">HOME</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </LanguageProvider>,
  );
}

vi.spyOn(console, 'error').mockImplementation(() => undefined);

beforeEach(() => {
  localStorage.clear();
  vi.mocked(requestSignOut).mockResolvedValue(true);
  setSession(anonymous);
});

afterEach(cleanup);

describe('the single login page', () => {
  it('asks for an identifier and a password, and never asks for a role', () => {
    renderLogin();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Un seul accès, trois espaces/i);
    expect(screen.getByLabelText(/E-mail ou identifiant/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Mot de passe$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Se connecter/i })).toBeInTheDocument();

    // No role picker anywhere on the page: the server decides.
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(document.body.textContent).not.toMatch(/ADMIN/);
    expect(screen.getByText(/aucun rôle à choisir/i)).toBeInTheDocument();

    // Customers are never forced to create an account.
    expect(screen.getByRole('link', { name: /Continuer sans compte/i })).toHaveAttribute('href', '/studio');
  });

  it('keeps the password masked until the visitor reveals it, and never prints a hash', async () => {
    renderLogin();
    const password = screen.getByLabelText(/^Mot de passe$/i);
    expect(password).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: /Afficher le mot de passe/i }));
    expect(password).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: /Masquer le mot de passe/i }));
    expect(password).toHaveAttribute('type', 'password');

    fireEvent.change(screen.getByLabelText(/E-mail ou identifiant/i), { target: { value: 'owner@signcraft.example' } });
    fireEvent.change(password, { target: { value: 'a-password-typed-by-the-test' } });
    expect(document.body.innerHTML).not.toContain('pbkdf2-sha256');
    expect(password).not.toHaveValue('');
  });

  it('explains rejected credentials instead of failing silently', async () => {
    setSignInOutcome({ status: 'REJECTED', failure: { code: 'INVALID_CREDENTIALS', message: 'These credentials do not match an account.' } });
    renderLogin();

    fireEvent.change(screen.getByLabelText(/E-mail ou identifiant/i), { target: { value: 'owner@signcraft.example' } });
    fireEvent.change(screen.getByLabelText(/^Mot de passe$/i), { target: { value: 'a-wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Ces identifiants ne correspondent à aucun compte/i);
    // Still on the login page: no navigation happened.
    expect(screen.queryByText('ADMIN AREA')).toBeNull();
    expect(vi.mocked(requestSignIn)).toHaveBeenCalledWith('owner@signcraft.example', 'a-wrong-password', null);
  });

  it('explains throttling, a suspended account and an unconfigured service', async () => {
    const { unmount } = renderLogin();
    setSignInOutcome({ status: 'REJECTED', failure: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts.' } });
    fireEvent.change(screen.getByLabelText(/E-mail ou identifiant/i), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText(/^Mot de passe$/i), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Trop de tentatives/i);
    unmount();

    cleanup();
    setSignInOutcome({ status: 'REJECTED', failure: { code: 'ACCOUNT_NOT_ACTIVE', message: 'Not active.' } });
    renderLogin();
    fireEvent.change(screen.getByLabelText(/E-mail ou identifiant/i), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText(/^Mot de passe$/i), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Ce compte n’est pas actif/i);
    unmount();

    cleanup();
    setSession({ status: 'unavailable', session: null, failure: { code: 'AUTH_NOT_CONFIGURED', message: '' } });
    renderLogin();
    expect(await screen.findByText(/L’authentification n’est pas encore configurée/i)).toBeInTheDocument();
    unmount();

    cleanup();
    setSession({ status: 'anonymous', session: null, failure: { code: 'SESSION_EXPIRED', message: '' } });
    renderLogin();
    expect(await screen.findByText(/Votre session a expiré/i)).toBeInTheDocument();
  });

  it('submits nothing while a sign-in is already running', async () => {
    // A ref keeps the resolver reachable: TypeScript narrows a reassigned `let` to `never` here.
    const release: { current: ((outcome: SignInOutcome) => void) | null } = { current: null };
    vi.mocked(requestSignIn).mockImplementation(() => new Promise<SignInOutcome>((resolve) => { release.current = resolve; }));
    renderLogin();

    fireEvent.change(screen.getByLabelText(/E-mail ou identifiant/i), { target: { value: 'owner' } });
    fireEvent.change(screen.getByLabelText(/^Mot de passe$/i), { target: { value: 'a-password' } });
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/i }));

    expect(await screen.findByRole('button', { name: /Connexion…/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Connexion…/i }));
    expect(vi.mocked(requestSignIn)).toHaveBeenCalledTimes(1);

    release.current?.({ status: 'REJECTED', failure: { code: 'INVALID_CREDENTIALS', message: '' } });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it.each([
    ['ADMIN', '/admin', 'ADMIN AREA'],
    ['PRO', '/pro', 'PRO AREA'],
    ['CUSTOMER', '/', 'HOME'],
  ] as Array<[AccountRole, string, string]>)('sends a %s account to %s after a successful sign-in', async (role, redirect, marker) => {
    setSignInOutcome({ status: 'AUTHENTICATED', session: sessionFor(role), redirect });
    renderLogin();

    fireEvent.change(screen.getByLabelText(/E-mail ou identifiant/i), { target: { value: 'someone@signcraft.example' } });
    fireEvent.change(screen.getByLabelText(/^Mot de passe$/i), { target: { value: 'a-correct-password' } });
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/i }));

    expect(await screen.findByText(marker)).toBeInTheDocument();
  });

  it('follows a permitted ?next= path but never an unauthorized one', async () => {
    setSignInOutcome({ status: 'AUTHENTICATED', session: sessionFor('CUSTOMER'), redirect: '/studio' });
    renderLogin('/login?next=%2Fstudio');
    fireEvent.change(screen.getByLabelText(/E-mail ou identifiant/i), { target: { value: 'sami' } });
    fireEvent.change(screen.getByLabelText(/^Mot de passe$/i), { target: { value: 'a-correct-password' } });
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/i }));
    expect(await screen.findByText('STUDIO')).toBeInTheDocument();
  });

  it('skips the form entirely when a session already exists', async () => {
    setSession({ status: 'authenticated', session: sessionFor('ADMIN'), failure: null });
    renderLogin();

    expect(await screen.findByText('ADMIN AREA')).toBeInTheDocument();
    expect(screen.queryByLabelText(/E-mail ou identifiant/i)).toBeNull();
  });

  it('never shows an empty page while the session is being read', async () => {
    setSession(anonymous);
    renderLogin();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    expect(document.querySelector('.login-card')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Se connecter/i })).toBeEnabled();
  });
});
