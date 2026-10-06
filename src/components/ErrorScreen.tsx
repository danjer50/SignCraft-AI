import { CircleAlert, Home, RotateCcw, Trash2 } from 'lucide-react';
import { useSafeLanguage } from '../context/LanguageContext';
import { clearStudioDraft } from '../services/draftStorage';

interface ErrorScreenProps {
  error: Error | null;
  variant: 'page' | 'root';
  onRetry: () => void;
}

/**
 * Crash screen. It uses the non-throwing language accessor and plain anchors, so it still
 * renders (never a white screen) even when the router or a provider is what failed.
 */
export function ErrorScreen({ error, variant, onRetry }: ErrorScreenProps) {
  const { t, direction } = useSafeLanguage();
  const root = variant === 'root';
  return (
    <div className="locale-root" dir={direction}>
      <div className={`error-screen${root ? ' error-screen-root' : ''}`} role="alert">
        <div className="error-screen-card">
          <span className="error-screen-mark"><CircleAlert size={22} /></span>
          <span className="eyebrow">SIGNCRAFT AI · {root ? 'BOOT' : 'PAGE'}</span>
          <h1>{root ? t('error.rootTitle') : t('error.title')}</h1>
          <p>{root ? t('error.rootBody') : t('error.body')}</p>
          <div className="error-screen-actions">
            {root ? (
              <button className="button button-dark" type="button" onClick={() => window.location.reload()}>
                <RotateCcw size={16} />{t('error.reload')}
              </button>
            ) : (
              <button className="button button-dark" type="button" onClick={onRetry}>
                <RotateCcw size={16} />{t('error.retry')}
              </button>
            )}
            <a className="button button-outline" href="/"><Home size={16} />{t('error.backHome')}</a>
            <a className="button button-quiet" href="/studio" onClick={() => clearStudioDraft()}>
              <Trash2 size={16} />{t('error.resetDraft')}
            </a>
          </div>
          {error?.message && (
            <details className="error-screen-details">
              <summary>{t('error.details')}</summary>
              <code>{error.message}</code>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
