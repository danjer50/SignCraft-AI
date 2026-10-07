import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Eraser, Paintbrush2, Undo2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';
import { SIGN_AREA_MAX_POINTS_PER_STROKE, SIGN_AREA_MAX_STROKES, type SignAreaPoint, type SignAreaStroke } from '../domain/sign';
import { SafeImage } from './SafeImage';

/** Ignore pointer jitter smaller than this (percent of the photo) before recording a new point. */
const MIN_MOVE_PERCENT = 1.2;

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Convert a pointer position into a percentage of the marker's own bounding box. */
function percentFromPointer(event: ReactPointerEvent<HTMLDivElement>, bounds: DOMRect): SignAreaPoint {
  return {
    xPercent: clampPercent(((event.clientX - bounds.left) / bounds.width) * 100),
    yPercent: clampPercent(((event.clientY - bounds.top) / bounds.height) * 100),
  };
}

/** SVG `points` attribute for one stroke; a single-point stroke is duplicated so a plain tap still draws a round dot. */
function pointsAttribute(points: SignAreaPoint[]): string {
  const drawn = points.length > 1 ? points : [...points, ...points];
  return drawn.map((point) => `${point.xPercent},${point.yPercent}`).join(' ');
}

/**
 * Lets the customer paint, directly on the uploaded photo, roughly where the new sign should
 * go — a free-form brush, not a single fixed rectangle. Every stroke is added on top of the
 * previous ones (never restarting or replacing an existing mark), so the customer can build up
 * as many marks as they need. This only feeds `promptBuilder` a general location (and, loosely,
 * a sense of scale); the AI still decides the sign's actual size and shape at that spot. Touch,
 * pen and mouse all use the same pointer handlers.
 */
export function SignAreaMarker() {
  const { t } = useLanguage();
  const { state, setSignArea, setReplaceExistingSurface } = useProject();
  const photo = state.photo;
  const area = state.configuration.signArea;
  const containerRef = useRef<HTMLDivElement>(null);
  const [liveStroke, setLiveStroke] = useState<SignAreaPoint[] | null>(null);

  if (!photo) return null;

  const strokes: SignAreaStroke[] = area?.strokes ?? [];
  const hasMarks = strokes.length > 0;
  const atStrokeLimit = strokes.length >= SIGN_AREA_MAX_STROKES;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (atStrokeLimit) return;
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setLiveStroke([percentFromPointer(event, bounds)]);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!liveStroke) return;
    if (liveStroke.length >= SIGN_AREA_MAX_POINTS_PER_STROKE) return;
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const point = percentFromPointer(event, bounds);
    const last = liveStroke[liveStroke.length - 1];
    if (Math.hypot(point.xPercent - last.xPercent, point.yPercent - last.yPercent) < MIN_MOVE_PERCENT) return;
    setLiveStroke([...liveStroke, point]);
  };

  const finishStroke = () => {
    if (liveStroke && liveStroke.length > 0) {
      // A new stroke is always appended, never replacing the marks already painted — this is
      // what lets the customer keep adding more shapes instead of losing the previous ones.
      setSignArea({ strokes: [...strokes, { points: liveStroke }] });
    }
    setLiveStroke(null);
  };

  const undoLastStroke = () => {
    if (strokes.length === 0) return;
    const remaining = strokes.slice(0, -1);
    setSignArea(remaining.length > 0 ? { strokes: remaining } : null);
  };

  const clearArea = () => {
    setSignArea(null);
    setReplaceExistingSurface(false);
    setLiveStroke(null);
  };

  const visibleStrokes: SignAreaStroke[] = liveStroke ? [...strokes, { points: liveStroke }] : strokes;

  return (
    <div className="sign-area-marker">
      <div className="sign-area-marker-head">
        <span className="sign-area-marker-icon"><Paintbrush2 size={16} /></span>
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
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
      >
        <SafeImage src={photo.previewUrl} alt={t('studio.signAreaPhotoAlt')} className="sign-area-photo" />
        {visibleStrokes.length > 0 && (
          <svg className="sign-area-paint" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {visibleStrokes.map((stroke, index) => (
              <polyline key={index} className="sign-area-stroke" points={pointsAttribute(stroke.points)} />
            ))}
          </svg>
        )}
        {visibleStrokes.length === 0 && <div className="sign-area-hint">{t('studio.signAreaDragHint')}</div>}
      </div>
      <div className="sign-area-status">
        <span className={`sign-area-badge${hasMarks ? ' is-set' : ''}`} data-testid="sign-area-badge">
          <span className="sign-area-badge-dot" />
          {hasMarks ? `${t('studio.signAreaSet')} · ${strokes.length}` : t('studio.signAreaNotSet')}
        </span>
        {hasMarks && (
          <div className="sign-area-actions">
            <button type="button" className="button button-quiet button-small" onClick={undoLastStroke}>
              <Undo2 size={14} />{t('studio.signAreaUndo')}
            </button>
            <button type="button" className="button button-quiet button-small" onClick={clearArea}>
              <Eraser size={14} />{t('studio.signAreaClear')}
            </button>
          </div>
        )}
      </div>
      {hasMarks && (
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
