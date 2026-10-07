import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ImageOff, RefreshCw, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BeforeAfterComparison } from '../components/BeforeAfterComparison';
import { GenerationProgress } from '../components/GenerationProgress';
import { Seo } from '../components/Seo';
import { TextProof } from '../components/TextProof';
import { WhatsAppContactButton } from '../components/WhatsAppContactButton';
import { useQuoteDialog } from '../components/QuoteDialogContext';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';
import { SIGN_STYLES, type SignStyle } from '../domain/sign';
import { generateStorefrontConcept } from '../services/ai';
import { clientConfig } from '../services/config';
import { aiErrorMessageKey, photoPrivacyMessageKey } from '../services/ai/presentation';

/** Shown when /result is opened without a project: a clear recovery path, never a blank page. */
function EmptyResultState() {
  const { t } = useLanguage();
  return (
    <div className="result-empty" role="status">
      <span className="result-empty-mark"><ImageOff size={24} /></span>
      <h2>{t('result.emptyTitle')}</h2>
      <p>{t('result.emptyBody')}</p>
      <Link className="button button-dark" to="/studio">{t('result.openStudio')}<ArrowRight size={16} /></Link>
    </div>
  );
}

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

  if (!state.photo && !concept) {
    return (
      <div className="result-page page-container page-pad">
        <Seo title="Aperçu de votre concept" description="Consultez le résultat de votre conception d’enseigne." noIndex />
        <Link className="back-link" to="/studio"><ArrowLeft size={15} />{t('result.editBrief')}</Link>
        <div className="result-heading">
          <div><span className="eyebrow"><span className="eyebrow-line" />{t('result.eyebrow')}</span><h1>{t('result.title')}</h1></div>
        </div>
        <EmptyResultState />
      </div>
    );
  }

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
  const materialsLabel = config.materials.length === 0
    ? t('result.materialsNone')
    : config.materials.map((material) => t(`material.${material}`)).join(' · ');

  const regenerate = async () => {
    if (generationLock.current || busy) return;
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

      {busy && <GenerationProgress variant="banner" />}

      <section className="result-stage" aria-busy={busy}>
        <div className="result-section-top"><div><span className="eyebrow">01 · {t('result.reference')}</span><h2>{t('result.comparisonTitle')}</h2></div><span className="result-project-id">SC / {state.id.slice(0, 8).toUpperCase()}</span></div>
        <div className="result-stage-frame">
          <BeforeAfterComparison beforeImage={state.photo?.previewUrl} afterImage={generated ? concept.imageUrl : undefined} />
        </div>
        {!generated && !busy && (
          <div className="result-unavailable-banner" role="status" aria-live="polite">
            <span className="status-offline-dot" />
            <div>
              <strong>{concept?.status === 'ERROR' ? t('ai.failedBadge') : t('result.unavailableTitle')}</strong>
              <p>{resultMessage}</p>
              {concept?.status === 'ERROR' && <p className="result-retry-hint">{t('result.retryHint')}</p>}
            </div>
          </div>
        )}
      </section>

      <div className="result-action-bar">
        <button className="button button-primary button-large result-quote-button" type="button" onClick={openQuote} disabled={busy}>
          {t('result.wantThis')}<ArrowRight size={16} />
        </button>
        <div className="result-bar-actions">
          <button className="button button-outline" onClick={() => void regenerate()} disabled={busy || !state.photo?.file} type="button" aria-busy={busy}>
            {busy ? <span className="spin-dot" /> : <RefreshCw size={16} />}{busy ? t('ai.working') : t('result.tryAgain')}
          </button>
          <Link className="button button-ghost" to="/studio?step=4"><Sparkles size={16} />{t('result.tryStyle')}</Link>
          <WhatsAppContactButton />
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
          <div className="result-brief-line"><span>{t('result.materials')}</span><strong>{materialsLabel}</strong></div>
          <div className="result-brief-line"><span>{t('studio.lighting')}</span><strong>{t(`lighting.${config.lighting}`)}</strong></div>
          <div className="result-brief-line"><span>{t('studio.dimensions')}</span><strong>{config.widthCm || '—'} × {config.heightCm || '—'} {t('studio.centimeters')}</strong></div>
          <div className="result-brief-line"><span>{t('result.reference')}</span><strong>{photoReferenceLabel}</strong></div>
          {config.notes && <p className="result-notes">{config.notes}</p>}
          <div className="result-style-picker">
            <label htmlFor="result-style-select">{t('result.tryStyle')}</label>
            <select id="result-style-select" value={config.style} onChange={(event) => updateStyle(event.target.value as SignStyle)} disabled={busy}>
              {SIGN_STYLES.map((style) => <option key={style} value={style}>{t(`style.${style}`)}</option>)}
            </select>
          </div>

          <div className="result-next-step">
            <span className="eyebrow">{t('result.nextStepTitle')}</span>
            <p>{t('result.nextStepBody')}</p>
          </div>
          <p className="result-delivery-note">{photoPrivacyNote}</p>
          <time className="result-timestamp">{new Date(concept?.createdAt ?? Date.now()).toLocaleString(localeTag)}</time>
        </aside>
      </div>
    </div>
  );
}
