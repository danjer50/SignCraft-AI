import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { ImagePlus, ImageUp, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useLanguage } from '../context/LanguageContext';
import { validateStorefrontImage } from '../services/upload';
import { clientConfig } from '../services/config';
import { photoPrivacyMessageKey } from '../services/ai/presentation';

export function PhotoUploadField() {
  const { state, setPhotoFile, removePhoto } = useProject();
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const photo = state.photo;
  const privacyNote = t(photoPrivacyMessageKey(state.lastConcept, clientConfig.aiMode, clientConfig.quoteMode));

  const acceptFile = async (file?: File) => {
    if (!file) return;
    const issue = validateStorefrontImage(file);
    if (issue) {
      setError(issue === 'too-large' ? t('studio.fileTooLarge') : issue === 'empty-file' ? t('studio.fileEmpty') : t('studio.fileTypeError'));
      return;
    }
    setError('');
    setBusy(true);
    try {
      await setPhotoFile(file);
    } catch {
      setError(t('studio.fileTypeError'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => void acceptFile(event.target.files?.[0]);
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void acceptFile(event.dataTransfer.files[0]);
  };

  return (
    <div>
      {!photo ? (
        <div
          className={`upload-dropzone${dragging ? ' is-dragging' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleInput} aria-label={t('studio.uploadBrowse')} />
          <div className="upload-icon"><ImagePlus size={22} /></div>
          <strong>{t('studio.uploadTitle')}</strong>
          <span className="upload-or">— {t('studio.uploadBrowse')} —</span>
          <button type="button" className="button button-outline button-small" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <ImageUp size={16} />}
            {busy ? t('common.loading') : t('studio.uploadBrowse')}
          </button>
          <small>{t('studio.uploadFormats')}</small>
        </div>
      ) : (
        <div className="uploaded-photo-card">
          <div className="uploaded-photo-image">
            <img src={photo.previewUrl} alt={`${t('studio.photoSelected')} — ${photo.fileName}`} />
            {busy && <div className="photo-busy"><LoaderCircle className="spin" size={24} /></div>}
          </div>
          <div className="uploaded-photo-details">
            <span className="photo-state-dot" />
            <div className="uploaded-photo-copy">
              <strong>{photo.fileName}</strong>
              <span>{photo.file ? `${(photo.sizeBytes / (1024 * 1024)).toFixed(1)} MB · ${t('result.notUploaded')}` : t('studio.photoReupload')}</span>
            </div>
            <button className="icon-button" type="button" onClick={() => inputRef.current?.click()} aria-label={t('studio.replacePhoto')} title={t('studio.replacePhoto')}>
              <RefreshCw size={17} />
            </button>
            <button className="icon-button danger-icon" type="button" onClick={() => { removePhoto(); setError(''); }} aria-label={t('studio.removePhoto')} title={t('studio.removePhoto')}>
              <Trash2 size={17} />
            </button>
          </div>
          <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleInput} aria-label={t('studio.replacePhoto')} />
        </div>
      )}
      <p className="upload-local-note"><span className="privacy-dot" />{privacyNote}</p>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
