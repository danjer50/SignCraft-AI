import { ArrowRight, Boxes, CircleDot, FileCog, Lightbulb, PanelsTopLeft, Scissors, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

/**
 * The protected Professional area. Access is the feature here: the route only renders for a
 * signed-in PRO (or ADMIN) account, and the production tools themselves are deliberately not built
 * yet. Nothing on this page pretends otherwise.
 */
const UPCOMING_MODULES = [
  { key: 'pro.module.material', icon: Boxes },
  { key: 'pro.module.cutting', icon: Scissors },
  { key: 'pro.module.templates', icon: PanelsTopLeft },
  { key: 'pro.module.led', icon: Lightbulb },
  { key: 'pro.module.cnc', icon: FileCog },
  { key: 'pro.module.install', icon: Wrench },
] as const;

export function ProPage() {
  const { t } = useLanguage();
  const { session, signOut } = useAuth();
  const account = session?.account;

  return (
    <div className="pro-page page-container page-pad">
      <Seo title={t('nav.professional')} description={t('pro.preparingBody')} noIndex />

      <header className="pro-heading">
        <div>
          <span className="eyebrow"><span className="eyebrow-line" />{t('pro.workspaceEyebrow')}</span>
          <h1>{t('pro.preparingTitle')}</h1>
          <p>{t('pro.preparingBody')}</p>
        </div>
        <span className="professional-ready-pill"><CircleDot size={14} />{t('pro.previewBadge')}</span>
      </header>

      <div className="pro-modules-preview" aria-hidden="true">
        {UPCOMING_MODULES.map(({ key, icon: Icon }) => (
          <span className="pro-module-chip" key={key}><Icon size={16} />{t(key)}</span>
        ))}
      </div>

      <div className="pro-account-bar">
        <div className="pro-account-identity">
          <span className="eyebrow">{t('pro.accountBar')}</span>
          <strong>{account?.username || account?.email || account?.id || '—'}</strong>
          <span className="status-chip status-active">{account ? t(`role.${account.role}`) : '—'}</span>
        </div>
        <div className="pro-account-actions">
          <Link className="button button-outline" to="/professional">{t('pro.openOverview')}<ArrowRight size={15} /></Link>
          <button className="button button-quiet" type="button" onClick={() => void signOut()}>{t('access.signOut')}</button>
        </div>
      </div>
    </div>
  );
}
