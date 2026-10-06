import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { LanguageProvider } from '../context/LanguageContext';
import { ProjectProvider } from '../context/ProjectContext';
import { getLocalQuoteRequests } from '../services/quotes/quoteService';
import { QuoteRequestDialog } from './QuoteRequestDialog';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('quote request form', () => {
  it('collects contact details and clearly confirms a browser-local draft', async () => {
    render(<LanguageProvider><ProjectProvider><QuoteRequestDialog open onClose={() => undefined} /></ProjectProvider></LanguageProvider>);

    fireEvent.change(screen.getByLabelText(/Votre nom/i), { target: { value: 'Sami Ben Ali' } });
    fireEvent.change(screen.getByLabelText(/Adresse e-mail/i), { target: { value: 'sami@example.com' } });
    fireEvent.change(screen.getByLabelText(/Téléphone/i), { target: { value: '+216 20 000 000' } });
    fireEvent.change(screen.getByLabelText(/Nom de l’établissement/i), { target: { value: 'Atelier Sable' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer ma demande' }));

    expect(await screen.findByText('Brouillon enregistré sur cet appareil')).toBeInTheDocument();
    expect(screen.getByText(/Aucune demande n’a été transmise/i)).toBeInTheDocument();
    await waitFor(() => expect(getLocalQuoteRequests()).toHaveLength(1));
    expect(getLocalQuoteRequests()[0].customer.email).toBe('sami@example.com');
  });
});
