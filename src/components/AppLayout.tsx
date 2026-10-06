import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { QuoteRequestDialog } from './QuoteRequestDialog';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import { QuoteDialogContext } from './QuoteDialogContext';

export function AppLayout() {
  const [quoteOpen, setQuoteOpen] = useState(false);
  return (
    <QuoteDialogContext.Provider value={() => setQuoteOpen(true)}>
      <div className="app-shell">
        <SiteHeader onOpenQuote={() => setQuoteOpen(true)} />
        <main id="main-content"><Outlet /></main>
        <SiteFooter />
        <QuoteRequestDialog open={quoteOpen} onClose={() => setQuoteOpen(false)} />
      </div>
    </QuoteDialogContext.Provider>
  );
}
