import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LanguageProvider } from '../context/LanguageContext';
import { ProjectProvider } from '../context/ProjectContext';
import { MAX_SIGN_MATERIALS, SIGN_MATERIALS } from '../domain/sign';
import { MaterialPicker } from './MaterialPicker';

/** Chip texts, in priority order, with the leading position number stripped. */
function chipLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.material-picker-chip'))
    .map((chip) => (chip.textContent ?? '').replace(/^\d+/, '').trim());
}

function renderPicker() {
  return render(
    <LanguageProvider>
      <ProjectProvider>
        <MaterialPicker />
      </ProjectProvider>
    </LanguageProvider>,
  );
}

const acrylic = () => screen.getByRole('checkbox', { name: /Acrylique \(plexiglas\)/i });
const inox = () => screen.getByRole('checkbox', { name: /^Inox$/i });
const led = () => screen.getByRole('checkbox', { name: /Modules LED/i });
const advise = () => screen.getByRole('checkbox', { name: /Conseillez-moi/i });

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('MaterialPicker multi-selection', () => {
  it('offers every material as an independent checkbox, never as a radio group', () => {
    renderPicker();

    const options = screen.getAllByRole('checkbox');
    expect(options).toHaveLength(SIGN_MATERIALS.length);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    // A native checkbox keeps its own checked state, so one option cannot cancel another.
    expect(options.every((option) => (option as HTMLInputElement).type === 'checkbox')).toBe(true);
    expect(screen.getByText('0 / 6')).toBeInTheDocument();
  });

  it('keeps the previous material selected when a second one is chosen', () => {
    const { container } = renderPicker();

    fireEvent.click(acrylic());
    expect(acrylic()).toBeChecked();

    fireEvent.click(inox());

    // Regression: the second click used to look like a single-select choice.
    expect(inox()).toBeChecked();
    expect(acrylic()).toBeChecked();
    expect(screen.getByText('2 / 6')).toBeInTheDocument();
    expect(chipLabels(container)).toEqual(['Acrylique (plexiglas)', 'Inox']);
  });

  it('selects three materials and shows the chosen ones with their priority order', () => {
    const { container } = renderPicker();

    fireEvent.click(led());
    fireEvent.click(acrylic());
    fireEvent.click(inox());

    expect(screen.getByText('3 / 6')).toBeInTheDocument();
    expect(chipLabels(container)).toEqual(['Modules LED', 'Acrylique (plexiglas)', 'Inox']);

    // Selection is visible three ways: checked input, filled card, numbered order badge.
    expect([led(), acrylic(), inox()].every((option) => (option as HTMLInputElement).checked)).toBe(true);
    const selectedCards = Array.from(container.querySelectorAll('.material-picker-card.is-selected'));
    expect(selectedCards).toHaveLength(3);
    // Priority follows the click order, not the order the options are listed in.
    expect(selectedCards.map((card) => [
      card.querySelector('.material-picker-name')?.textContent,
      card.querySelector('.material-picker-order')?.textContent,
    ])).toEqual([
      ['Acrylique (plexiglas)', '2'],
      ['Inox', '3'],
      ['Modules LED', '1'],
    ]);
    expect(screen.getAllByRole('button', { name: /Retirer cette matière/ })).toHaveLength(3);
  });

  it('unchecking one material leaves the others selected and renumbers them', () => {
    const { container } = renderPicker();

    fireEvent.click(acrylic());
    fireEvent.click(inox());
    fireEvent.click(led());
    fireEvent.click(inox());

    expect(inox()).not.toBeChecked();
    expect(acrylic()).toBeChecked();
    expect(led()).toBeChecked();
    expect(screen.getByText('2 / 6')).toBeInTheDocument();
    expect(chipLabels(container)).toEqual(['Acrylique (plexiglas)', 'Modules LED']);
    expect(Array.from(container.querySelectorAll('.material-picker-order')).map((node) => node.textContent)).toEqual(['1', '2']);
  });

  it('removes a single material from the ordered chip list without touching the rest', () => {
    const { container } = renderPicker();

    fireEvent.click(acrylic());
    fireEvent.click(inox());
    fireEvent.click(led());
    fireEvent.click(screen.getByRole('button', { name: /Retirer cette matière — Acrylique/i }));

    expect(acrylic()).not.toBeChecked();
    expect(inox()).toBeChecked();
    expect(led()).toBeChecked();
    expect(screen.getByText('2 / 6')).toBeInTheDocument();
    expect(chipLabels(container)).toEqual(['Inox', 'Modules LED']);
  });

  it(`stops at ${MAX_SIGN_MATERIALS} materials, refuses more and can clear everything`, () => {
    renderPicker();

    for (let index = 0; index < MAX_SIGN_MATERIALS; index += 1) {
      fireEvent.click(screen.getAllByRole('checkbox')[index]);
    }

    expect(screen.getByText(`${MAX_SIGN_MATERIALS} / ${MAX_SIGN_MATERIALS}`)).toBeInTheDocument();
    const remaining = screen.getAllByRole('checkbox').filter((option) => !(option as HTMLInputElement).checked);
    expect(remaining).toHaveLength(SIGN_MATERIALS.length - MAX_SIGN_MATERIALS);
    expect(remaining.every((option) => (option as HTMLInputElement).disabled)).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent(/Limite de 6 matières atteinte/i);

    fireEvent.click(screen.getByRole('button', { name: /Tout désélectionner/i }));
    expect(screen.getByText('0 / 6')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').every((option) => !(option as HTMLInputElement).checked)).toBe(true);
  });

  it('keeps the “advise me” option and allows it next to real materials', () => {
    const { container } = renderPicker();

    fireEvent.click(acrylic());
    fireEvent.click(advise());

    expect(advise()).toBeChecked();
    expect(acrylic()).toBeChecked();
    expect(chipLabels(container)).toEqual(['Acrylique (plexiglas)', 'Conseillez-moi']);
  });

  it('uses its own class names so the home page material section cannot restyle it', () => {
    const { container } = renderPicker();

    expect(container.querySelector('.material-picker-grid')).not.toBeNull();
    // `.material-grid` belongs to the home page layout (two columns, 60–135px gap).
    expect(container.querySelector('.material-grid')).toBeNull();
    expect(container.querySelector('.material-card')).toBeNull();
  });
});
