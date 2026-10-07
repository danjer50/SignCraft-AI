import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AccountRole, AuthFailure, AuthSession } from '../domain/auth';
import {
  fetchSessionSnapshot,
  requestSignIn,
  requestSignOut,
  type SessionSnapshot,
  type SessionStatus,
  type SignInOutcome,
} from '../services/auth/authClient';

const UNAVAILABLE_SESSION: SessionSnapshot = {
  status: 'unavailable',
  session: null,
  failure: {
    code: 'AUTH_NOT_CONFIGURED',
    message: 'The authentication service did not answer.',
  },
};

/**
 * The auth client promises typed failures, but this provider is also the application's final
 * async boundary. Keep a rejected mock, browser extension, or future transport implementation
 * from becoming an unhandled rejection that can leave guarded routes loading forever.
 */
async function readSessionSafely(): Promise<SessionSnapshot> {
  try {
    return await fetchSessionSnapshot();
  } catch {
    return UNAVAILABLE_SESSION;
  }
}

/**
 * Session state for the whole app.
 *
 * The customer experience never waits for it: public routes render immediately and only the
 * guarded routes (`/admin`, `/pro`) look at `loading`. The token itself stays in an HttpOnly
 * cookie, so this context holds nothing but the public account shape — a compromised script cannot
 * read a session from here, and nothing here can grant a role: the server re-checks every request.
 */

export interface AuthState {
  loading: boolean;
  status: SessionStatus;
  session: AuthSession | null;
  /** Why the session could not be read (expired, unverifiable, service unavailable…). */
  failure: AuthFailure | null;
}

interface AuthContextValue extends AuthState {
  role: AccountRole | null;
  signIn: (identifier: string, password: string, next?: string | null) => Promise<SignInOutcome>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const INITIAL_STATE: AuthState = { loading: true, status: 'anonymous', session: null, failure: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    const snapshot = await readSessionSafely();
    setState({ loading: false, ...snapshot });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readSessionSafely().then((snapshot) => {
      if (!cancelled) setState({ loading: false, ...snapshot });
    });
    return () => { cancelled = true; };
  }, []);

  const signIn = useCallback(async (identifier: string, password: string, next?: string | null): Promise<SignInOutcome> => {
    const outcome = await requestSignIn(identifier, password, next);
    if (outcome.status === 'AUTHENTICATED') {
      setState({ loading: false, status: 'authenticated', session: outcome.session, failure: null });
    } else {
      setState((current) => ({ ...current, loading: false, status: outcome.status === 'UNAVAILABLE' ? 'unavailable' : current.status, failure: outcome.failure }));
    }
    return outcome;
  }, []);

  const signOut = useCallback(async () => {
    // The local session is dropped even when the network call fails: a visible "signed out" state
    // that contradicts the cookie is worse than a cookie that expires on its own.
    await requestSignOut();
    setState({ loading: false, status: 'anonymous', session: null, failure: null });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    role: state.session?.account.role ?? null,
    signIn,
    signOut,
    refresh,
  }), [state, signIn, signOut, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

/** Non-throwing accessor for chrome (footer, header) that renders with or without a session. */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
