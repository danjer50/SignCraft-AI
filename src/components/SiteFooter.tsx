import { ArrowUpRight, LogIn, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOptionalAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { homePathForRole } from '../domain/auth';
import { BrandMark } from './BrandLogo';

export function SiteFooter() {
  const { t } = useLanguage();
  // Optional on purpose: the footer renders with or without a session, and never throws.
  const auth = useOptionalAuth();
  const account = auth?.session?.account ?? null;
  return (
    <footer className="site-footer">
      <div className="page-container footer-main">
        <div className="footer-brand">
          <BrandMark />
          <div>
            <div className="footer-brand-name">{t('brand.name')}</div>
            <p>{t('footer.statement')}</p>
          </div>
        </div>
        <div className="footer-nav">
          <div className="footer-nav-group">
            <span className="footer-nav-label">{t('nav.customer')}</span>
            <Link to="/">{t('nav.home')} <ArrowUpRight size={14} /></Link>
            <Link to="/studio">{t('nav.studio')} <ArrowUpRight size={14} /></Link>
          </div>
          {/* Professional and admin tools stay reachable but separate from the customer flow:
              these are quiet text links in the footer, never buttons on the customer home page,
              and both routes are guarded by the signed-in role. */}
          <div className="footer-nav-group">
            <span className="footer-nav-label">{t('nav.workspaces')}</span>
            <Link to="/professional">{t('nav.professional')} <ArrowUpRight size={14} /></Link>
            <Link to="/pro">{t('nav.proWorkspace')} <ArrowUpRight size={14} /></Link>
            <Link to="/admin">{t('nav.admin')} <ArrowUpRight size={14} /></Link>
          </div>
          <div className="footer-nav-group">
            <span className="footer-nav-label">{t('nav.account')}</span>
            {account ? (
              <>
                <Link to={homePathForRole(account.role)}>{t(`role.${account.role}`)} <ArrowUpRight size={14} /></Link>
                <button className="footer-sign-out" type="button" onClick={() => void auth?.signOut()}>
                  <LogOut size={14} />{t('access.signOut')}
                </button>
              </>
            ) : (
              <Link to="/login"><LogIn size={14} />{t('nav.signIn')}</Link>
            )}
          </div>
        </div>
      </div>
      <div className="page-container footer-bottom">
        <span>© {new Date().getFullYear()} SignCraft AI</span>
        <span>{t('footer.legal')}</span>
        <span className="footer-location">Tunis · Tunisie</span>
      </div>
    </footer>
  );
}
