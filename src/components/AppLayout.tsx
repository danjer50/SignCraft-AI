import { Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useLanguage } from '../context/LanguageContext';
import { ErrorBoundary } from './ErrorBoundary';
import { PageSkeleton } from './PageSkeleton';
import { QuoteRequestDialog } from './QuoteRequestDialog';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import { QuoteDialogContext } from './QuoteDialogContext';

export function AppLayout() {
  const { saveState } = useProject();
  const { t } = useLanguage();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const location = useLocation();
  const openQuote = () => setQuoteOpen(true);
  const closeQuote = () => setQuoteOpen(false);

  return (
    <QuoteDialogContext.Provider value={openQuote}>
      <div className="app-shell">
        <SiteHeader onOpenQuote={openQuote} />
        {saveState === 'failed' && <div className="save-warning" role="alert">{t('save.failed')}</div>}
        <main id="main-content">
          {/* A route that throws (or a lazily loaded workspace chunk that fails) shows a
              recovery screen instead of unmounting the whole app into a white page. */}
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<div className="page-container page-pad"><PageSkeleton /></div>}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
        <SiteFooter />
        <ErrorBoundary resetKey={`${location.pathname}:quote`}>
          <QuoteRequestDialog open={quoteOpen} onClose={closeQuote} />
        </ErrorBoundary>
      </div>
    </QuoteDialogContext.Provider>
  );
}
