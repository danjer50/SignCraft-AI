import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { AIConceptResult, SignConfiguration, UploadedStorefrontPhoto } from '../domain/sign';
import { DEFAULT_SIGN_CONFIGURATION } from '../domain/sign';
import { createStorefrontPhoto } from '../services/upload';

const DRAFT_KEY = 'signcraft:studio-draft:v1';

interface ProjectState {
  id: string;
  configuration: SignConfiguration;
  photo: UploadedStorefrontPhoto | null;
  lastConcept: AIConceptResult | null;
}

type ProjectAction =
  | { type: 'SET_FIELD'; key: keyof SignConfiguration; value: string }
  | { type: 'SET_PHOTO'; photo: UploadedStorefrontPhoto | null }
  | { type: 'SET_CONCEPT'; concept: AIConceptResult | null }
  | { type: 'RESET' };

interface ProjectContextValue {
  state: ProjectState;
  updateConfiguration: <K extends keyof SignConfiguration>(key: K, value: SignConfiguration[K]) => void;
  setPhotoFile: (file: File) => Promise<void>;
  removePhoto: () => void;
  setConcept: (concept: AIConceptResult | null) => void;
  resetProject: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `project-${Date.now().toString(36)}`;
}

function readDraft(): ProjectState {
  const empty: ProjectState = {
    id: createId(),
    configuration: DEFAULT_SIGN_CONFIGURATION,
    photo: null,
    lastConcept: null,
  };
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return empty;
    const saved = JSON.parse(raw) as Partial<ProjectState> & {
      photo?: Partial<UploadedStorefrontPhoto> | null;
    };
    const photo = saved.photo?.previewDataUrl && typeof saved.photo.fileName === 'string'
      ? {
          file: null,
          fileName: saved.photo.fileName,
          mimeType: typeof saved.photo.mimeType === 'string' ? saved.photo.mimeType : 'image/jpeg',
          sizeBytes: typeof saved.photo.sizeBytes === 'number' ? saved.photo.sizeBytes : 0,
          transferState: 'LOCAL_ONLY' as const,
          previewDataUrl: saved.photo.previewDataUrl,
          previewUrl: saved.photo.previewDataUrl,
        }
      : null;
    return {
      id: typeof saved.id === 'string' ? saved.id : empty.id,
      configuration: { ...DEFAULT_SIGN_CONFIGURATION, ...(saved.configuration ?? {}) },
      photo,
      lastConcept: saved.lastConcept ?? null,
    };
  } catch {
    return empty;
  }
}

function reducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, configuration: { ...state.configuration, [action.key]: action.value } };
    case 'SET_PHOTO':
      return { ...state, photo: action.photo, lastConcept: null };
    case 'SET_CONCEPT':
      return { ...state, lastConcept: action.concept };
    case 'RESET':
      return { id: createId(), configuration: DEFAULT_SIGN_CONFIGURATION, photo: null, lastConcept: null };
    default:
      return state;
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, readDraft);
  const activeObjectUrl = useRef<string | null>(null);

  useEffect(() => {
    const photo = state.photo;
    const serializable = {
      id: state.id,
      configuration: state.configuration,
      lastConcept: state.lastConcept,
      photo: photo ? {
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        transferState: 'LOCAL_ONLY',
        previewDataUrl: photo.previewDataUrl,
      } : null,
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(serializable));
    } catch {
      // Draft persistence is a convenience; the active form continues to work in memory.
    }
  }, [state]);

  const releaseOldPreview = useCallback((nextUrl: string | null) => {
    const previous = activeObjectUrl.current;
    if (previous && previous !== nextUrl) URL.revokeObjectURL(previous);
    activeObjectUrl.current = nextUrl?.startsWith('blob:') ? nextUrl : null;
  }, []);

  useEffect(() => () => {
    if (activeObjectUrl.current) URL.revokeObjectURL(activeObjectUrl.current);
  }, []);

  const updateConfiguration: ProjectContextValue['updateConfiguration'] = useCallback((key, value) => {
    dispatch({ type: 'SET_FIELD', key, value: String(value) });
  }, []);

  const setPhotoFile = useCallback(async (file: File) => {
    const photo = await createStorefrontPhoto(file);
    releaseOldPreview(photo.previewUrl);
    dispatch({ type: 'SET_PHOTO', photo });
  }, [releaseOldPreview]);

  const removePhoto = useCallback(() => {
    releaseOldPreview(null);
    dispatch({ type: 'SET_PHOTO', photo: null });
  }, [releaseOldPreview]);

  const setConcept = useCallback((concept: AIConceptResult | null) => {
    dispatch({ type: 'SET_CONCEPT', concept });
  }, []);

  const resetProject = useCallback(() => {
    releaseOldPreview(null);
    dispatch({ type: 'RESET' });
  }, [releaseOldPreview]);

  const value = useMemo<ProjectContextValue>(() => ({
    state,
    updateConfiguration,
    setPhotoFile,
    removePhoto,
    setConcept,
    resetProject,
  }), [state, updateConfiguration, setPhotoFile, removePhoto, setConcept, resetProject]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used inside ProjectProvider');
  return context;
}
