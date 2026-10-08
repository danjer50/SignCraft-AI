import { useState } from 'react';
import { MoveHorizontal } from 'lucide-react';
import { SafeImage } from './SafeImage';

interface TransformationSliderProps {
  beforeImage?: string;
  afterImage: string;
  beforeLabel: string;
  afterLabel: string;
  /** Extra wrapper class, e.g. `is-hero` for the home page showcase. */
  variant?: 'result' | 'hero';
}

/**
 * Before/after reveal used by the result page and by the home page showcase. The mechanics
 * are a plain range input, so it works with a finger, a mouse, a keyboard and a screen reader.
 */
export function TransformationSlider({ beforeImage, afterImage, beforeLabel, afterLabel, variant = 'result' }: TransformationSliderProps) {
  const [position, setPosition] = useState(variant === 'hero' ? 62 : 50);

  return (
    <div dir="ltr" className={`comparison-slider comparison-slider--${variant}`} style={{ '--compare-position': `${position}%` } as React.CSSProperties}>
      <SafeImage className="comparison-base" src={afterImage} alt={afterLabel} />
      {beforeImage && <SafeImage className="comparison-overlay" src={beforeImage} alt={beforeLabel} />}
      <div className="comparison-labels" aria-hidden="true">
        <span>{beforeLabel}</span><span>{afterLabel}</span>
      </div>
      <div className="comparison-divider" aria-hidden="true"><span><MoveHorizontal size={18} /></span></div>
      <input
        className="comparison-range"
        type="range"
        min="0"
        max="100"
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label={`${beforeLabel} / ${afterLabel}`}
      />
    </div>
  );
}
