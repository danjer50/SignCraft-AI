import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <rect x="1" y="1" width="38" height="38" rx="12" fill="currentColor" />
        <path d="M10 14.5h20M13 14.5v10.3c0 1.2 1 2.2 2.2 2.2h9.6c1.2 0 2.2-1 2.2-2.2V14.5M16 19.5h8M16 23.7h8" stroke="#F5F2E9" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M9.5 11.5h21" stroke="#D7A46A" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function BrandLogo() {
  const { t } = useLanguage();
  return (
    <Link className="brand-lockup" to="/" aria-label={`${t('brand.name')} — ${t('common.backHome')}`}>
      <BrandMark />
      <span className="brand-copy">
        <span className="brand-name">{t('brand.name')}</span>
        <span className="brand-descriptor">{t('brand.descriptor')}</span>
      </span>
    </Link>
  );
}
