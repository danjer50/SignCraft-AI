import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { BrandMark } from './BrandLogo';

export function SiteFooter() {
  const { t } = useLanguage();
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
          <Link to="/studio">{t('nav.studio')} <ArrowUpRight size={14} /></Link>
          <Link to="/professional">{t('nav.professional')} <ArrowUpRight size={14} /></Link>
          <Link to="/admin">{t('nav.admin')} <ArrowUpRight size={14} /></Link>
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
