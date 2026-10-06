import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from './LanguageContext';
import { SiteHeader } from '../components/SiteHeader';

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = 'fr';
  document.documentElement.dir = 'ltr';
});

describe('language selection', () => {
  it('switches French and English content, then enables Arabic RTL', async () => {
    render(<MemoryRouter><LanguageProvider><SiteHeader onOpenQuote={() => undefined} /></LanguageProvider></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Studio' })).toBeInTheDocument();

    const selector = screen.getByRole('combobox', { name: 'Langue' });
    fireEvent.change(selector, { target: { value: 'en' } });
    expect(await screen.findByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Prepare a quote/i })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');

    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'ar' } });
    expect(await screen.findByRole('link', { name: 'الاستوديو' })).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.dir).toBe('rtl'));
    expect(document.documentElement.lang).toBe('ar');
  });

  it('keeps professional and admin workspaces out of the customer header', () => {
    render(<MemoryRouter><LanguageProvider><SiteHeader onOpenQuote={() => undefined} /></LanguageProvider></MemoryRouter>);

    expect(screen.queryByRole('link', { name: /Espace pro/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Demandes/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(3); // brand, home, studio
  });
});
