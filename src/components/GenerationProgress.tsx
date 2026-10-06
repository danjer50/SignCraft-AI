import { LoaderCircle, WandSparkles } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { clientConfig } from '../services/config';

interface GenerationProgressProps {
  /** `panel` replaces the studio step while generating; `banner` is a slim inline status. */
  variant?: 'panel' | 'banner';
}

/**
 * Explicit, honest generation feedback. The screen never goes blank while a request is in
 * flight, and demo mode states plainly that no render will be produced.
 */
export function GenerationProgress({ variant = 'panel' }: GenerationProgressProps) {
  const { t } = useLanguage();
  const demo = clientConfig.aiMode === 'demo';

  if (variant === 'banner') {
    return (
      <div className="generation-banner" role="status" aria-live="polite">
        <LoaderCircle className="spin" size={17} />
        <div>
          <strong>{t('result.generatingTitle')}</strong>
          <p>{demo ? t('studio.generatingDemoBody') : t('result.generatingBody')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="generation-panel" role="status" aria-live="polite">
      <span className="generation-panel-mark"><LoaderCircle className="spin" size={26} /></span>
      <h2>{t('studio.generatingTitle')}</h2>
      <p>{t('studio.generatingBody')}</p>
      <p className="generation-panel-mode">
        <WandSparkles size={14} />
        {demo ? t('studio.generatingDemoBody') : t('studio.generatingTime')}
      </p>
      <span className="generation-panel-track" aria-hidden="true"><i /></span>
      <span className="generation-flow-reminder">{t('studio.flowReminder')}</span>
    </div>
  );
}
