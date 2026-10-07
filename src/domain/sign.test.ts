import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIGN_CONFIGURATION,
  SIGN_AREA_MAX_POINTS_PER_STROKE,
  SIGN_AREA_MAX_STROKES,
  computeSignAreaBounds,
  normalizeSignArea,
  normalizeSignConfiguration,
} from './sign';

describe('normalizeSignArea', () => {
  it('accepts a well-formed single stroke', () => {
    expect(normalizeSignArea({ strokes: [{ points: [{ xPercent: 10, yPercent: 20 }, { xPercent: 15, yPercent: 25 }] }] }))
      .toEqual({ strokes: [{ points: [{ xPercent: 10, yPercent: 20 }, { xPercent: 15, yPercent: 25 }] }] });
  });

  it('accepts several strokes, preserving every one of them', () => {
    const area = normalizeSignArea({
      strokes: [
        { points: [{ xPercent: 10, yPercent: 10 }] },
        { points: [{ xPercent: 60, yPercent: 60 }, { xPercent: 65, yPercent: 65 }] },
      ],
    });
    expect(area?.strokes).toHaveLength(2);
  });

  it('rejects anything that is not an object with a strokes array', () => {
    expect(normalizeSignArea(null)).toBeNull();
    expect(normalizeSignArea(undefined)).toBeNull();
    expect(normalizeSignArea('not-an-area')).toBeNull();
    expect(normalizeSignArea(42)).toBeNull();
    expect(normalizeSignArea({})).toBeNull();
    expect(normalizeSignArea({ strokes: 'nope' })).toBeNull();
  });

  it('drops individual points or whole strokes that are malformed instead of rejecting the rest', () => {
    const area = normalizeSignArea({
      strokes: [
        { points: [{ xPercent: 'left', yPercent: 20 }, { xPercent: 10, yPercent: 20 }] },
        { points: [] },
        'not-a-stroke',
        { points: [{ xPercent: 30, yPercent: 40 }] },
      ],
    });
    expect(area).toEqual({ strokes: [{ points: [{ xPercent: 10, yPercent: 20 }] }, { points: [{ xPercent: 30, yPercent: 40 }] }] });
  });

  it('returns null once every stroke turns out to be invalid', () => {
    expect(normalizeSignArea({ strokes: [{ points: [] }, 'nope', { points: [{ xPercent: NaN, yPercent: 1 }] }] })).toBeNull();
  });

  it('clamps out-of-range coordinates instead of sending an impossible point to the AI', () => {
    const area = normalizeSignArea({ strokes: [{ points: [{ xPercent: -50, yPercent: 150 }] }] });
    expect(area).toEqual({ strokes: [{ points: [{ xPercent: 0, yPercent: 100 }] }] });
  });

  it('caps the number of points kept per stroke', () => {
    const points = Array.from({ length: SIGN_AREA_MAX_POINTS_PER_STROKE + 50 }, (_, index) => ({ xPercent: index % 100, yPercent: 1 }));
    const area = normalizeSignArea({ strokes: [{ points }] });
    expect(area?.strokes[0].points).toHaveLength(SIGN_AREA_MAX_POINTS_PER_STROKE);
  });

  it('caps the number of strokes kept', () => {
    const strokes = Array.from({ length: SIGN_AREA_MAX_STROKES + 10 }, (_, index) => ({ points: [{ xPercent: index % 100, yPercent: 1 }] }));
    const area = normalizeSignArea({ strokes });
    expect(area?.strokes).toHaveLength(SIGN_AREA_MAX_STROKES);
  });
});

describe('computeSignAreaBounds', () => {
  it('returns null for no marked area', () => {
    expect(computeSignAreaBounds(null)).toBeNull();
  });

  it('computes the bounding box and centre of a single stroke', () => {
    const bounds = computeSignAreaBounds({ strokes: [{ points: [{ xPercent: 10, yPercent: 20 }, { xPercent: 30, yPercent: 40 }] }] });
    expect(bounds).toEqual({ xPercent: 10, yPercent: 20, widthPercent: 20, heightPercent: 20, centerXPercent: 20, centerYPercent: 30 });
  });

  it('spans every stroke when several marks were painted', () => {
    const bounds = computeSignAreaBounds({
      strokes: [
        { points: [{ xPercent: 5, yPercent: 5 }] },
        { points: [{ xPercent: 80, yPercent: 60 }] },
      ],
    });
    expect(bounds).toEqual({ xPercent: 5, yPercent: 5, widthPercent: 75, heightPercent: 55, centerXPercent: 42.5, centerYPercent: 32.5 });
  });

  it('gives a single painted point a minimal non-zero size', () => {
    const bounds = computeSignAreaBounds({ strokes: [{ points: [{ xPercent: 50, yPercent: 50 }] }] });
    expect(bounds).toEqual({ xPercent: 50, yPercent: 50, widthPercent: 1, heightPercent: 1, centerXPercent: 50, centerYPercent: 50 });
  });
});

describe('normalizeSignConfiguration — sign area fields', () => {
  it('defaults to no marked area and no replacement flag', () => {
    const configuration = normalizeSignConfiguration({});
    expect(configuration.signArea).toBeNull();
    expect(configuration.replaceExistingSurface).toBe(false);
  });

  it('recovers a valid persisted sign area and replacement flag', () => {
    const configuration = normalizeSignConfiguration({
      ...DEFAULT_SIGN_CONFIGURATION,
      signArea: { strokes: [{ points: [{ xPercent: 5, yPercent: 5 }, { xPercent: 45, yPercent: 30 }] }] },
      replaceExistingSurface: true,
    });
    expect(configuration.signArea).toEqual({ strokes: [{ points: [{ xPercent: 5, yPercent: 5 }, { xPercent: 45, yPercent: 30 }] }] });
    expect(configuration.replaceExistingSurface).toBe(true);
  });

  it('drops a corrupted sign area and a non-boolean replacement flag without crashing', () => {
    const configuration = normalizeSignConfiguration({
      ...DEFAULT_SIGN_CONFIGURATION,
      signArea: { strokes: 'left' },
      replaceExistingSurface: 'yes',
    });
    expect(configuration.signArea).toBeNull();
    expect(configuration.replaceExistingSurface).toBe(false);
  });
});
