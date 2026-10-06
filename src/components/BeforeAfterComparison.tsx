import { ImageOff } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { TransformationSlider } from './TransformationSlider';
import { useLanguage } from '../context/LanguageContext';

interface BeforeAfterComparisonProps {
  beforeImage?: string;
  afterImage?: string;
}

export function BeforeAfterComparison({ beforeImage, afterImage }: BeforeAfterComparisonProps) {
  const { t } = useLanguage();

  if (!afterImage) {
    return (
      <div className="comparison-grid">
        <figure className="comparison-card">
          <div className="comparison-image-wrap">
            {beforeImage ? <SafeImage src={beforeImage} alt={t('result.reference')} /> : <div className="comparison-empty"><ImageOff size={24} /><span>{t('result.noPhoto')}</span></div>}
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
    <TransformationSlider
      beforeImage={beforeImage}
      afterImage={afterImage}
      beforeLabel={t('result.before')}
      afterLabel={t('result.after')}
    />
  );
}
