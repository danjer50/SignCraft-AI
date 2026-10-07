import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { homePathForRole } from '../domain/auth';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

/**
 * Shown when a *signed-in* account asks for an area that is not its own (a PRO account on /admin,
 * a customer on /pro). It is a real answer — who you are, why this is closed, and where you can
 * go — instead of a blank page or a silent bounce.
 */
export function AccessDeniedPanel() {
  const { t } = useLanguage();
  const { session, signOut } = useAuth();
  const role = session?.account.role ?? 'CUSTOMER';
  const account = session?.account;

  return (
    <div className="page-container page-pad">
      <div className="access-denied" role="alert">
        <span className="access-denied-mark"><ShieldAlert size={22} /></span>
        <span className="eyebrow">SIGNCRAFT AI · 403</span>
        <h1>{t('access.title')}</h1>
        <p>{t('access.body')}</p>
        {account && (
          <dl className="access-denied-facts">
            <div><dt>{t('access.signedInAs')}</dt><dd>{account.username || account.email || account.id}</dd></div>
            <div><dt>{t('access.role')}</dt><dd>{t(`role.${account.role}`)}</dd></div>
          </dl>
        )}
        <div className="access-denied-actions">
          <Link className="button button-primary" to={homePathForRole(role)}>{t('access.goToMyArea')}</Link>
          <button className="button button-quiet" type="button" onClick={() => void signOut()}>{t('access.signOut')}</button>
        </div>
      </div>
    </div>
  );
}
