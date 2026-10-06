import { useState } from 'react';
import { ImageOff, MoveHorizontal } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface BeforeAfterComparisonProps {
  beforeImage?: string;
  afterImage?: string;
}

export function BeforeAfterComparison({ beforeImage, afterImage }: BeforeAfterComparisonProps) {
  const [position, setPosition] = useState(50);
  const { t } = useLanguage();

  if (!afterImage) {
    return (
      <div className="comparison-grid">
        <figure className="comparison-card">
          <div className="comparison-image-wrap">
            {beforeImage ? <img src={beforeImage} alt={t('result.reference')} /> : <div className="comparison-empty"><ImageOff size={24} /><span>{t('result.noPhoto')}</span></div>}
          </div>
          <figcaption><span className="comparison-dot is-before" />{t('result.before')}</figcaption>
        </figure>
        <figure className="comparison-card comparison-card-unavailable">
          <div className="comparison-image-wrap comparison-placeholder">
            <div className="comparison-placeholder-mark"><ImageOff size={24} /></div>
            <strong>{t('result.unavailableTitle')}</strong>
            <span>{t('result.unavailableBody')}</span>
          </div>
          <figcaption><span className="comparison-dot is-after" />{t('result.after')}</figcaption>
        </figure>
      </div>
    );
  }

  return (
    <div className="comparison-slider" style={{ '--compare-position': `${position}%` } as React.CSSProperties}>
      <img className="comparison-base" src={afterImage} alt={t('result.after')} />
      {beforeImage && <img className="comparison-overlay" src={beforeImage} alt={t('result.before')} />}
      <div className="comparison-labels">
        <span>{t('result.before')}</span><span>{t('result.after')}</span>
      </div>
      <div className="comparison-divider" aria-hidden="true"><span><MoveHorizontal size={18} /></span></div>
      <input
        className="comparison-range"
        type="range"
        min="0"
        max="100"
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label={`${t('result.before')} / ${t('result.after')}`}
      />
    </div>
  );
}
