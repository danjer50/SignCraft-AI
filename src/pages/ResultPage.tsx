import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RefreshCw, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BeforeAfterComparison } from '../components/BeforeAfterComparison';
import { Seo } from '../components/Seo';
import { TextProof } from '../components/TextProof';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';
import { SIGN_STYLES, type SignStyle } from '../domain/sign';
import { generateStorefrontConcept } from '../services/ai';
import { clientConfig } from '../services/config';
import { aiErrorMessageKey, photoPrivacyMessageKey } from '../services/ai/presentation';
import { useQuoteDialog } from '../components/QuoteDialogContext';

export function ResultPage() {
  const { t, locale } = useLanguage();
  const { state, setConcept, updateConfiguration } = useProject();
  const openQuote = useQuoteDialog();
  const [busy, setBusy] = useState(false);
  const generationLock = useRef(false);
  const concept = state.lastConcept;
  const config = state.configuration;
  const generated = concept?.status === 'GENERATED';
  const localeTag = locale === 'fr' ? 'fr-FR' : locale === 'ar' ? 'ar-TN' : 'en-US';
  const photoReferenceLabel = !state.photo
    ? t('result.noPhoto')
    : generated
      ? t('result.photoProcessed')
      : concept?.sourceImageTransfer === 'SENT_TO_SERVER'
        ? t('result.photoSent')
        : concept?.sourceImageTransfer === 'UNKNOWN'
          ? t('result.photoTransferUnknown')
          : t('result.notUploaded');
  const photoPrivacyNote = t(photoPrivacyMessageKey(concept, clientConfig.aiMode, clientConfig.quoteMode));
  const resultStatusLabel = generated
    ? t('result.generated')
    : concept?.status === 'ERROR'
      ? t('ai.failedBadge')
      : t('studio.aiDemoBadge');
  const resultMessage = concept?.status === 'ERROR'
    ? t(aiErrorMessageKey(concept.errorCode))
    : t('result.unavailableBody');

  const regenerate = async () => {
    if (generationLock.current) return;
    if (!state.photo?.file) {
      setConcept({ status: 'UNAVAILABLE', providerId: 'demo-unconfigured', message: t('studio.photoReupload'), createdAt: new Date().toISOString(), sourceImageTransfer: 'LOCAL_ONLY' });
      return;
    }
    generationLock.current = true;
    setBusy(true);
    try {
      const result = await generateStorefrontConcept({ sourceImage: state.photo.file, configuration: config });
      setConcept(result);
    } catch {
      setConcept({
        status: 'ERROR',
        providerId: 'signcraft-ai-client',
        errorCode: 'AI_NETWORK_ERROR',
        message: 'The connection ended before a generation result could be confirmed.',
        createdAt: new Date().toISOString(),
        sourceImageTransfer: 'UNKNOWN',
      });
    } finally {
      generationLock.current = false;
      setBusy(false);
    }
  };

  const updateStyle = (style: SignStyle) => updateConfiguration('style', style);

  return (
    <div className="result-page page-container page-pad">
      <Seo title="Aperçu de votre concept" description="Consultez votre brief d’enseigne, comparez la photo de façade et le rendu généré lorsqu’un service d’édition est configuré." noIndex />
      <Link className="back-link" to="/studio"><ArrowLeft size={15} />{t('result.editBrief')}</Link>
      <div className="result-heading">
        <div><span className="eyebrow"><span className="eyebrow-line" />{t('result.eyebrow')}</span><h1>{t('result.title')}</h1><p>{t('result.lead')}</p></div>
        <span className={`result-status-pill${generated ? ' is-ready' : ''}`}><span className={generated ? 'status-ready-dot' : 'status-offline-dot'} />{resultStatusLabel}</span>
      </div>

      <section className="result-compare-section">
        <div className="result-section-top"><div><span className="eyebrow">01 · {t('result.reference')}</span><h2>{t('result.comparisonTitle')}</h2></div><span className="result-project-id">SC / {state.id.slice(0, 8).toUpperCase()}</span></div>
        <BeforeAfterComparison beforeImage={state.photo?.previewUrl} afterImage={generated ? concept.imageUrl : undefined} />
        {!generated && <div className="result-unavailable-banner" role="status" aria-live="polite"><span className="status-offline-dot" /><div><strong>{concept?.status === 'ERROR' ? t('ai.failedBadge') : t('result.unavailableTitle')}</strong><p>{resultMessage}</p></div></div>}
      </section>

      <div className="result-action-row">
        <div className="result-style-picker">
          <label htmlFor="result-style-select">{t('result.tryStyle')}</label>
          <select id="result-style-select" value={config.style} onChange={(event) => updateStyle(event.target.value as SignStyle)}>
            {SIGN_STYLES.map((style) => <option key={style} value={style}>{t(`style.${style}`)}</option>)}
          </select>
        </div>
        <div className="result-actions">
          <Link className="button button-outline" to="/studio?step=2"><Sparkles size={16} />{t('result.tryStyle')}</Link>
          <button className="button button-dark" onClick={() => void regenerate()} disabled={busy || !state.photo?.file} type="button" aria-busy={busy}>
            {busy ? <span className="spin-dot" /> : <RefreshCw size={16} />}{busy ? t('ai.working') : t('result.tryAgain')}
          </button>
        </div>
      </div>

      <div className="result-lower-grid">
        <TextProof text={config.exactText} color={config.color} businessName={config.businessName} />
        <aside className="result-brief-card">
          <span className="eyebrow">BRIEF · SC—{state.id.slice(0, 4).toUpperCase()}</span>
          <h2>{config.businessName || t('studio.summaryNotSet')}</h2>
          <div className="result-brief-line"><span>{t('studio.category')}</span><strong>{t(`category.${config.category}`)}</strong></div>
          <div className="result-brief-line"><span>{t('studio.signType')}</span><strong>{t(`sign.${config.signType}`)}</strong></div>
          <div className="result-brief-line"><span>{t('studio.style')}</span><strong>{t(`style.${config.style}`)}</strong></div>
          <div className="result-brief-line"><span>{t('studio.lighting')}</span><strong>{t(`lighting.${config.lighting}`)}</strong></div>
          <div className="result-brief-line"><span>{t('studio.dimensions')}</span><strong>{config.widthCm || '—'} × {config.heightCm || '—'} {t('studio.centimeters')}</strong></div>
          <div className="result-brief-line"><span>{t('result.reference')}</span><strong>{photoReferenceLabel}</strong></div>
          {config.notes && <p className="result-notes">{config.notes}</p>}
          <button className="button button-dark result-quote-button" type="button" onClick={openQuote}>{t('result.quoteCta')}<ArrowRight size={16} /></button>
          <p className="result-delivery-note">{photoPrivacyNote}</p>
          <time className="result-timestamp">{new Date(concept?.createdAt ?? Date.now()).toLocaleString(localeTag)}</time>
        </aside>
      </div>
    </div>
  );
}
