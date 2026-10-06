import { Check, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';
import { MAX_SIGN_MATERIALS, SIGN_MATERIALS } from '../domain/sign';

function withCount(message: string, values: Record<string, number | string>): string {
  return Object.entries(values).reduce((text, [token, value]) => text.replaceAll(`{${token}}`, String(value)), message);
}

/**
 * Multi-select material picker. One sign may combine several materials; the selection order
 * is preserved and shown, because the first material is treated as the main one by the
 * prompt builder, the quote brief and the professional workspace.
 */
export function MaterialPicker() {
  const { t } = useLanguage();
  const { state, toggleMaterial, setMaterials, materialsAtLimit } = useProject();
  const selected = state.configuration.materials;
  const limitMessage = withCount(t('studio.materialsMax'), { max: MAX_SIGN_MATERIALS });

  return (
    <fieldset className="choice-fieldset material-fieldset">
      <legend>
        <span>{t('studio.materials')}</span>
        <span className="material-count">{withCount(t('studio.materialsCount'), { count: selected.length, max: MAX_SIGN_MATERIALS })}</span>
      </legend>
      <p className="material-help">{withCount(t('studio.materialsHelp'), { max: MAX_SIGN_MATERIALS })}</p>

      <div className="material-grid" role="group" aria-label={t('studio.materials')}>
        {SIGN_MATERIALS.map((material) => {
          const position = selected.indexOf(material);
          const isSelected = position !== -1;
          const blocked = !isSelected && materialsAtLimit;
          return (
            <button
              key={material}
              type="button"
              className={`material-card${isSelected ? ' is-selected' : ''}`}
              onClick={() => toggleMaterial(material)}
              aria-pressed={isSelected}
              disabled={blocked}
              title={blocked ? limitMessage : t(`material.${material}`)}
            >
              {isSelected && <span className="material-order">{position + 1}</span>}
              <span className="material-name">{t(`material.${material}`)}</span>
              {isSelected && <Check className="selected-check" size={14} />}
            </button>
          );
        })}
      </div>

      {materialsAtLimit && <p className="material-limit" role="status">{limitMessage}</p>}

      {selected.length > 0 && (
        <div className="material-selection">
          <span className="summary-label">{t('studio.materials')}</span>
          <div className="material-selection-chips">
            {selected.map((material, index) => (
              <span className="material-chip" key={material}>
                <i>{index + 1}</i>
                {t(`material.${material}`)}
                <button
                  className="material-chip-remove"
                  type="button"
                  onClick={() => setMaterials(selected.filter((entry) => entry !== material))}
                  aria-label={`${t('studio.removeMaterial')} — ${t(`material.${material}`)}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <button className="text-link material-clear" type="button" onClick={() => setMaterials([])}>
              {t('studio.materialsClear')}
            </button>
          </div>
        </div>
      )}
    </fieldset>
  );
}
