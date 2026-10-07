import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleHelp, History, Languages, Lightbulb, PanelsTopLeft, Sparkles, WandSparkles } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { BusinessCategory, LightingType, SignStyle, SignType, StringConfigurationKey } from '../domain/sign';
import { BUSINESS_CATEGORIES, LIGHTING_TYPES, SIGN_STYLES, SIGN_TYPES } from '../domain/sign';
import {
  CUSTOMER_FLOW_STEP_COUNT,
  CUSTOMER_FLOW_STEPS,
  STEP_BODY_KEYS,
  STEP_LABEL_KEYS,
  STEP_TITLE_KEYS,
  clampStep,
  furthestReachableStep,
  generationBlockingMessageKey,
  parseStepParam,
  stepBlockingMessageKey,
  type CustomerFlowStep,
} from '../domain/customerFlow';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';
import { Seo } from '../components/Seo';
import { PhotoUploadField } from '../components/PhotoUploadField';
import { SignAreaMarker } from '../components/SignAreaMarker';
import { MaterialPicker } from '../components/MaterialPicker';
import { SignTypeArt } from '../components/SignTypeArt';
import { StyleArt } from '../components/StyleArt';
import { OptionalDetails } from '../components/OptionalDetails';
import { GenerationProgress } from '../components/GenerationProgress';
import { SafeImage } from '../components/SafeImage';
import { generateStorefrontConcept } from '../services/ai';
import { clientConfig } from '../services/config';
import { photoPrivacyMessageKey } from '../services/ai/presentation';

const swatches = ['#f2b878', '#e8eef1', '#c98f63', '#4d8f80', '#a45b45', '#445a7a', '#829b91', '#f3bb42'];

const ARABIC_SCRIPT_PATTERN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_LETTER_PATTERN = /[A-Za-zÀ-ÖØ-öø-ÿ]/;

/**
 * "Style" doubles as the typography-language choice (arabic / french / arabicFrench), but the
 * text actually rendered comes from a different step's exact-text field. Picking "Arabic +
 * French" does not, by itself, translate or combine anything — the customer still has to type
 * both scripts together there. This flags the likely mismatch instead of silently sending a
 * single-language string to a style that expects two.
 */
function styleTextLooksMismatched(style: SignStyle, text: string): boolean {
  const hasArabic = ARABIC_SCRIPT_PATTERN.test(text);
  const hasLatin = LATIN_LETTER_PATTERN.test(text);
  if (style === 'arabicFrench') return !text || !hasArabic || !hasLatin;
  if (style === 'arabic') return !text || !hasArabic;
  return false;
}

function StepHeading({ step, title, body }: { step: number; title: string; body?: string }) {
  return (
    <div className="step-section-heading">
      <span className="step-section-number">{String(step).padStart(2, '0')}</span>
      <div><h2>{title}</h2>{body && <p>{body}</p>}</div>
    </div>
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
        <div className="summary-photo">
          <SafeImage src={state.photo.previewUrl} alt={t('studio.summaryPhoto')} compact />
          <span><span className="summary-photo-dot" />{t('studio.summaryPhoto')}</span>
        </div>
      ) : <div className="summary-photo-empty"><span className="summary-photo-icon"><PanelsTopLeft size={21} /></span><span>{t('studio.summaryNoPhoto')}</span></div>}
      <div className="summary-business"><span className="summary-label">{t('studio.businessName')}</span><strong>{businessLabel}</strong><span className="summary-category">{t(`category.${config.category}`)}</span></div>
      <div className="summary-divider" />
      <div className="summary-detail-row"><span>{t('studio.signType')}</span><strong>{t(`sign.${config.signType}`)}</strong></div>
      <div className="summary-detail-row"><span>{t('studio.style')}</span><strong>{t(`style.${config.style}`)}</strong></div>
      <div className="summary-detail-row summary-materials-row">
        <span>{t('studio.materials')}</span>
        <strong className="summary-materials">
          {config.materials.length === 0
            ? t('studio.summaryNotSet')
            : config.materials.map((material) => t(`material.${material}`)).join(' · ')}
        </strong>
      </div>
      <div className="summary-detail-row"><span>{t('studio.lighting')}</span><strong>{t(`lighting.${config.lighting}`)}</strong></div>
      <div className="summary-detail-row summary-colour-row"><span>{t('studio.colors')}</span><span className="summary-colour-value"><i style={{ background: config.color }} />{config.color}</span></div>
      <div className="summary-divider" />
      <div className="summary-text-block"><span className="summary-label">{t('studio.summaryText')}</span><strong dir="auto">{visibleText}</strong></div>
      {(config.widthCm || config.heightCm) && <div className="summary-dimensions"><span>{config.widthCm || '—'} × {config.heightCm || '—'} {t('studio.centimeters')}</span></div>}
      <div className="summary-privacy"><span className="privacy-dot" /><div><strong>{t('studio.privacyTitle')}</strong><p>{photoPrivacyBody}</p></div></div>
      {clientConfig.aiMode === 'demo' && <div className="summary-ai-status"><span className="status-offline-dot" />{t('studio.aiDemoBadge')}</div>}
      <div className="summary-flow-note">{t('studio.flowReminder')}</div>
    </aside>
  );
}

export function StudioPage() {
  const { t } = useLanguage();
  const { state, updateConfiguration, setConcept, setStep: persistStep, resetProject, toggleMaterial } = useProject();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const generationLock = useRef(false);

  const config = state.configuration;
  const flowState = { configuration: config, photo: state.photo };
  const urlStep = parseStepParam(searchParams.get('step'));
  const step = clampStep(urlStep ?? state.step);
  const stepId: CustomerFlowStep = CUSTOMER_FLOW_STEPS[step - 1];
  const allowedSteps = Math.max(step, furthestReachableStep(flowState));

  // A shared or reloaded ?step= URL becomes the recoverable position for the next visit.
  useEffect(() => {
    if (urlStep !== null && urlStep !== state.step) persistStep(urlStep);
  }, [urlStep, state.step, persistStep]);

  const goToStep = (next: number) => {
    const target = clampStep(next);
    setValidationMessage('');
    persistStep(target);
    setSearchParams(target === 1 ? {} : { step: String(target) });
  };

  const setField = (key: StringConfigurationKey, value: string) => updateConfiguration(key, value);

  const nextStep = () => {
    const blocking = stepBlockingMessageKey(step, flowState);
    if (blocking) {
      setValidationMessage(t(blocking));
      return;
    }
    if (step >= CUSTOMER_FLOW_STEP_COUNT) return;
    goToStep(step + 1);
  };

  const prepareConcept = async () => {
    if (generationLock.current || busy) return;
    const blocking = generationBlockingMessageKey(flowState);
    const photoFile = state.photo?.file;
    if (blocking || !photoFile) {
      setValidationMessage(t(blocking ?? 'studio.needPhoto'));
      return;
    }
    generationLock.current = true;
    setBusy(true);
    setValidationMessage('');
    try {
      const result = await generateStorefrontConcept({ sourceImage: photoFile, configuration: config });
      setConcept(result);
      navigate('/result');
    } catch {
      // The client normally resolves with an honest error result; this keeps a thrown
      // network/runtime failure from leaving the customer on a frozen screen.
      setConcept({
        status: 'ERROR',
        providerId: 'signcraft-ai-client',
        errorCode: 'AI_NETWORK_ERROR',
        message: 'The connection ended before a generation result could be confirmed.',
        createdAt: new Date().toISOString(),
        sourceImageTransfer: 'UNKNOWN',
      });
      navigate('/result');
    } finally {
      generationLock.current = false;
      setBusy(false);
    }
  };

  const startOver = () => {
    resetProject();
    setConfirmReset(false);
    setValidationMessage('');
    setSearchParams({});
  };

  const stepNumber = t('studio.stepNumber')
    .replace('{current}', String(step))
    .replace('{total}', String(CUSTOMER_FLOW_STEP_COUNT));

  return (
    <div className="studio-page page-container page-pad">
      <Seo title="Studio de conception" description="Photo, nom, type d’enseigne, style et matières : un parcours simple jusqu’au concept et à la demande de devis." />
      <div className="studio-page-heading">
        <div><span className="eyebrow"><span className="eyebrow-line" />{t('studio.eyebrow')}</span><h1>{t('studio.title')}</h1><p>{t('studio.lead')}</p></div>
        <div className="studio-heading-meta"><span className="studio-step-count">{stepNumber}</span><span className="studio-heading-code">PROJECT · {state.id.slice(0, 6).toUpperCase()}</span></div>
      </div>

      <div className="studio-progress" aria-label={stepNumber}>
        {CUSTOMER_FLOW_STEPS.map((flowStep, index) => {
          const itemStep = index + 1;
          const reachable = itemStep <= allowedSteps;
          return (
            <button
              key={flowStep}
              className={`progress-step${step === itemStep ? ' is-current' : ''}${step > itemStep ? ' is-complete' : ''}`}
              onClick={() => reachable && itemStep !== step && goToStep(itemStep)}
              type="button"
              aria-current={step === itemStep ? 'step' : undefined}
              disabled={!reachable || itemStep === step}
            >
              <span className="progress-number">{step > itemStep ? <Check size={15} /> : String(itemStep).padStart(2, '0')}</span>
              <span className="progress-label">{t(STEP_LABEL_KEYS[flowStep])}</span>
            </button>
          );
        })}
        <span className="progress-track"><i style={{ width: `${((step - 1) / (CUSTOMER_FLOW_STEP_COUNT - 1)) * 100}%` }} /></span>
      </div>

      <div className="studio-layout">
        <section className="studio-form-panel" aria-busy={busy}>
          {busy ? (
            <GenerationProgress />
          ) : (
            <>
              {stepId === 'photo' && (
                <div className="studio-step-content">
                  <StepHeading step={1} title={t(STEP_TITLE_KEYS.photo)} body={t(STEP_BODY_KEYS.photo)} />
                  {state.restoredFromDraft && !state.photo?.file && (
                    <div className="draft-restored" role="status">
                      <History size={16} />
                      <div><strong>{t('studio.draftRestored')}</strong><p>{t('studio.draftRestoredBody')}</p></div>
                    </div>
                  )}
                  <PhotoUploadField />
                  {state.photo?.file && <SignAreaMarker />}
                </div>
              )}

              {stepId === 'business' && (
                <div className="studio-step-content">
                  <StepHeading step={2} title={t(STEP_TITLE_KEYS.business)} body={t(STEP_BODY_KEYS.business)} />
                  <label className="field-label">{t('studio.businessName')} <span className="required-mark">*</span>
                    <input type="text" maxLength={120} value={config.businessName} onChange={(event) => setField('businessName', event.target.value)} placeholder={t('studio.businessNamePlaceholder')} autoComplete="organization" />
                  </label>
                  <OptionalDetails label={t('studio.moreOptions')}>
                    <label className="field-label exact-text-label">{t('studio.exactText')} <span className="optional-label">{t('studio.optional')}</span>
                      <input type="text" dir="auto" maxLength={180} value={config.exactText} onChange={(event) => setField('exactText', event.target.value)} placeholder={t('studio.exactTextPlaceholder')} />
                      <span className="field-help">{t('studio.exactTextFallback')} <span className="character-count">{config.exactText.length}/180</span></span>
                    </label>
                    <label className="field-label">{t('studio.category')}
                      <select value={config.category} onChange={(event) => setField('category', event.target.value as BusinessCategory)}>
                        {BUSINESS_CATEGORIES.map((category) => <option key={category} value={category}>{t(`category.${category}`)}</option>)}
                      </select>
                    </label>
                  </OptionalDetails>
                </div>
              )}

              {stepId === 'signType' && (
                <div className="studio-step-content">
                  <StepHeading step={3} title={t(STEP_TITLE_KEYS.signType)} body={t(STEP_BODY_KEYS.signType)} />
                  <fieldset className="choice-fieldset"><legend>{t('studio.signType')}</legend><div className="sign-type-grid">
                    {SIGN_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={`sign-type-card${config.signType === type ? ' is-selected' : ''}`}
                        onClick={() => setField('signType', type as SignType)}
                        aria-pressed={config.signType === type}
                      >
                        <SignTypeArt type={type} />
                        <span className="sign-type-label">{t(`sign.${type}`)}</span>
                        {config.signType === type && <Check className="selected-check" size={15} />}
                      </button>
                    ))}
                  </div></fieldset>
                  <OptionalDetails label={t('studio.moreOptions')}>
                    <fieldset className="choice-fieldset"><legend>{t('studio.lighting')}</legend><div className="lighting-options">
                      {LIGHTING_TYPES.map((lighting) => (
                        <button key={lighting} type="button" className={`lighting-option${config.lighting === lighting ? ' is-selected' : ''}`} onClick={() => setField('lighting', lighting as LightingType)} aria-pressed={config.lighting === lighting}>
                          <Lightbulb size={15} />{t(`lighting.${lighting}`)}
                        </button>
                      ))}
                    </div></fieldset>
                  </OptionalDetails>
                </div>
              )}

              {stepId === 'style' && (
                <div className="studio-step-content">
                  <StepHeading step={4} title={t(STEP_TITLE_KEYS.style)} body={t(STEP_BODY_KEYS.style)} />
                  <fieldset className="choice-fieldset style-fieldset"><legend>{t('studio.style')}</legend><div className="style-card-grid">
                    {SIGN_STYLES.map((style) => (
                      <button type="button" key={style} className={`style-card${config.style === style ? ' is-selected' : ''}`} onClick={() => setField('style', style as SignStyle)} aria-pressed={config.style === style}>
                        <StyleArt style={style} />
                        <span className="style-card-label">{t(`style.${style}`)}</span>
                        {config.style === style && <Check className="selected-check" size={14} />}
                      </button>
                    ))}
                  </div></fieldset>
                  {(config.style === 'arabic' || config.style === 'arabicFrench') && (
                    <div className={`style-text-reminder${styleTextLooksMismatched(config.style, (config.exactText || config.businessName).trim()) ? ' is-warning' : ''}`} role="note">
                      <span className="style-text-reminder-icon"><Languages size={16} /></span>
                      <div>
                        <strong>{t('studio.styleTextReminderTitle')}</strong>
                        <p>{t(config.style === 'arabicFrench' ? 'studio.styleTextReminderBilingual' : 'studio.styleTextReminderArabic')}</p>
                        <p className="style-text-reminder-current">
                          {t('studio.styleTextReminderCurrent')} <bdi>{(config.exactText || config.businessName).trim() || '—'}</bdi>
                        </p>
                        <button type="button" className="button button-quiet button-small" onClick={() => goToStep(2)}>{t('studio.styleTextReminderEdit')}</button>
                      </div>
                    </div>
                  )}
                  <fieldset className="choice-fieldset"><legend>{t('studio.colors')}</legend><div className="color-picker-row">
                    {swatches.map((color) => (
                      <button key={color} className={`color-swatch${config.color.toLowerCase() === color ? ' is-selected' : ''}`} style={{ '--swatch-color': color } as React.CSSProperties} type="button" onClick={() => setField('color', color)} aria-label={color} aria-pressed={config.color.toLowerCase() === color}>
                        <span className="sr-only">{color}</span>
                      </button>
                    ))}
                    <label className="custom-color-picker" title={t('studio.colors')}><input type="color" value={config.color} onChange={(event) => setField('color', event.target.value)} aria-label={t('studio.colors')} /><span>+</span></label>
                  </div></fieldset>
                </div>
              )}

              {stepId === 'materials' && (
                <div className="studio-step-content">
                  <StepHeading step={5} title={t(STEP_TITLE_KEYS.materials)} body={t(STEP_BODY_KEYS.materials)} />
                  <div className={`advise-card${config.materials.includes('unsure') ? ' is-active' : ''}`}>
                    <div className="advise-card-copy">
                      <span className="advise-card-icon"><WandSparkles size={17} /></span>
                      <div>
                        <strong>{t('studio.adviseTitle')}</strong>
                        <p>{config.materials.includes('unsure') ? t('studio.adviseActive') : t('studio.adviseBody')}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`button ${config.materials.includes('unsure') ? 'button-outline' : 'button-primary'} button-small`}
                      onClick={() => toggleMaterial('unsure')}
                      aria-pressed={config.materials.includes('unsure')}
                    >
                      {t('studio.adviseAction')}
                    </button>
                  </div>
                  <MaterialPicker />
                  <OptionalDetails label={t('studio.moreOptions')}>
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
                  </OptionalDetails>

                  <div className="concept-callout">
                    <div className="concept-callout-icon"><WandSparkles size={18} /></div>
                    <div><strong>{clientConfig.aiMode === 'demo' ? t('studio.aiDemoBadge') : t('studio.generate')}</strong><p>{clientConfig.aiMode === 'demo' ? t('result.unavailableBody') : t('studio.aiApiCallout')}</p></div>
                  </div>
                  {validationMessage && <div className="validation-message" role="alert">{validationMessage}</div>}
                  <div className="final-actions">
                    <button type="button" className="button button-dark button-large" onClick={() => void prepareConcept()} disabled={busy} aria-busy={busy}>
                      {busy ? <span className="spin-dot" /> : <Sparkles size={17} />}{busy ? t('ai.working') : t('studio.generate')}<ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              )}

              {stepId !== 'materials' && validationMessage && <div className="validation-message" role="alert">{validationMessage}</div>}
              <div className={`studio-form-footer${stepId === 'materials' ? ' is-final' : ''}`}>
                {step > 1
                  ? <button className="button button-quiet" type="button" onClick={() => goToStep(step - 1)} disabled={busy}><ArrowLeft size={16} />{t('studio.back')}</button>
                  : (
                    <div className="studio-reset">
                      {confirmReset ? (
                        <span className="studio-reset-confirm" role="group" aria-label={t('studio.startOverConfirm')}>
                          <span>{t('studio.startOverConfirm')}</span>
                          <button className="button button-outline button-small" type="button" onClick={startOver}>{t('common.confirm')}</button>
                          <button className="button button-quiet button-small" type="button" onClick={() => setConfirmReset(false)}>{t('common.cancel')}</button>
                        </span>
                      ) : (
                        <button className="button button-quiet button-small" type="button" onClick={() => setConfirmReset(true)} disabled={busy}>
                          <History size={15} />{t('studio.startOver')}
                        </button>
                      )}
                    </div>
                  )}
                {step < CUSTOMER_FLOW_STEP_COUNT && (
                  <button className="button button-dark" type="button" onClick={nextStep} disabled={busy}>{t('studio.continue')}<ArrowRight size={16} /></button>
                )}
              </div>
            </>
          )}
        </section>
        <StudioSummary />
      </div>
    </div>
  );
}
