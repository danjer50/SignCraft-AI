import { LoaderCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface PageSkeletonProps {
  /** Optional localized label; defaults to the generic page-loading copy. */
  label?: string;
  compact?: boolean;
}

/**
 * Visible, branded loading state. It is used for route chunks, draft recovery and any async
 * transition so the customer never stares at an empty white panel.
 */
export function PageSkeleton({ label, compact = false }: PageSkeletonProps) {
  const { t } = useLanguage();
  return (
    <div className={`page-skeleton${compact ? ' page-skeleton-compact' : ''}`} role="status" aria-live="polite">
      <span className="page-skeleton-mark"><LoaderCircle className="spin" size={compact ? 18 : 24} /></span>
      <strong>{label ?? t('common.loadingPage')}</strong>
      {!compact && (
        <span className="page-skeleton-bars" aria-hidden="true">
          <i /><i /><i />
        </span>
      )}
    </div>
  );
}
