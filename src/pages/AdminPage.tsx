import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Boxes,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Cog,
  Gauge,
  KeyRound,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  UserRound,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo';
import { SafeImage } from '../components/SafeImage';
import { WorkspaceNote } from '../components/WorkspaceNote';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ADMIN_SECTION_IDS, sectionById, type AdminAccounts, type AdminOverview, type AdminSectionId } from '../domain/admin';
import { QUOTE_STATUSES, type QuoteRequest, type QuoteStatus } from '../domain/sign';
import { fetchAdminAccounts, fetchAdminOverview } from '../services/auth/adminClient';
import { getLocalQuoteRequests, updateLocalQuoteStatus } from '../services/quotes/quoteService';
import { isStorageAvailable } from '../services/draftStorage';

const SECTION_ICONS: Record<AdminSectionId, typeof Users> = {
  users: Users,
  proAccounts: KeyRound,
  customerProjects: Boxes,
  quoteRequests: ClipboardList,
  aiUsage: Gauge,
  websiteSettings: SlidersHorizontal,
  featureSettings: Cog,
  system: ShieldCheck,
};

/* ----------------------------------------------------------------------------------------------
 * Quote inbox — the existing admin feature, unchanged, now living in its own dashboard section.
 * --------------------------------------------------------------------------------------------- */
function QuoteInbox() {
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
    <div className="admin-inbox">
      <header className="admin-heading">
        <div><span className="eyebrow"><span className="eyebrow-line" />{t('admin.eyebrow')}</span><h2>{t('admin.title')}</h2><p>{t('admin.lead')}</p></div>
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
        <div className="admin-empty-state"><div className="admin-empty-icon"><ClipboardList size={24} /></div><h3>{t('admin.emptyTitle')}</h3><p>{t('admin.emptyBody')}</p><Link className="button button-dark" to="/studio">{t('admin.viewStudio')}<ArrowRight size={15} /></Link></div>
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
              <h3>{selected.business.name || selected.customer.name}</h3>
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

/* ----------------------------------------------------------------------------------------------
 * Admin console shell: the eight sections, their real state, and honest "not connected yet" copy.
 * --------------------------------------------------------------------------------------------- */
export function AdminPage() {
  const { t } = useLanguage();
  const { session, signOut } = useAuth();
  const [section, setSection] = useState<AdminSectionId>('quoteRequests');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [accounts, setAccounts] = useState<AdminAccounts | null>(null);
  const [consoleState, setConsoleState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  const load = useCallback(async () => {
    setConsoleState('loading');
    const [overviewResult, accountsResult] = await Promise.all([fetchAdminOverview(), fetchAdminAccounts()]);
    setOverview(overviewResult.status === 'OK' ? overviewResult.data : null);
    setAccounts(accountsResult.status === 'OK' ? accountsResult.data : null);
    // The inbox works from the browser even when the server console cannot be reached.
    setConsoleState(overviewResult.status === 'OK' ? 'ready' : 'unavailable');
  }, []);

  useEffect(() => { void load(); }, [load]);

  const readiness = (id: AdminSectionId) => sectionById(overview, id)?.state ?? 'foundation';
  const readinessLabel = (id: AdminSectionId) => {
    const state = readiness(id);
    return state === 'ready' ? t('admin.stateReady') : state === 'local-only' ? t('admin.stateLocal') : t('admin.stateFoundation');
  };
  const issues = overview?.sections.flatMap((entry) => entry.issues) ?? [];
  const proAccounts = accounts?.accounts.filter((account) => account.role === 'PRO') ?? [];
  const metricsOf = (id: AdminSectionId) => Object.entries(sectionById(overview, id)?.metrics ?? {});

  return (
    <div className="admin-page page-container page-pad">
      <Seo title={t('admin.dashboardTitle')} description={t('admin.dashboardLead')} noIndex />

      <header className="admin-console-heading">
        <div>
          <span className="eyebrow"><span className="eyebrow-line" />{t('admin.dashboardEyebrow')}</span>
          <h1>{t('admin.dashboardTitle')}</h1>
          <p>{t('admin.dashboardLead')}</p>
        </div>
        <div className="admin-console-side">
          <span className="admin-account-chip"><ShieldCheck size={15} aria-hidden="true" />{session?.account.username || session?.account.email || '—'}<em>{session ? t(`role.${session.account.role}`) : ''}</em></span>
          <div className="admin-console-actions">
            <button className="button button-dark button-small" type="button" onClick={() => void load()}><RefreshCw size={15} />{t('admin.refresh')}</button>
            <button className="button button-quiet button-small" type="button" onClick={() => void signOut()}>{t('access.signOut')}</button>
          </div>
        </div>
      </header>

      {consoleState === 'loading' && <p className="admin-console-note" role="status">{t('admin.loadingConsole')}</p>}
      {consoleState === 'unavailable' && (
        <div className="admin-warning is-error" role="alert"><CircleAlert size={18} /><p>{t('admin.consoleUnavailable')}</p></div>
      )}

      <nav className="admin-sections" aria-label={t('admin.dashboardTitle')}>
        {ADMIN_SECTION_IDS.map((id) => {
          const Icon = SECTION_ICONS[id];
          return (
            <button
              key={id}
              className={`admin-section-button${section === id ? ' is-active' : ''}`}
              type="button"
              aria-current={section === id ? 'true' : undefined}
              onClick={() => setSection(id)}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{t(`admin.section.${id}`)}</span>
              <em className={`admin-section-state is-${readiness(id)}`}>{readinessLabel(id)}</em>
            </button>
          );
        })}
      </nav>

      <div className="admin-section-body">
        {section === 'quoteRequests' && <QuoteInbox />}

        {(section === 'users' || section === 'proAccounts') && (
          <section className="admin-panel">
            <h2>{t(section === 'users' ? 'admin.section.users' : 'admin.section.proAccounts')}</h2>
            {accounts && accounts.accounts.length > 0 ? (
              <ul className="admin-account-list">
                {(section === 'users' ? accounts.accounts : proAccounts).map((account) => (
                  <li className="admin-account-row" key={account.id}>
                    <span className="admin-account-name"><UserRound size={16} aria-hidden="true" />{account.username || account.email || account.id}</span>
                    <span className="admin-account-meta">{account.email}</span>
                    <span className="status-chip status-active">{t(`role.${account.role}`)}</span>
                    <span className="admin-account-status">{account.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-panel-empty">{t('admin.noAccounts')}</p>
            )}

            <div className="admin-prepared-actions">
              <span className="eyebrow">{t('admin.preparedActions')}</span>
              <div className="admin-action-row">
                {[t('admin.actionCreate'), t('admin.actionEdit'), t('admin.actionSuspend'), t('admin.actionRemove')].map((label) => (
                  <button className="button button-outline button-small" type="button" key={label} disabled title={t('admin.writeStorePending')}>{label}</button>
                ))}
              </div>
              <p className="admin-panel-note">{t('admin.writeStorePending')}</p>
            </div>

            {accounts && accounts.issues.length > 0 && (
              <div className="admin-issue-list" role="status">
                <span className="eyebrow">{t('admin.issuesTitle')}</span>
                {accounts.issues.map((issue) => <p key={issue}><CircleAlert size={14} aria-hidden="true" />{issue}</p>)}
              </div>
            )}
          </section>
        )}

        {section === 'customerProjects' && (
          <section className="admin-panel">
            <h2>{t('admin.section.customerProjects')}</h2>
            <p className="admin-panel-note">{t('admin.projectsPending')}</p>
            <ul className="admin-metric-list">
              {metricsOf('customerProjects').map(([key, value]) => <li key={key}><span>{key}</span><strong>{String(value)}</strong></li>)}
            </ul>
          </section>
        )}

        {section === 'aiUsage' && (
          <section className="admin-panel">
            <h2>{t('admin.section.aiUsage')}</h2>
            <p className="admin-panel-note">{t('admin.aiPending')}</p>
            <ul className="admin-metric-list">
              {metricsOf('aiUsage').map(([key, value]) => <li key={key}><span>{key}</span><strong>{String(value)}</strong></li>)}
            </ul>
          </section>
        )}

        {(section === 'websiteSettings' || section === 'featureSettings') && (
          <section className="admin-panel">
            <h2>{t(section === 'websiteSettings' ? 'admin.section.websiteSettings' : 'admin.section.featureSettings')}</h2>
            <p className="admin-panel-note">{t('admin.settingsPending')}</p>
            <ul className="admin-metric-list">
              {metricsOf(section).map(([key, value]) => (
                <li key={key}>
                  <span>{key}</span>
                  <strong>{typeof value === 'boolean' ? (value ? <CircleCheck size={15} aria-hidden="true" /> : <CircleAlert size={15} aria-hidden="true" />) : String(value)}</strong>
                </li>
              ))}
            </ul>
          </section>
        )}

        {section === 'system' && (
          <section className="admin-panel">
            <h2>{t('admin.systemTitle')}</h2>
            <ul className="admin-metric-list">
              {metricsOf('system').map(([key, value]) => (
                <li key={key}>
                  <span>{key}</span>
                  <strong>{typeof value === 'boolean' ? (value ? <CircleCheck size={15} aria-hidden="true" /> : <CircleAlert size={15} aria-hidden="true" />) : String(value)}</strong>
                </li>
              ))}
            </ul>
            <div className="admin-issue-list" role="status">
              <span className="eyebrow">{t('admin.issuesTitle')}</span>
              {issues.length === 0
                ? <p className="admin-panel-ok"><CircleCheck size={14} aria-hidden="true" />{t('admin.noIssues')}</p>
                : issues.map((issue) => <p key={issue}><CircleAlert size={14} aria-hidden="true" />{issue}</p>)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
