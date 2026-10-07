import { describe, expect, it } from 'vitest';
import { DEFAULT_SIGN_CONFIGURATION, normalizeSignArea, normalizeSignConfiguration } from './sign';

describe('normalizeSignArea', () => {
  it('accepts a well-formed rectangle', () => {
    expect(normalizeSignArea({ xPercent: 10, yPercent: 20, widthPercent: 30, heightPercent: 15 }))
      .toEqual({ xPercent: 10, yPercent: 20, widthPercent: 30, heightPercent: 15 });
  });

  it('rejects anything that is not an object', () => {
    expect(normalizeSignArea(null)).toBeNull();
    expect(normalizeSignArea(undefined)).toBeNull();
    expect(normalizeSignArea('not-an-area')).toBeNull();
    expect(normalizeSignArea(42)).toBeNull();
  });

  it('rejects a rectangle missing or with non-numeric fields instead of guessing', () => {
    expect(normalizeSignArea({ xPercent: 10, yPercent: 20, widthPercent: 30 })).toBeNull();
    expect(normalizeSignArea({ xPercent: '10', yPercent: 20, widthPercent: 30, heightPercent: 15 })).toBeNull();
    expect(normalizeSignArea({ xPercent: NaN, yPercent: 20, widthPercent: 30, heightPercent: 15 })).toBeNull();
  });

  it('clamps an out-of-range rectangle instead of sending an impossible region to the AI', () => {
    expect(normalizeSignArea({ xPercent: -50, yPercent: 150, widthPercent: 300, heightPercent: -10 }))
      .toEqual({ xPercent: 0, yPercent: 99, widthPercent: 100, heightPercent: 1 });
  });

  it('never lets the rectangle extend past the edge of the photo', () => {
    const area = normalizeSignArea({ xPercent: 90, yPercent: 90, widthPercent: 50, heightPercent: 50 });
    expect(area).toEqual({ xPercent: 90, yPercent: 90, widthPercent: 10, heightPercent: 10 });
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
      signArea: { xPercent: 5, yPercent: 5, widthPercent: 40, heightPercent: 25 },
      replaceExistingSurface: true,
    });
    expect(configuration.signArea).toEqual({ xPercent: 5, yPercent: 5, widthPercent: 40, heightPercent: 25 });
    expect(configuration.replaceExistingSurface).toBe(true);
  });

  it('drops a corrupted sign area and a non-boolean replacement flag without crashing', () => {
    const configuration = normalizeSignConfiguration({
      ...DEFAULT_SIGN_CONFIGURATION,
      signArea: { xPercent: 'left' },
      replaceExistingSurface: 'yes',
    });
    expect(configuration.signArea).toBeNull();
    expect(configuration.replaceExistingSurface).toBe(false);
  });
});
