import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type {
  AIConceptResult,
  SignConfiguration,
  SignMaterial,
  StringConfigurationKey,
  UploadedStorefrontPhoto,
} from '../domain/sign';
import { DEFAULT_SIGN_CONFIGURATION, MAX_SIGN_MATERIALS, normalizeConceptResult, normalizeSignConfiguration } from '../domain/sign';
import { clampStep } from '../domain/customerFlow';
import { createStorefrontPhoto } from '../services/upload';
import { readStudioDraft, writeStudioDraft, type StudioDraft } from '../services/draftStorage';

interface ProjectState {
  id: string;
  configuration: SignConfiguration;
  photo: UploadedStorefrontPhoto | null;
  lastConcept: AIConceptResult | null;
  /** Current customer-flow step (1…CUSTOMER_FLOW_STEP_COUNT), restored after a reload. */
  step: number;
  /** True while the session is showing a draft recovered from this browser. */
  restoredFromDraft: boolean;
}

type ProjectAction =
  | { type: 'SET_FIELD'; key: StringConfigurationKey; value: string }
  | { type: 'SET_MATERIALS'; materials: SignMaterial[] }
  | { type: 'TOGGLE_MATERIAL'; material: SignMaterial }
  | { type: 'SET_PHOTO'; photo: UploadedStorefrontPhoto | null }
  | { type: 'SET_CONCEPT'; concept: AIConceptResult | null }
  | { type: 'SET_STEP'; step: number }
  | { type: 'RESET' };

interface ProjectContextValue {
  state: ProjectState;
  updateConfiguration: (key: StringConfigurationKey, value: string) => void;
  setMaterials: (materials: SignMaterial[]) => void;
  toggleMaterial: (material: SignMaterial) => void;
  materialsAtLimit: boolean;
  setStep: (step: number) => void;
  setPhotoFile: (file: File) => Promise<void>;
  removePhoto: () => void;
  setConcept: (concept: AIConceptResult | null) => void;
  resetProject: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

function createId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `project-${Date.now().toString(36)}`;
  } catch {
    return `project-${Date.now().toString(36)}`;
  }
}

function emptyState(): ProjectState {
  return {
    id: createId(),
    configuration: DEFAULT_SIGN_CONFIGURATION,
    photo: null,
    lastConcept: null,
    step: 1,
    restoredFromDraft: false,
  };
}

/**
 * Recover the draft defensively: a truncated, legacy or hand-edited local draft must never
 * produce `undefined` fields, an invalid step or a broken image panel. Anything unusable
 * falls back to a clean state instead of a blank screen.
 */
function readDraft(): ProjectState {
  const empty = emptyState();
  const stored = readStudioDraft();
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return empty;

  try {
    const saved = stored as Partial<ProjectState> & {
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

    const hasRestorableData = Boolean(photo) || Boolean(saved.id) || saved.lastConcept !== undefined ||
      Object.keys(saved.configuration ?? {}).length > 0;

    return {
      id: typeof saved.id === 'string' && saved.id ? saved.id.slice(0, 80) : empty.id,
      configuration: normalizeSignConfiguration(saved.configuration),
      photo,
      lastConcept: normalizeConceptResult(saved.lastConcept),
      step: clampStep(typeof saved.step === 'number' ? saved.step : 1),
      restoredFromDraft: hasRestorableData,
    };
  } catch {
    return empty;
  }
}

function toggleMaterialIn(list: SignMaterial[], material: SignMaterial): SignMaterial[] {
  if (list.includes(material)) return list.filter((entry) => entry !== material);
  if (list.length >= MAX_SIGN_MATERIALS) return list;
  return [...list, material];
}

function reducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, configuration: { ...state.configuration, [action.key]: action.value } };
    case 'SET_MATERIALS':
      return { ...state, configuration: { ...state.configuration, materials: action.materials.slice(0, MAX_SIGN_MATERIALS) } };
    case 'TOGGLE_MATERIAL':
      return {
        ...state,
        configuration: {
          ...state.configuration,
          materials: toggleMaterialIn(state.configuration.materials, action.material),
        },
      };
    case 'SET_PHOTO':
      return { ...state, photo: action.photo, lastConcept: null, restoredFromDraft: action.photo ? false : state.restoredFromDraft };
    case 'SET_CONCEPT':
      return { ...state, lastConcept: action.concept };
    case 'SET_STEP':
      return { ...state, step: clampStep(action.step) };
    case 'RESET':
      return emptyState();
    default:
      return state;
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, readDraft);
  const activeObjectUrl = useRef<string | null>(null);

  useEffect(() => {
    const photo = state.photo;
    const draft: StudioDraft = {
      id: state.id,
      configuration: state.configuration,
      lastConcept: state.lastConcept,
      step: clampStep(state.step),
      photo: photo ? {
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        transferState: 'LOCAL_ONLY',
        previewDataUrl: photo.previewDataUrl,
      } : null,
    };
    // Persistence is a convenience: a refused write never interrupts the active form.
    writeStudioDraft(draft);
  }, [state]);

  const releaseOldPreview = useCallback((nextUrl: string | null) => {
    const previous = activeObjectUrl.current;
    if (previous && previous !== nextUrl) {
      try {
        URL.revokeObjectURL(previous);
      } catch {
        // An already-released preview URL must not interrupt the flow.
      }
    }
    activeObjectUrl.current = nextUrl?.startsWith('blob:') ? nextUrl : null;
  }, []);

  useEffect(() => () => {
    if (activeObjectUrl.current) {
      try {
        URL.revokeObjectURL(activeObjectUrl.current);
      } catch {
        // Cleanup on unmount is best-effort only.
      }
    }
  }, []);

  const updateConfiguration = useCallback((key: StringConfigurationKey, value: string) => {
    dispatch({ type: 'SET_FIELD', key, value: String(value) });
  }, []);

  const setMaterials = useCallback((materials: SignMaterial[]) => {
    dispatch({ type: 'SET_MATERIALS', materials });
  }, []);

  const toggleMaterial = useCallback((material: SignMaterial) => {
    dispatch({ type: 'TOGGLE_MATERIAL', material });
  }, []);

  const setStep = useCallback((step: number) => {
    dispatch({ type: 'SET_STEP', step: clampStep(step) });
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
    setMaterials,
    toggleMaterial,
    materialsAtLimit: state.configuration.materials.length >= MAX_SIGN_MATERIALS,
    setStep,
    setPhotoFile,
    removePhoto,
    setConcept,
    resetProject,
  }), [state, updateConfiguration, setMaterials, toggleMaterial, setStep, setPhotoFile, removePhoto, setConcept, resetProject]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used inside ProjectProvider');
  return context;
}
