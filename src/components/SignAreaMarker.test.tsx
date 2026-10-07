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

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  Element.prototype.setPointerCapture = vi.fn();
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100, toJSON: () => ({}),
  } as DOMRect);
});

describe('sign area marker', () => {
  it('shows the unmarked state until the customer draws a rectangle', async () => {
    renderMarker();
    const badge = await screen.findByTestId('sign-area-badge');
    expect(badge.className).not.toContain('is-set');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('records a dragged rectangle as percentages of the photo', async () => {
    renderMarker();
    const canvas = (await screen.findByAltText(/sign placement marker|zone de marquage/i)).parentElement as HTMLElement;

    firePointer(canvas, 'pointerdown', 20, 10);
    firePointer(canvas, 'pointermove', 100, 60);
    firePointer(canvas, 'pointerup', 100, 60);

    await waitFor(() => expect(screen.getByTestId('sign-area-badge').className).toContain('is-set'));
    expect(screen.getByRole('checkbox')).toBeInTheDocument();

    const rect = document.querySelector('.sign-area-rect') as HTMLElement;
    // clientX 20→100 of a 200-wide box is 10%→50%; clientY 10→60 of a 100-tall box is 10%→60%.
    expect(rect.style.left).toBe('10%');
    expect(rect.style.top).toBe('10%');
    expect(rect.style.width).toBe('40%');
    expect(rect.style.height).toBe('50%');
  });

  it('ignores a drag that never moves (an accidental tap)', async () => {
    renderMarker();
    const canvas = (await screen.findByAltText(/sign placement marker|zone de marquage/i)).parentElement as HTMLElement;

    firePointer(canvas, 'pointerdown', 20, 10);
    firePointer(canvas, 'pointerup', 20, 10);

    expect(screen.getByTestId('sign-area-badge').className).not.toContain('is-set');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('clears a marked area and resets the replace-existing-surface flag', async () => {
    renderMarker();
    const canvas = (await screen.findByAltText(/sign placement marker|zone de marquage/i)).parentElement as HTMLElement;

    firePointer(canvas, 'pointerdown', 20, 10);
    firePointer(canvas, 'pointermove', 100, 60);
    firePointer(canvas, 'pointerup', 100, 60);
    await waitFor(() => expect(screen.getByTestId('sign-area-badge').className).toContain('is-set'));

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /Clear mark|Effacer le marquage/i }));
    await waitFor(() => expect(screen.getByTestId('sign-area-badge').className).not.toContain('is-set'));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
