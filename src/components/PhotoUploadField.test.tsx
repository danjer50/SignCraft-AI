import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { LanguageProvider } from '../context/LanguageContext';
import { ProjectProvider } from '../context/ProjectContext';
import { PhotoUploadField } from './PhotoUploadField';

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

function renderUpload() {
  return render(<LanguageProvider><ProjectProvider><PhotoUploadField /></ProjectProvider></LanguageProvider>);
}

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('storefront upload field', () => {
  it('shows a local photo preview after an accepted image is selected', async () => {
    renderUpload();
    const file = new File(['front'], 'boutique.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText('Choisir une photo'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByAltText('Photo sélectionnée — boutique.webp')).toBeInTheDocument());
    // The default build calls the server, so the notice explains the resized copy that is sent.
    expect(screen.getByText(/envoyée au serveur SignCraft/i)).toBeInTheDocument();
    expect(screen.getByText(/PHOTO LOCALE|non transmise/i)).toBeInTheDocument();
  });

  it('blocks unsupported files before creating a preview', async () => {
    renderUpload();
    const file = new File(['not an image'], 'facade.svg', { type: 'image/svg+xml' });
    fireEvent.change(screen.getByLabelText('Choisir une photo'), { target: { files: [file] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/Format non pris en charge/i);
    expect(screen.queryByAltText(/Photo sélectionnée/)).not.toBeInTheDocument();
  });
});
