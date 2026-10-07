import { useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useLanguage, type Locale } from '../context/LanguageContext';
import { BrandLogo } from './BrandLogo';

function LanguageSwitcher() {
  const { locale, setLocale, t } = useLanguage();
  return (
    <label className="language-switcher">
      <span className="sr-only">{t('nav.language')}</span>
      <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} aria-label={t('nav.language')}>
        <option value="fr">FR</option>
        <option value="en">EN</option>
        <option value="ar">عربي</option>
      </select>
    </label>
  );
}

interface SiteHeaderProps {
  onOpenQuote: () => void;
}

/**
 * Customer header: the simplified journey only (studio + quote). Professional and admin
 * workspaces are deliberately not exposed here; they live in the footer workspace section.
 */
export function SiteHeader({ onOpenQuote }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useLanguage();
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-header">
      <div className="site-header-inner page-container">
        <BrandLogo />
        <button
          className="mobile-menu-toggle"
          type="button"
          aria-label={menuOpen ? t('nav.closeMenu') : t('nav.menu')}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <div className={`site-navigation${menuOpen ? ' is-open' : ''}`}>
          <nav className="primary-nav" aria-label={t('nav.customer')}>
            <NavLink to="/" end onClick={closeMenu} className={({ isActive }) => isActive ? 'active' : ''}>{t('nav.home')}</NavLink>
            <NavLink to="/studio" onClick={closeMenu} className={({ isActive }) => isActive ? 'active' : ''}>{t('nav.studio')}</NavLink>
          </nav>
          <div className="header-actions">
            <LanguageSwitcher />
            <NavLink to="/studio" onClick={closeMenu} className="button button-primary header-cta">{t('home.heroCta')}</NavLink>
            <button className="button button-dark button-small header-quote" type="button" onClick={() => { closeMenu(); onOpenQuote(); }}>
              <span>{t('nav.contact')}</span><ArrowUpRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
