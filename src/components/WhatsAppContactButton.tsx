import { MessageCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useQuoteDialog } from './QuoteDialogContext';
import { clientConfig } from '../services/config';

export function WhatsAppContactButton() {
  const { t, locale } = useLanguage();
  const openQuote = useQuoteDialog();
  const message = locale === 'ar'
    ? 'مرحباً، أودّ التحدث عن مشروع لافتة لمتجري.'
    : locale === 'en'
      ? 'Hello, I would like to discuss a sign project for my storefront.'
      : 'Bonjour, je souhaite parler de mon projet d’enseigne.';

  if (clientConfig.whatsappNumber) {
    return (
      <a className="button button-whatsapp" href={`https://wa.me/${clientConfig.whatsappNumber}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
        <MessageCircle size={17} />{t('contact.whatsapp')}
      </a>
    );
  }

  return (
    <button className="button button-whatsapp is-unconfigured" type="button" onClick={openQuote} title={t('contact.whatsappNotConfigured')}>
      <MessageCircle size={17} />{t('contact.whatsapp')}<span className="whatsapp-fallback-hint">{t('contact.whatsappNotConfigured')}</span>
    </button>
  );
}
