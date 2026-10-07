import { useState, type FormEvent } from 'react';
import { ArrowRight, CircleAlert, Eye, EyeOff, KeyRound, Lock } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark } from '../components/BrandLogo';
import { Seo } from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { resolvePostSignInPath, type AuthErrorCode, type AuthFailure } from '../domain/auth';

/** Maps a server failure code to a localized, actionable sentence. */
const FAILURE_KEYS: Partial<Record<AuthErrorCode, 'auth.errorInvalid' | 'auth.errorMissing' | 'auth.errorNotActive' | 'auth.errorNotConfigured' | 'auth.errorExpired' | 'auth.errorTooMany' | 'auth.errorUnexpected'>> = {
  INVALID_CREDENTIALS: 'auth.errorInvalid',
  MISSING_CREDENTIALS: 'auth.errorMissing',
  ACCOUNT_NOT_ACTIVE: 'auth.errorNotActive',
  AUTH_NOT_CONFIGURED: 'auth.errorNotConfigured',
  SESSION_EXPIRED: 'auth.errorExpired',
  SESSION_INVALID: 'auth.errorExpired',
  TOO_MANY_ATTEMPTS: 'auth.errorTooMany',
  MALFORMED_REQUEST: 'auth.errorUnexpected',
  UNEXPECTED: 'auth.errorUnexpected',
};

/**
 * The one login page for SignCraft AI. There is no role selector: credentials go to the server, the
 * server answers with the account and the area it may open, and the browser follows. Customers keep
 * a way out — the public design experience never requires an account.
 */
export function LoginPage() {
  const { t } = useLanguage();
  const { signIn, status, session, failure } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthFailure | null>(null);

  const next = searchParams.get('next');

  // Already signed in: go straight to the permitted area instead of showing a form.
  if (status === 'authenticated' && session) {
    return <Navigate to={resolvePostSignInPath(session.account.role, next)} replace />;
  }

  const explain = (failureToExplain: AuthFailure): string => {
    const key = FAILURE_KEYS[failureToExplain.code];
    return key ? t(key) : failureToExplain.message || t('auth.errorUnexpected');
  };

  // An expired or unverifiable session found at boot is worth telling the visitor about.
  const bootNotice = !error && failure && (failure.code === 'SESSION_EXPIRED' || failure.code === 'SESSION_INVALID')
    ? t('auth.errorExpired')
    : null;
  const serviceNotice = status === 'unavailable' ? t('auth.errorNotConfigured') : null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await signIn(identifier, password, next);
    if (outcome.status === 'AUTHENTICATED') {
      navigate(outcome.redirect, { replace: true });
      return;
    }
    setError(outcome.failure);
    setBusy(false);
  };

  return (
    <div className="login-page page-container page-pad">
      <Seo title={t('nav.signIn')} description={t('auth.lead')} noIndex />
      <div className="login-card">
        <header className="login-head">
          <span className="login-mark"><BrandMark /></span>
          <span className="eyebrow"><span className="eyebrow-line" />SIGNCRAFT AI · {t('nav.account').toUpperCase()}</span>
          <h1>{t('auth.title')}</h1>
          <p>{t('auth.lead')}</p>
        </header>

        <p className="login-role-note"><KeyRound size={15} aria-hidden="true" /><span>{t('auth.roleNote')}</span></p>

        {bootNotice && <div className="login-notice" role="status"><CircleAlert size={16} aria-hidden="true" /><span>{bootNotice}</span></div>}
        {serviceNotice && <div className="login-notice is-warning" role="status"><CircleAlert size={16} aria-hidden="true" /><span>{serviceNotice}</span></div>}

        <form className="login-form" onSubmit={submit} noValidate={false}>
          <label className="field-label">
            {t('auth.identifier')}
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={254}
            />
          </label>

          <label className="field-label">
            {t('auth.password')}
            <span className="login-password-row">
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={revealed ? 'text' : 'password'}
                autoComplete="current-password"
                required
                maxLength={256}
              />
              <button
                className="login-reveal"
                type="button"
                onClick={() => setRevealed((current) => !current)}
                aria-label={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
                aria-pressed={revealed}
              >
                {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>

          {error && <p className="field-error" role="alert"><CircleAlert size={15} aria-hidden="true" />{explain(error)}</p>}

          <button className="button button-primary login-submit" type="submit" disabled={busy}>
            {busy ? <Lock size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
            {busy ? t('auth.signingIn') : t('auth.submit')}
          </button>
        </form>

        <p className="login-security-note">{t('auth.securityNote')}</p>

        <div className="login-alternatives">
          {/* The public design experience stays open: no account is required to create a concept. */}
          <Link className="button button-dark" to="/studio">{t('auth.continueAsCustomer')}</Link>
          <Link className="button button-quiet" to="/">{t('auth.backHome')}</Link>
        </div>
      </div>
    </div>
  );
}
