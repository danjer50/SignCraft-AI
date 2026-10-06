import { createContext, useContext } from 'react';

export const QuoteDialogContext = createContext<(() => void) | null>(null);

export function useQuoteDialog(): () => void {
  const open = useContext(QuoteDialogContext);
  if (!open) throw new Error('useQuoteDialog must be used inside AppLayout');
  return open;
}
