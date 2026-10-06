import { Check, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';
import { MAX_SIGN_MATERIALS, SIGN_MATERIALS } from '../domain/sign';

function withCount(message: string, values: Record<string, number | string>): string {
  return Object.entries(values).reduce((text, [token, value]) => text.replaceAll(`{${token}}`, String(value)), message);
}

/**
 * Multi-select material picker. One sign may combine several materials, so every option is a
 * native checkbox: checking one material can never uncheck another, and the control keeps
 * working (and stays visibly checked) even if the stylesheet fails to load.
 *
 * The selection order is preserved and shown, because the first material is treated as the
 * main one by the prompt builder, the quote brief and the professional workspace.
 */
export function MaterialPicker() {
  const { t } = useLanguage();
  const { state, toggleMaterial, setMaterials, materialsAtLimit } = useProject();
  const selected = state.configuration.materials;
  const limitMessage = withCount(t('studio.materialsMax'), { max: MAX_SIGN_MATERIALS });

  return (
    <fieldset className="choice-fieldset material-picker">
      <legend>{t('studio.materials')}</legend>
      <p className="material-picker-help">
        <span className="material-picker-count" aria-live="polite">
          {withCount(t('studio.materialsCount'), { count: selected.length, max: MAX_SIGN_MATERIALS })}
        </span>
        {withCount(t('studio.materialsHelp'), { max: MAX_SIGN_MATERIALS })}
      </p>

      <div className="material-picker-grid">
        {SIGN_MATERIALS.map((material) => {
          const position = selected.indexOf(material);
          const isSelected = position !== -1;
          const blocked = !isSelected && materialsAtLimit;
          return (
            // The input is nested (no htmlFor) so one tap toggles it exactly once.
            <label
              key={material}
              className={`material-picker-card${isSelected ? ' is-selected' : ''}${blocked ? ' is-blocked' : ''}`}
              title={blocked ? limitMessage : t(`material.${material}`)}
            >
              <input
                className="material-picker-input"
                type="checkbox"
                checked={isSelected}
                disabled={blocked}
                onChange={() => toggleMaterial(material)}
              />
              {isSelected && <span className="material-picker-order" aria-hidden="true">{position + 1}</span>}
              <span className="material-picker-name">{t(`material.${material}`)}</span>
              {isSelected && <Check className="material-picker-check" size={14} aria-hidden="true" />}
            </label>
          );
        })}
      </div>

      {materialsAtLimit && <p className="material-picker-limit" role="status">{limitMessage}</p>}

      {selected.length > 0 && (
        <div className="material-picker-selection">
          <span className="summary-label">{t('studio.materials')}</span>
          <div className="material-picker-chips">
            {selected.map((material, index) => (
              <span className="material-picker-chip" key={material}>
                <i aria-hidden="true">{index + 1}</i>
                {t(`material.${material}`)}
                <button
                  className="material-picker-chip-remove"
                  type="button"
                  onClick={() => setMaterials(selected.filter((entry) => entry !== material))}
                  aria-label={`${t('studio.removeMaterial')} — ${t(`material.${material}`)}`}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
            <button className="text-link material-picker-clear" type="button" onClick={() => setMaterials([])}>
              {t('studio.materialsClear')}
            </button>
          </div>
        </div>
      )}
    </fieldset>
  );
}
