import { LoaderCircle, ScanLine, WandSparkles } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';
import { SafeImage } from './SafeImage';
import { clientConfig } from '../services/config';

interface GenerationProgressProps {
  /** `panel` replaces the studio step while generating; `banner` is a slim inline status. */
  variant?: 'panel' | 'banner';
}

/**
 * Explicit, honest generation feedback. The screen never goes blank while a request is in
 * flight: the customer sees their own photo inside a studio scan frame, a plain status line
 * and — in demo mode — the reminder that no render will be produced.
 */
export function GenerationProgress({ variant = 'panel' }: GenerationProgressProps) {
  const { t } = useLanguage();
  const { state } = useProject();
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
      <div className="generation-stage">
        {state.photo ? (
          <SafeImage className="generation-stage-photo" src={state.photo.previewUrl} alt={t('studio.summaryPhoto')} />
        ) : (
          <div className="generation-stage-photo generation-stage-empty" />
        )}
        <span className="generation-scan" aria-hidden="true"><ScanLine size={15} /></span>
        <span className="generation-stage-frame" aria-hidden="true" />
      </div>
      <h2>{t('studio.generatingTitle')}</h2>
      <p>{t('studio.generatingBody')}</p>
      <p className="generation-panel-mode">
        <WandSparkles size={14} />
        {demo ? t('studio.generatingDemoBody') : t('studio.generatingTime')}
      </p>
      {!demo && <p className="generation-stages-caption">{t('studio.generatingStages')}</p>}
      <span className="generation-panel-track" aria-hidden="true"><i /></span>
      <span className="generation-flow-reminder">{t('studio.flowReminder')}</span>
    </div>
  );
}
