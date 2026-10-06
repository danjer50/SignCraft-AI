import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, CircleAlert, ClipboardList, Mail, Phone, Store, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo';
import { SafeImage } from '../components/SafeImage';
import { WorkspaceNote } from '../components/WorkspaceNote';
import { useLanguage } from '../context/LanguageContext';
import { QUOTE_STATUSES, type QuoteRequest, type QuoteStatus } from '../domain/sign';
import { getLocalQuoteRequests, updateLocalQuoteStatus } from '../services/quotes/quoteService';
import { isStorageAvailable } from '../services/draftStorage';

export function AdminPage() {
  const { t, locale } = useLanguage();
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [filter, setFilter] = useState<QuoteStatus | 'ALL'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const localeTag = locale === 'fr' ? 'fr-TN' : locale === 'ar' ? 'ar-TN' : 'en-US';

  useEffect(() => {
    // Local storage can be blocked (private mode, quota): report it instead of showing an
    // inbox that silently stays empty.
    const refresh = () => {
      setStorageOk(isStorageAvailable());
      setRequests(getLocalQuoteRequests());
    };
    refresh();
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  const visibleRequests = useMemo(() => requests.filter((request) => filter === 'ALL' || request.status === filter), [requests, filter]);
  const selected = visibleRequests.find((request) => request.id === selectedId) ?? null;
  const materialsLabel = (request: QuoteRequest) => {
    const materials = request.signConfiguration.materials;
    if (!Array.isArray(materials) || materials.length === 0) return t('result.materialsNone');
    return materials.map((material) => t(`material.${material}`)).join(' · ');
  };
  const changeStatus = (id: string, status: QuoteStatus) => {
    updateLocalQuoteStatus(id, status);
    setRequests(getLocalQuoteRequests());
  };

  return (
    <div className="admin-page page-container page-pad">
      <Seo title="Gestion des demandes" description="Gestion locale de démonstration des demandes de projets SignCraft AI." noIndex />
      <header className="admin-heading">
        <div><span className="eyebrow"><span className="eyebrow-line" />{t('admin.eyebrow')}</span><h1>{t('admin.title')}</h1><p>{t('admin.lead')}</p></div>
        <div className="admin-total-card"><span className="admin-total-icon"><ClipboardList size={19} /></span><span className="admin-total-value">{requests.length.toString().padStart(2, '0')}</span><span>{t('admin.total')}</span></div>
      </header>

      <WorkspaceNote />
      <div className="admin-warning"><CircleAlert size={18} /><p>{t('admin.localWarning')}</p></div>
      {!storageOk && <div className="admin-warning is-error" role="alert"><CircleAlert size={18} /><p>{t('quote.storageBody')}</p></div>}

      <div className="admin-toolbar">
        <div className="admin-toolbar-title"><span className="eyebrow">INBOX · {visibleRequests.length.toString().padStart(2, '0')}</span><strong>{t('admin.title')}</strong></div>
        <label className="admin-filter"><span>{t('admin.status')}</span><span className="admin-filter-select"><select value={filter} onChange={(event) => setFilter(event.target.value as QuoteStatus | 'ALL')}><option value="ALL">{t('admin.filterAll')}</option>{QUOTE_STATUSES.map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}</select><ChevronDown size={14} /></span></label>
      </div>

      {visibleRequests.length === 0 ? (
        <div className="admin-empty-state"><div className="admin-empty-icon"><ClipboardList size={24} /></div><h2>{t('admin.emptyTitle')}</h2><p>{t('admin.emptyBody')}</p><Link className="button button-dark" to="/studio">{t('admin.viewStudio')}<ArrowRight size={15} /></Link></div>
      ) : (
        <div className="admin-workspace-grid">
          <div className="request-list">
            {visibleRequests.map((request) => (
              <article className={`request-row${selectedId === request.id ? ' is-active' : ''}`} key={request.id}>
                <button className="request-row-main" type="button" onClick={() => setSelectedId(selectedId === request.id ? null : request.id)} aria-expanded={selectedId === request.id}>
                  <span className="request-avatar"><UserRound size={17} /></span>
                  <span className="request-row-copy"><strong>{request.business.name || request.customer.name}</strong><span>{request.customer.name} · {t(`sign.${request.signConfiguration.signType}`)}</span></span>
                  <span className={`status-chip status-${request.status.toLowerCase()}`}>{t(`status.${request.status}`)}</span>
                </button>
                <div className="request-row-meta"><span>{new Date(request.createdAt).toLocaleDateString(localeTag)}</span><span>{t('admin.localBadge')}</span></div>
                {selectedId === request.id && (
                  <div className="request-inline-details">
                    <span><Mail size={14} />{request.customer.email}</span><span><Phone size={14} />{request.customer.phone}</span>
                    <label>{t('admin.changeStatus')}<select value={request.status} onChange={(event) => changeStatus(request.id, event.target.value as QuoteStatus)}>{QUOTE_STATUSES.map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}</select></label>
                  </div>
                )}
              </article>
            ))}
          </div>
          {selected && (
            <aside className="request-detail-panel">
              <div className="request-detail-top"><span className="eyebrow">REQUEST · {selected.id.slice(0, 8).toUpperCase()}</span><span className="local-only-pill">{t('admin.localBadge')}</span></div>
              {selected.imageReference?.previewDataUrl ? <SafeImage className="request-detail-image" src={selected.imageReference.previewDataUrl} alt={t('admin.photoReference')} compact /> : <div className="request-no-image"><Store size={20} /><span>{t('admin.noPhoto')}</span></div>}
              <h2>{selected.business.name || selected.customer.name}</h2>
              <div className="request-detail-contact"><span><UserRound size={14} />{selected.customer.name}</span><a href={`mailto:${encodeURIComponent(selected.customer.email)}`}><Mail size={14} />{selected.customer.email}</a><a href={`tel:${encodeURIComponent(selected.customer.phone)}`}><Phone size={14} />{selected.customer.phone}</a></div>
              <div className="request-detail-rule" />
              <div className="request-detail-line"><span>{t('studio.category')}</span><strong>{t(`category.${selected.business.category}`)}</strong></div>
              <div className="request-detail-line"><span>{t('studio.signType')}</span><strong>{t(`sign.${selected.signConfiguration.signType}`)}</strong></div>
              <div className="request-detail-line"><span>{t('studio.style')}</span><strong>{t(`style.${selected.signConfiguration.style}`)}</strong></div>
              <div className="request-detail-line"><span>{t('result.materials')}</span><strong>{materialsLabel(selected)}</strong></div>
              <div className="request-detail-line"><span>{t('studio.lighting')}</span><strong>{t(`lighting.${selected.signConfiguration.lighting}`)}</strong></div>
              <div className="request-detail-line"><span>{t('studio.dimensions')}</span><strong>{selected.signConfiguration.widthCm || '—'} × {selected.signConfiguration.heightCm || '—'} {t('studio.centimeters')}</strong></div>
              <div className="request-detail-text"><span>{t('studio.exactText')}</span><strong dir="auto">{selected.signConfiguration.exactText || selected.business.name}</strong></div>
              {selected.signConfiguration.notes && <p className="request-detail-notes">{selected.signConfiguration.notes}</p>}
              <label className="request-status-control">{t('admin.changeStatus')}<select value={selected.status} onChange={(event) => changeStatus(selected.id, event.target.value as QuoteStatus)}>{QUOTE_STATUSES.map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}</select></label>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
