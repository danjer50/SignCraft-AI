import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Box, Check, CircleHelp, Lightbulb, PanelsTopLeft, PenTool, Sparkles, WandSparkles } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { BusinessCategory, LightingType, SignStyle, SignType } from '../domain/sign';
import { BUSINESS_CATEGORIES, LIGHTING_TYPES, SIGN_STYLES, SIGN_TYPES } from '../domain/sign';
import type { SignConfiguration } from '../domain/sign';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';
import { Seo } from '../components/Seo';
import { PhotoUploadField } from '../components/PhotoUploadField';
import { generateStorefrontConcept } from '../services/ai';
import { clientConfig } from '../services/config';
import { photoPrivacyMessageKey } from '../services/ai/presentation';
import { useQuoteDialog } from '../components/QuoteDialogContext';

const swatches = ['#24463f', '#222726', '#d7a46a', '#eee7d8', '#a45b45', '#445a7a', '#829b91', '#f3bb42'];
const signIcons = [Box, PanelsTopLeft, Lightbulb, PanelsTopLeft, Box, Box, PenTool, Lightbulb, Lightbulb, Sparkles];

function OptionCard({ selected, icon: Icon, title, onClick }: { selected: boolean; icon: typeof Box; title: string; onClick: () => void }) {
  return (
    <button type="button" className={`sign-type-card${selected ? ' is-selected' : ''}`} onClick={onClick} aria-pressed={selected}>
      <span className="sign-type-icon"><Icon size={18} strokeWidth={1.7} /></span>
      <span>{title}</span>{selected && <Check className="selected-check" size={15} />}
    </button>
  );
}

function StudioSummary() {
  const { state } = useProject();
  const { t } = useLanguage();
  const config = state.configuration;
  const businessLabel = config.businessName || t('studio.summaryNotSet');
  const visibleText = config.exactText || config.businessName || t('studio.summaryNotSet');
  const photoPrivacyBody = t(photoPrivacyMessageKey(state.lastConcept, clientConfig.aiMode, clientConfig.quoteMode));
  return (
    <aside className="studio-summary-card">
      <div className="summary-card-header"><div><span className="eyebrow">SIGNCRAFT · 01</span><h2>{t('studio.summaryTitle')}</h2></div><span className="summary-pin"><CircleHelp size={17} /></span></div>
      {state.photo ? (
        <div className="summary-photo"><img src={state.photo.previewUrl} alt={t('studio.summaryPhoto')} /><span><span className="summary-photo-dot" />{t('studio.summaryPhoto')}</span></div>
      ) : <div className="summary-photo-empty"><span className="summary-photo-icon"><PanelsTopLeft size={21} /></span><span>{t('studio.summaryNoPhoto')}</span></div>}
      <div className="summary-business"><span className="summary-label">{t('studio.businessName')}</span><strong>{businessLabel}</strong><span className="summary-category">{t(`category.${config.category}`)}</span></div>
      <div className="summary-divider" />
      <div className="summary-detail-row"><span>{t('studio.signType')}</span><strong>{t(`sign.${config.signType}`)}</strong></div>
      <div className="summary-detail-row"><span>{t('studio.style')}</span><strong>{t(`style.${config.style}`)}</strong></div>
      <div className="summary-detail-row"><span>{t('studio.lighting')}</span><strong>{t(`lighting.${config.lighting}`)}</strong></div>
      <div className="summary-detail-row summary-colour-row"><span>{t('studio.colors')}</span><span className="summary-colour-value"><i style={{ background: config.color }} />{config.color}</span></div>
      <div className="summary-divider" />
      <div className="summary-text-block"><span className="summary-label">{t('studio.summaryText')}</span><strong dir="auto">{visibleText}</strong></div>
      {(config.widthCm || config.heightCm) && <div className="summary-dimensions"><span>{config.widthCm || '—'} × {config.heightCm || '—'} {t('studio.centimeters')}</span></div>}
      <div className="summary-privacy"><span className="privacy-dot" /><div><strong>{t('studio.privacyTitle')}</strong><p>{photoPrivacyBody}</p></div></div>
      {clientConfig.aiMode === 'demo' && <div className="summary-ai-status"><span className="status-offline-dot" />{t('studio.aiDemoBadge')}</div>}
    </aside>
  );
}

export function StudioPage() {
  const { t } = useLanguage();
  const { state, updateConfiguration, setConcept } = useProject();
  const openQuote = useQuoteDialog();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const generationLock = useRef(false);
  const [validationMessage, setValidationMessage] = useState('');
  const rawStep = Number(searchParams.get('step') ?? '1');
  const step = Number.isFinite(rawStep) ? Math.min(3, Math.max(1, rawStep)) : 1;
  const config = state.configuration;

  const setStep = (value: number) => {
    setValidationMessage('');
    setSearchParams(value === 1 ? {} : { step: String(value) });
  };
  const setField = <K extends keyof SignConfiguration>(key: K, value: SignConfiguration[K]) => updateConfiguration(key, value);

  const nextStep = () => {
    if (step === 1) {
      if (!config.businessName.trim()) { setValidationMessage(t('studio.needName')); return; }
      if (!state.photo?.file) { setValidationMessage(state.photo ? t('studio.photoReupload') : t('studio.needPhoto')); return; }
    }
    setStep(Math.min(3, step + 1));
  };

  const prepareConcept = async () => {
    if (generationLock.current) return;
    if (!state.photo?.file) { setValidationMessage(t('studio.photoReupload')); return; }
    generationLock.current = true;
    setBusy(true);
    setValidationMessage('');
    try {
      const result = await generateStorefrontConcept({ sourceImage: state.photo.file, configuration: config });
      setConcept(result);
      navigate('/result');
    } finally {
      generationLock.current = false;
      setBusy(false);
    }
  };

  const steps = [t('studio.stepPhoto'), t('studio.stepIdentity'), t('studio.stepDetails')];
  const stepNumber = t('studio.stepNumber').replace('{current}', String(step)).replace('{total}', '3');

  return (
    <div className="studio-page page-container page-pad">
      <Seo title="Studio de conception" description="Téléversez la photo de votre devanture, configurez votre enseigne et préparez un brief professionnel." />
      <div className="studio-page-heading">
        <div><span className="eyebrow"><span className="eyebrow-line" />{t('studio.eyebrow')}</span><h1>{t('studio.title')}</h1><p>{t('studio.lead')}</p></div>
        <div className="studio-heading-meta"><span className="studio-step-count">{stepNumber}</span><span className="studio-heading-code">PROJECT · {state.id.slice(0, 6).toUpperCase()}</span></div>
      </div>

      <div className="studio-progress" aria-label={t('studio.stepNumber').replace('{current}', String(step)).replace('{total}', '3')}>
        {steps.map((label, index) => {
          const itemStep = index + 1;
          return (
            <button key={label} className={`progress-step${step === itemStep ? ' is-current' : ''}${step > itemStep ? ' is-complete' : ''}`} onClick={() => itemStep < step && setStep(itemStep)} type="button" aria-current={step === itemStep ? 'step' : undefined} disabled={itemStep > step}>
              <span className="progress-number">{step > itemStep ? <Check size={15} /> : `0${itemStep}`}</span><span className="progress-label">{label}</span>
            </button>
          );
        })}
        <span className="progress-track"><i style={{ width: `${((step - 1) / 2) * 100}%` }} /></span>
      </div>

      <div className="studio-layout">
        <section className="studio-form-panel">
          {step === 1 && (
            <div className="studio-step-content">
              <div className="step-section-heading"><span className="step-section-number">01</span><div><h2>{t('studio.photoTitle')}</h2><p>{t('studio.photoBody')}</p></div></div>
              <PhotoUploadField />
              <div className="form-section-divider" />
              <div className="step-section-heading step-section-heading-small"><span className="step-section-number">02</span><div><h2>{t('studio.businessTitle')}</h2></div></div>
              <div className="field-grid field-grid-two">
                <label className="field-label">{t('studio.businessName')} <span className="required-mark">*</span>
                  <input type="text" maxLength={120} value={config.businessName} onChange={(event) => setField('businessName', event.target.value)} placeholder={t('studio.businessNamePlaceholder')} autoComplete="organization" />
                </label>
                <label className="field-label">{t('studio.category')}
                  <select value={config.category} onChange={(event) => setField('category', event.target.value as BusinessCategory)}>
                    {BUSINESS_CATEGORIES.map((category) => <option key={category} value={category}>{t(`category.${category}`)}</option>)}
                  </select>
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="studio-step-content">
              <div className="step-section-heading"><span className="step-section-number">02</span><div><h2>{t('studio.designTitle')}</h2><p>{t('studio.exactTextHelp')}</p></div></div>
              <fieldset className="choice-fieldset"><legend>{t('studio.signType')}</legend><div className="sign-type-grid">
                {SIGN_TYPES.map((type, index) => {
                  const Icon = signIcons[index] ?? Box;
                  return <OptionCard key={type} selected={config.signType === type} icon={Icon} title={t(`sign.${type}`)} onClick={() => setField('signType', type as SignType)} />;
                })}
              </div></fieldset>
              <fieldset className="choice-fieldset style-fieldset"><legend>{t('studio.style')}</legend><div className="style-chip-grid">
                {SIGN_STYLES.map((style) => <button type="button" key={style} className={`style-chip${config.style === style ? ' is-selected' : ''}`} onClick={() => setField('style', style as SignStyle)} aria-pressed={config.style === style}>{t(`style.${style}`)}</button>)}
              </div></fieldset>
              <div className="field-grid field-grid-two lighting-color-grid">
                <fieldset className="choice-fieldset"><legend>{t('studio.colors')}</legend><div className="color-picker-row">
                  {swatches.map((color) => <button key={color} className={`color-swatch${config.color.toLowerCase() === color ? ' is-selected' : ''}`} style={{ '--swatch-color': color } as React.CSSProperties} type="button" onClick={() => setField('color', color)} aria-label={color} aria-pressed={config.color.toLowerCase() === color}><span className="sr-only">{color}</span></button>)}
                  <label className="custom-color-picker" title={t('studio.colors')}><input type="color" value={config.color} onChange={(event) => setField('color', event.target.value)} aria-label={t('studio.colors')} /><span>+</span></label>
                </div></fieldset>
                <fieldset className="choice-fieldset"><legend>{t('studio.lighting')}</legend><div className="lighting-options">
                  {LIGHTING_TYPES.map((lighting) => <button key={lighting} type="button" className={`lighting-option${config.lighting === lighting ? ' is-selected' : ''}`} onClick={() => setField('lighting', lighting as LightingType)} aria-pressed={config.lighting === lighting}><Lightbulb size={15} />{t(`lighting.${lighting}`)}</button>)}
                </div></fieldset>
              </div>
              <label className="field-label exact-text-label">{t('studio.exactText')} <span className="required-mark">*</span>
                <input type="text" dir="auto" required maxLength={180} value={config.exactText} onChange={(event) => setField('exactText', event.target.value)} placeholder={t('studio.exactTextPlaceholder')} />
                <span className="field-help">{t('studio.exactTextHelp')} <span className="character-count">{config.exactText.length}/180</span></span>
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="studio-step-content">
              <div className="step-section-heading"><span className="step-section-number">03</span><div><h2>{t('studio.detailsTitle')}</h2><p>{t('studio.dimensionHelp')}</p></div></div>
              <fieldset className="choice-fieldset dimensions-fieldset"><legend>{t('studio.dimensions')} <span className="optional-label">{t('studio.optional')}</span></legend>
                <div className="dimension-inputs">
                  <label className="field-label">{t('studio.width')}<span className="input-unit-wrap"><input type="number" min="1" max="5000" inputMode="decimal" placeholder="120" value={config.widthCm} onChange={(event) => setField('widthCm', event.target.value)} /><span>{t('studio.centimeters')}</span></span></label>
                  <span className="dimension-cross">×</span>
                  <label className="field-label">{t('studio.height')}<span className="input-unit-wrap"><input type="number" min="1" max="2000" inputMode="decimal" placeholder="60" value={config.heightCm} onChange={(event) => setField('heightCm', event.target.value)} /><span>{t('studio.centimeters')}</span></span></label>
                </div>
              </fieldset>
              <label className="field-label notes-field">{t('studio.notes')} <span className="optional-label">{t('studio.optional')}</span>
                <textarea rows={5} maxLength={2000} value={config.notes} onChange={(event) => setField('notes', event.target.value)} placeholder={t('studio.notesPlaceholder')} />
                <span className="field-help"><span className="character-count">{config.notes.length}/2000</span></span>
              </label>
              <div className="concept-callout">
                <div className="concept-callout-icon"><WandSparkles size={18} /></div>
                <div><strong>{clientConfig.aiMode === 'demo' ? t('studio.aiDemoBadge') : t('studio.generate')}</strong><p>{clientConfig.aiMode === 'demo' ? t('result.unavailableBody') : t('studio.aiApiCallout')}</p></div>
              </div>
              {validationMessage && <div className="validation-message" role="alert">{validationMessage}</div>}
              <div className="final-actions">
                <button type="button" className="button button-dark button-large" onClick={() => void prepareConcept()} disabled={busy || !state.photo?.file} aria-busy={busy}>
                  {busy ? <span className="spin-dot" /> : <Sparkles size={17} />}{busy ? t('ai.working') : t('studio.generate')}<ArrowRight size={16} />
                </button>
                <button type="button" className="button button-outline button-large" onClick={openQuote}>{t('studio.quote')}</button>
              </div>
            </div>
          )}

          {step !== 3 && validationMessage && <div className="validation-message" role="alert">{validationMessage}</div>}
          <div className={`studio-form-footer${step === 3 ? ' is-final' : ''}`}>
            {step > 1 ? <button className="button button-quiet" type="button" onClick={() => setStep(step - 1)}><ArrowLeft size={16} />{t('studio.back')}</button> : <span />}
            {step < 3 && <button className="button button-dark" type="button" onClick={nextStep}>{t('studio.continue')}<ArrowRight size={16} /></button>}
            {step === 3 && <Link className="text-link studio-edit-link" to="/professional">{t('nav.professional')}<ArrowRight size={15} /></Link>}
          </div>
        </section>
        <StudioSummary />
      </div>
    </div>
  );
}
