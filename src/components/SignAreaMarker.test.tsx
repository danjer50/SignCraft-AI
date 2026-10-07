import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LanguageProvider } from '../context/LanguageContext';
import { ProjectProvider, useProject } from '../context/ProjectContext';
import { SignAreaMarker } from './SignAreaMarker';

vi.mock('../services/upload', async () => {
  const actual = await vi.importActual<typeof import('../services/upload')>('../services/upload');
  return {
    ...actual,
    createStorefrontPhoto: vi.fn(async (file: File) => ({
      file,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      transferState: 'LOCAL_ONLY' as const,
      previewDataUrl: 'data:image/jpeg;base64,dGh1bWI=',
      previewUrl: 'data:image/jpeg;base64,dGh1bWI=',
    })),
  };
});

/** Loads a fake storefront photo before the marker renders, mirroring the real studio flow. */
function WithPhoto() {
  const { state, setPhotoFile } = useProject();
  useEffect(() => {
    void setPhotoFile(new File(['facade'], 'facade.jpg', { type: 'image/jpeg' }));
    // Load once; the marker should not require re-triggering on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!state.photo) return null;
  return <SignAreaMarker />;
}

function renderMarker() {
  return render(<LanguageProvider><ProjectProvider><WithPhoto /></ProjectProvider></LanguageProvider>);
}

/**
 * jsdom has no native `PointerEvent` constructor, so `fireEvent.pointerDown({ clientX })`
 * silently drops the coordinates (a known jsdom gap). Dispatching a `MouseEvent` carrying the
 * real pointer event `type` keeps `clientX`/`clientY` intact while still triggering the
 * component's `onPointerDown`/`onPointerMove`/`onPointerUp` React handlers.
 */
function firePointer(target: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', clientX: number, clientY: number) {
  fireEvent(target, new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true }));
}

/** One full press→drag→release gesture, mirroring one real brush stroke. */
function paintStroke(canvas: Element, from: [number, number], to: [number, number]) {
  firePointer(canvas, 'pointerdown', from[0], from[1]);
  firePointer(canvas, 'pointermove', to[0], to[1]);
  firePointer(canvas, 'pointerup', to[0], to[1]);
}

function strokeElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.sign-area-stroke'));
}

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  Element.prototype.setPointerCapture = vi.fn();
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100, toJSON: () => ({}),
  } as DOMRect);
});

describe('sign area marker', () => {
  it('shows the unmarked state until the customer paints a mark', async () => {
    renderMarker();
    const badge = await screen.findByTestId('sign-area-badge');
    expect(badge.className).not.toContain('is-set');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(strokeElements()).toHaveLength(0);
  });

  it('records a painted stroke as percentages of the photo', async () => {
    renderMarker();
    const canvas = (await screen.findByAltText(/sign placement marker|zone de marquage/i)).parentElement as HTMLElement;

    paintStroke(canvas, [20, 10], [100, 60]);

    await waitFor(() => expect(screen.getByTestId('sign-area-badge').className).toContain('is-set'));
    expect(screen.getByRole('checkbox')).toBeInTheDocument();

    // clientX 20→100 of a 200-wide box is 10%→50%; clientY 10→60 of a 100-tall box is 10%→60%.
    const strokes = strokeElements();
    expect(strokes).toHaveLength(1);
    expect(strokes[0].getAttribute('points')).toBe('10,10 50,60');
  });

  it('adds a second stroke on top of the first instead of restarting the mark', async () => {
    renderMarker();
    const canvas = (await screen.findByAltText(/sign placement marker|zone de marquage/i)).parentElement as HTMLElement;

    paintStroke(canvas, [20, 10], [100, 60]);
    await waitFor(() => expect(strokeElements()).toHaveLength(1));

    // A second, separate drag elsewhere on the photo must be kept alongside the first mark —
    // this is the exact regression the customer reported: a new drag used to wipe out the
    // previous one instead of adding to it.
    paintStroke(canvas, [120, 20], [180, 80]);

    await waitFor(() => expect(strokeElements()).toHaveLength(2));
    const strokes = strokeElements();
    expect(strokes[0].getAttribute('points')).toBe('10,10 50,60');
    expect(strokes[1].getAttribute('points')).toBe('60,20 90,80');
    expect(screen.getByTestId('sign-area-badge')).toHaveTextContent('2');
  });

  it('treats a tap with no movement as a small dot mark rather than ignoring it', async () => {
    renderMarker();
    const canvas = (await screen.findByAltText(/sign placement marker|zone de marquage/i)).parentElement as HTMLElement;

    firePointer(canvas, 'pointerdown', 20, 10);
    firePointer(canvas, 'pointerup', 20, 10);

    await waitFor(() => expect(screen.getByTestId('sign-area-badge').className).toContain('is-set'));
    expect(strokeElements()).toHaveLength(1);
  });

  it('undoes only the most recent stroke, keeping earlier marks intact', async () => {
    renderMarker();
    const canvas = (await screen.findByAltText(/sign placement marker|zone de marquage/i)).parentElement as HTMLElement;

    paintStroke(canvas, [20, 10], [100, 60]);
    paintStroke(canvas, [120, 20], [180, 80]);
    await waitFor(() => expect(strokeElements()).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: /Undo last stroke|Annuler le dernier trait/i }));

    await waitFor(() => expect(strokeElements()).toHaveLength(1));
    expect(strokeElements()[0].getAttribute('points')).toBe('10,10 50,60');
    expect(screen.getByTestId('sign-area-badge').className).toContain('is-set');
  });

  it('clears every mark and resets the replace-existing-surface flag', async () => {
    renderMarker();
    const canvas = (await screen.findByAltText(/sign placement marker|zone de marquage/i)).parentElement as HTMLElement;

    paintStroke(canvas, [20, 10], [100, 60]);
    paintStroke(canvas, [120, 20], [180, 80]);
    await waitFor(() => expect(strokeElements()).toHaveLength(2));

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /Clear all|Tout effacer/i }));
    await waitFor(() => expect(screen.getByTestId('sign-area-badge').className).not.toContain('is-set'));
    expect(strokeElements()).toHaveLength(0);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
