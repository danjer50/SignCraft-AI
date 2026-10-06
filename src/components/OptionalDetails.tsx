import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface OptionalDetailsProps {
  children: ReactNode;
  /** Short label shown while collapsed, e.g. the step's optional-detail title. */
  label: string;
  defaultOpen?: boolean;
}

/**
 * Disclosure for the optional professional details (category, exact wording, lighting,
 * dimensions, notes). The simplified customer flow stays short, but nothing is removed:
 * the extra fields remain one tap away and keep their previous behaviour.
 */
export function OptionalDetails({ children, label, defaultOpen = false }: OptionalDetailsProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const { t } = useLanguage();

  return (
    <div className={`optional-details${open ? ' is-open' : ''}`}>
      <button
        className="optional-details-toggle"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal size={15} />
        <span>{open ? t('studio.lessOptions') : label}</span>
        <ChevronDown size={15} className="optional-details-chevron" />
      </button>
      <div className="optional-details-panel" id={panelId} hidden={!open}>
        <p className="optional-details-note">{t('studio.optionalDetailsBody')}</p>
        {children}
      </div>
    </div>
  );
}
