import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Eraser, MousePointerSquareDashed } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';
import type { SignAreaRect } from '../domain/sign';
import { SafeImage } from './SafeImage';

interface DragPoint {
  x: number;
  y: number;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Convert a pointer position into a percentage of the marker's own bounding box. */
function percentFromPointer(event: ReactPointerEvent<HTMLDivElement>, bounds: DOMRect): DragPoint {
  return {
    x: clampPercent(((event.clientX - bounds.left) / bounds.width) * 100),
    y: clampPercent(((event.clientY - bounds.top) / bounds.height) * 100),
  };
}

function rectFromPoints(a: DragPoint, b: DragPoint): SignAreaRect {
  const xPercent = Math.min(a.x, b.x);
  const yPercent = Math.min(a.y, b.y);
  const widthPercent = Math.max(1, Math.abs(a.x - b.x));
  const heightPercent = Math.max(1, Math.abs(a.y - b.y));
  return { xPercent, yPercent, widthPercent, heightPercent };
}

/**
 * Lets the customer draw, on the uploaded photo itself, exactly where the new sign should go.
 * This directly feeds `promptBuilder`'s location brief so the AI edits a specific marked area
 * instead of guessing from text alone. Touch, pen and mouse all use the same pointer handlers.
 */
export function SignAreaMarker() {
  const { t } = useLanguage();
  const { state, setSignArea, setReplaceExistingSurface } = useProject();
  const photo = state.photo;
  const area = state.configuration.signArea;
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<DragPoint | null>(null);
  const [draftRect, setDraftRect] = useState<SignAreaRect | null>(null);

  if (!photo) return null;

  const activeRect = draftRect ?? area;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = percentFromPointer(event, bounds);
    setDragStart(point);
    setDraftRect({ xPercent: point.x, yPercent: point.y, widthPercent: 1, heightPercent: 1 });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const point = percentFromPointer(event, bounds);
    setDraftRect(rectFromPoints(dragStart, point));
  };

  const finishDrag = () => {
    if (dragStart && draftRect && draftRect.widthPercent >= 2 && draftRect.heightPercent >= 2) {
      setSignArea(draftRect);
    }
    setDragStart(null);
    setDraftRect(null);
  };

  const clearArea = () => {
    setSignArea(null);
    setReplaceExistingSurface(false);
    setDragStart(null);
    setDraftRect(null);
  };

  return (
    <div className="sign-area-marker">
      <div className="sign-area-marker-head">
        <span className="sign-area-marker-icon"><MousePointerSquareDashed size={16} /></span>
        <div>
          <strong>{t('studio.signAreaTitle')}</strong>
          <p>{t('studio.signAreaBody')}</p>
        </div>
      </div>
      <div
        ref={containerRef}
        className="sign-area-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <SafeImage src={photo.previewUrl} alt={t('studio.signAreaPhotoAlt')} className="sign-area-photo" />
        {activeRect && (
          <div
            className="sign-area-rect"
            style={{
              left: `${activeRect.xPercent}%`,
              top: `${activeRect.yPercent}%`,
              width: `${activeRect.widthPercent}%`,
              height: `${activeRect.heightPercent}%`,
            }}
          />
        )}
        {!activeRect && <div className="sign-area-hint">{t('studio.signAreaDragHint')}</div>}
      </div>
      <div className="sign-area-status">
        <span className={`sign-area-badge${area ? ' is-set' : ''}`} data-testid="sign-area-badge">
          <span className="sign-area-badge-dot" />
          {area ? t('studio.signAreaSet') : t('studio.signAreaNotSet')}
        </span>
        {area && (
          <button type="button" className="button button-quiet button-small" onClick={clearArea}>
            <Eraser size={14} />{t('studio.signAreaClear')}
          </button>
        )}
      </div>
      {area && (
        <label className="sign-area-replace-toggle">
          <input
            type="checkbox"
            checked={state.configuration.replaceExistingSurface}
            onChange={(event) => setReplaceExistingSurface(event.target.checked)}
          />
          <span>{t('studio.signAreaReplaceLabel')}</span>
        </label>
      )}
    </div>
  );
}
