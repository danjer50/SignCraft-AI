import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { Seo } from '../components/Seo';

export function NotFoundPage() {
  const { t } = useLanguage();
  return (
    <section className="not-found-page page-container page-pad">
      <Seo title="Page introuvable" description="Page introuvable." noIndex />
      <span className="not-found-code">404</span>
      <h1>{t('common.notFound')}</h1>
      <Link to="/" className="button button-dark"><ArrowLeft size={16} />{t('common.backHome')}</Link>
    </section>
  );
}
