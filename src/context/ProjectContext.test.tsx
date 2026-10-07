import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProjectProvider, useProject } from './ProjectContext';
import { STUDIO_DRAFT_KEY, readStudioDraft } from '../services/draftStorage';
import { CUSTOMER_FLOW_STEP_COUNT } from '../domain/customerFlow';
import { DEFAULT_SIGN_CONFIGURATION, MAX_SIGN_MATERIALS } from '../domain/sign';

function Probe() {
  const { state, toggleMaterial, setStep, resetProject, setSignArea, setReplaceExistingSurface, removePhoto } = useProject();
  return (
    <div>
      <span data-testid="step">{state.step}</span>
      <span data-testid="materials">{state.configuration.materials.join(',')}</span>
      <span data-testid="sign-type">{state.configuration.signType}</span>
      <span data-testid="color">{state.configuration.color}</span>
      <span data-testid="concept">{state.lastConcept ? `${state.lastConcept.status}:${state.lastConcept.providerId}` : 'none'}</span>
      <span data-testid="photo">{state.photo ? `${state.photo.fileName}:${state.photo.file ? 'file' : 'preview-only'}` : 'none'}</span>
      <span data-testid="restored">{String(state.restoredFromDraft)}</span>
      <span data-testid="sign-area">{state.configuration.signArea ? JSON.stringify(state.configuration.signArea) : 'none'}</span>
      <span data-testid="replace-surface">{String(state.configuration.replaceExistingSurface)}</span>
      <button type="button" onClick={() => toggleMaterial('acrylic')}>toggle-acrylic</button>
      <button type="button" onClick={() => toggleMaterial('ledModules')}>toggle-led</button>
      <button type="button" onClick={() => setStep(99)}>step-99</button>
      <button type="button" onClick={resetProject}>reset</button>
      <button type="button" onClick={() => setSignArea({ strokes: [{ points: [{ xPercent: 10, yPercent: 20 }, { xPercent: 40, yPercent: 35 }] }] })}>mark-area</button>
      <button type="button" onClick={() => setSignArea(null)}>clear-area</button>
      <button type="button" onClick={() => setReplaceExistingSurface(true)}>flag-replace</button>
      <button type="button" onClick={removePhoto}>remove-photo</button>
    </div>
  );
}

function renderProbe() {
  return render(<ProjectProvider><Probe /></ProjectProvider>);
}

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('project draft persistence and recovery', () => {
  it('starts clean when nothing is stored', () => {
    renderProbe();
    expect(screen.getByTestId('step')).toHaveTextContent('1');
    expect(screen.getByTestId('materials').textContent).toBe('');
    expect(screen.getByTestId('photo')).toHaveTextContent('none');
    expect(screen.getByTestId('restored')).toHaveTextContent('false');
  });

  it('recovers a corrupted draft without crashing or rendering undefined values', () => {
    localStorage.setItem(STUDIO_DRAFT_KEY, '{"configuration":{"signType":"laser","materials":"oops"},"step":-3');
    renderProbe();

    expect(screen.getByTestId('step')).toHaveTextContent('1');
    expect(screen.getByTestId('sign-type')).toHaveTextContent(DEFAULT_SIGN_CONFIGURATION.signType);
    expect(screen.getByTestId('materials').textContent).toBe('');
  });

  it('normalizes an older draft that predates multi-material support', () => {
    localStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify({
      id: 'legacy-project',
      configuration: { businessName: 'Atelier Sable', category: 'retail', signType: 'channelLetters', style: 'premium', color: '#222726', lighting: 'frontLit', exactText: 'ATELIER SABLE', widthCm: '200', heightCm: '50', notes: '' },
      lastConcept: { status: 'UNAVAILABLE', providerId: 'demo-unconfigured', message: 'No provider.', createdAt: '2026-10-01T10:00:00.000Z', sourceImageTransfer: 'LOCAL_ONLY' },
      step: 4,
      photo: { fileName: 'facade.jpg', mimeType: 'image/jpeg', sizeBytes: 1024, transferState: 'LOCAL_ONLY', previewDataUrl: 'data:image/jpeg;base64,dGh1bWI=' },
    }));
    renderProbe();

    expect(screen.getByTestId('step')).toHaveTextContent('4');
    expect(screen.getByTestId('sign-type')).toHaveTextContent('channelLetters');
    expect(screen.getByTestId('color')).toHaveTextContent('#222726');
    expect(screen.getByTestId('materials').textContent).toBe('');
    expect(screen.getByTestId('concept')).toHaveTextContent('UNAVAILABLE:demo-unconfigured');
    expect(screen.getByTestId('photo')).toHaveTextContent('facade.jpg:preview-only');
    expect(screen.getByTestId('restored')).toHaveTextContent('true');
  });

  it('caps a material list that was tampered with in local storage', () => {
    localStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify({
      id: 'tampered',
      configuration: {
        ...DEFAULT_SIGN_CONFIGURATION,
        materials: ['acrylic', 'aluminium', 'pvc', 'wood', 'vinyl', 'ledModules', 'neonFlex', 'not-a-material'],
      },
      lastConcept: null,
      step: 5,
      photo: null,
    }));
    renderProbe();

    expect(screen.getByTestId('materials').textContent?.split(',')).toHaveLength(MAX_SIGN_MATERIALS);
    expect(screen.getByTestId('materials').textContent).not.toContain('not-a-material');
  });

  it('drops an impossible persisted concept instead of showing a broken image', () => {
    localStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify({
      id: 'p1',
      configuration: DEFAULT_SIGN_CONFIGURATION,
      lastConcept: { status: 'GENERATED', providerId: 'x', createdAt: 'not-a-date' },
      step: 3,
      photo: null,
    }));
    renderProbe();

    expect(screen.getByTestId('concept')).toHaveTextContent('none');
    expect(screen.getByTestId('step')).toHaveTextContent('3');
  });

  it('toggles several materials, caps the selection and clamps the stored step', () => {
    renderProbe();

    fireEvent.click(screen.getByRole('button', { name: 'toggle-acrylic' }));
    fireEvent.click(screen.getByRole('button', { name: 'toggle-led' }));
    expect(screen.getByTestId('materials')).toHaveTextContent('acrylic,ledModules');

    fireEvent.click(screen.getByRole('button', { name: 'toggle-acrylic' }));
    expect(screen.getByTestId('materials')).toHaveTextContent('ledModules');

    fireEvent.click(screen.getByRole('button', { name: 'step-99' }));
    expect(screen.getByTestId('step')).toHaveTextContent(String(CUSTOMER_FLOW_STEP_COUNT));

    // The draft written to storage is normalized, so the next visit cannot inherit garbage.
    const draft = readStudioDraft() as { step: number; configuration: { materials: string[] } };
    expect(draft.step).toBe(CUSTOMER_FLOW_STEP_COUNT);
    expect(draft.configuration.materials).toEqual(['ledModules']);

    fireEvent.click(screen.getByRole('button', { name: 'reset' }));
    expect(screen.getByTestId('step')).toHaveTextContent('1');
    expect(screen.getByTestId('materials').textContent).toBe('');
    expect(screen.getByTestId('restored')).toHaveTextContent('false');
  });

  it('marks and clears a sign area, and tracks the replace-existing-surface flag', () => {
    renderProbe();

    expect(screen.getByTestId('sign-area')).toHaveTextContent('none');
    expect(screen.getByTestId('replace-surface')).toHaveTextContent('false');

    fireEvent.click(screen.getByRole('button', { name: 'mark-area' }));
    expect(screen.getByTestId('sign-area')).toHaveTextContent('"xPercent":10');
    expect(screen.getByTestId('sign-area')).toHaveTextContent('"strokes"');

    fireEvent.click(screen.getByRole('button', { name: 'flag-replace' }));
    expect(screen.getByTestId('replace-surface')).toHaveTextContent('true');

    fireEvent.click(screen.getByRole('button', { name: 'clear-area' }));
    expect(screen.getByTestId('sign-area')).toHaveTextContent('none');
  });

  it('drops a marked sign area when the photo is removed, since it no longer applies', () => {
    renderProbe();

    fireEvent.click(screen.getByRole('button', { name: 'mark-area' }));
    fireEvent.click(screen.getByRole('button', { name: 'flag-replace' }));
    expect(screen.getByTestId('sign-area')).not.toHaveTextContent('none');

    fireEvent.click(screen.getByRole('button', { name: 'remove-photo' }));
    expect(screen.getByTestId('sign-area')).toHaveTextContent('none');
    expect(screen.getByTestId('replace-surface')).toHaveTextContent('false');
  });

  it('keeps the wizard usable when the browser refuses storage', () => {
    const writeSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      renderProbe();
      fireEvent.click(screen.getByRole('button', { name: 'toggle-acrylic' }));
      expect(screen.getByTestId('materials')).toHaveTextContent('acrylic');
    } finally {
      writeSpy.mockRestore();
    }
  });
});
