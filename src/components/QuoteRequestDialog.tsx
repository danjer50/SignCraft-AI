import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, CircleAlert, X } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useLanguage } from '../context/LanguageContext';
import type { QuoteCustomer, QuoteRequest } from '../domain/sign';
import { createRequestId, submitQuoteRequest, type QuoteDeliveryResult } from '../services/quotes/quoteService';
import { clientConfig } from '../services/config';

interface QuoteRequestDialogProps {
  open: boolean;
  onClose: () => void;
}

const emptyCustomer: QuoteCustomer = { name: '', email: '', phone: '' };

export function QuoteRequestDialog({ open, onClose }: QuoteRequestDialogProps) {
  const { state, updateConfiguration } = useProject();
  const { t } = useLanguage();
  const [customer, setCustomer] = useState(emptyCustomer);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteDeliveryResult | null>(null);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCustomer(emptyCustomer);
    setConsent(false);
    setBusy(false);
    setResult(null);
    setError('');
    const timer = window.setTimeout(() => nameRef.current?.focus(), 40);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const photo = state.photo;
    const currentConcept = state.lastConcept;
    const quoteConfiguration = {
      ...state.configuration,
      exactText: state.configuration.exactText.trim() ? state.configuration.exactText : state.configuration.businessName.trim(),
    };
    const request: QuoteRequest = {
      id: createRequestId(),
      createdAt: new Date().toISOString(),
      status: 'NEW',
      deliveryState: 'LOCAL_DRAFT',
      customer,
      business: {
        name: quoteConfiguration.businessName.trim(),
        category: quoteConfiguration.category,
      },
      signConfiguration: quoteConfiguration,
      imageReference: photo ? {
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        transferState: 'LOCAL_ONLY',
        previewDataUrl: photo.previewDataUrl,
      } : null,
      conceptReference: currentConcept ? {
        status: currentConcept.status,
        providerId: currentConcept.providerId,
        sourceImageTransfer: currentConcept.sourceImageTransfer,
        createdAt: currentConcept.createdAt,
        ...(currentConcept.status !== 'GENERATED' ? { message: currentConcept.message } : {}),
      } : { status: 'NOT_GENERATED', providerId: 'none' },
    };
    try {
      const submission = await submitQuoteRequest(request, photo?.file);
      setResult(submission);
    } catch {
      setError(t('quote.storageBody'));
    } finally {
      setBusy(false);
    }
  };

  const materialsSummary = state.configuration.materials.length === 0
    ? t('result.materialsNone')
    : state.configuration.materials.map((material) => t(`material.${material}`)).join(' · ');
  const confirmed = result?.state === 'CONFIRMED';
  const localStorageFailed = result?.state === 'LOCAL_DRAFT' && result.reason === 'LOCAL_STORAGE_UNAVAILABLE';
  const localMessage = result?.state === 'LOCAL_DRAFT' && result.reason === 'DELIVERY_UNAVAILABLE'
    ? t('quote.apiFallbackBody')
    : t('quote.localBody');

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="quote-dialog" role="dialog" aria-modal="true" aria-labelledby="quote-dialog-title">
        <button className="icon-button modal-close" type="button" onClick={onClose} aria-label={t('quote.close')}><X size={19} /></button>
        {!result ? (
          <>
            <span className="eyebrow">{t('quote.contactTitle')}</span>
            <h2 id="quote-dialog-title">{t('quote.dialogTitle')}</h2>
            <p className="quote-dialog-lead">{t('quote.dialogBody')}</p>
            <div className="quote-brief-chip"><span className="privacy-dot" /><span>{clientConfig.quoteMode === 'api' ? t('quote.formHintApi') : t('quote.formHint')}</span></div>
            <div className="quote-brief-summary">
              <span><i>{t('studio.signType')}</i><strong>{t(`sign.${state.configuration.signType}`)}</strong></span>
              <span><i>{t('result.materials')}</i><strong>{materialsSummary}</strong></span>
              <span><i>{t('studio.style')}</i><strong>{t(`style.${state.configuration.style}`)}</strong></span>
            </div>
            <form className="quote-form" onSubmit={submit}>
              <label className="field-label">
                {t('quote.name')} <span className="required-mark">*</span>
                <input ref={nameRef} required minLength={2} maxLength={120} autoComplete="name" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} />
              </label>
              <label className="field-label">
                {t('quote.email')} <span className="required-mark">*</span>
                <input required type="email" maxLength={254} autoComplete="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} />
              </label>
              <label className="field-label">
                {t('quote.phone')} <span className="required-mark">*</span>
                <input required type="tel" minLength={6} maxLength={32} autoComplete="tel" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} />
              </label>
              <label className="field-label">
                {t('studio.businessName')} <span className="required-mark">*</span>
                <input required type="text" minLength={2} maxLength={120} autoComplete="organization" value={state.configuration.businessName} placeholder={t('studio.businessNamePlaceholder')} onChange={(event) => updateConfiguration('businessName', event.target.value)} />
              </label>
              <label className="consent-field">
                <input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>{t('quote.consent')}</span>
              </label>
              {error && <p className="field-error" role="alert">{error}</p>}
              <div className="dialog-actions">
                <button className="button button-quiet" type="button" onClick={onClose}>{t('quote.cancel')}</button>
                <button className="button button-dark" type="submit" disabled={busy}>
                  {busy ? <span className="spin-dot" /> : null}{busy ? t('quote.sending') : t('quote.submit')}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="quote-result" aria-live="polite">
            <span className={`quote-result-icon${confirmed ? ' is-confirmed' : ''}`}>
              {confirmed ? <Check size={25} /> : localStorageFailed ? <CircleAlert size={25} /> : <Check size={25} />}
            </span>
            <span className="eyebrow">SIGNCRAFT · {result.requestId.slice(0, 8).toUpperCase()}</span>
            <h2 id="quote-dialog-title">{confirmed ? t('quote.confirmedTitle') : localStorageFailed ? t('quote.storageBody') : t('quote.localTitle')}</h2>
            <p>{confirmed ? t('quote.confirmedBody') : localStorageFailed ? t('quote.storageBody') : localMessage}</p>
            {result.state === 'LOCAL_DRAFT' && !localStorageFailed && <div className="local-draft-receipt"><span>{t('admin.localBadge')}</span><code>{result.requestId.slice(0, 12)}</code></div>}
            <button className="button button-dark dialog-done" type="button" onClick={onClose}>{t('quote.close')}</button>
          </div>
        )}
      </section>
    </div>
  );
}
