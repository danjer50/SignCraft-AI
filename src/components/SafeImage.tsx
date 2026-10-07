import { useEffect, useState } from 'react';
import { ImageOff, RotateCcw } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  /** Smaller placeholder copy for summary cards and lists. */
  compact?: boolean;
}

/**
 * Image wrapper that never leaves a blank hole in the layout: a revoked blob URL, a truncated
 * data URL or a failed decode renders an explicit, localized placeholder with a retry action.
 */
export function SafeImage({ src, alt, className, compact = false }: SafeImageProps) {
  const { t } = useLanguage();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setFailed(false);
  }, [src, attempt]);

  if (failed) {
    return (
      <div className={`image-fallback${compact ? ' image-fallback-compact' : ''}`}>
        <span className="image-fallback-mark"><ImageOff size={compact ? 16 : 22} /></span>
        <strong>{t('image.unavailable')}</strong>
        {!compact && <span>{t('image.unavailableBody')}</span>}
        <button className="button button-outline button-small" type="button" onClick={() => setAttempt((value) => value + 1)}>
          <RotateCcw size={14} />{t('common.retry')}
        </button>
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} decoding="async" onError={() => setFailed(true)} />;
}
