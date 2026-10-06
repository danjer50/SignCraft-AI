import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { messages } from '../i18n/messages';

export type Locale = 'fr' | 'en' | 'ar';
type TranslationKey = keyof typeof messages.fr;

interface LanguageContextValue {
  locale: Locale;
  direction: 'ltr' | 'rtl';
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey | string) => string;
}

const STORAGE_KEY = 'signcraft:locale';
const LanguageContext = createContext<LanguageContextValue | null>(null);

function initialLocale(): Locale {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'fr' || value === 'en' || value === 'ar') return value;
  } catch {
    // Private browsing may disable local storage; French remains the default.
  }
  return 'fr';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const direction: 'ltr' | 'rtl' = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    document.body.dir = direction;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Language still switches for the current session.
    }
  }, [locale, direction]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);
  const t = useCallback((key: TranslationKey | string) => {
    const selected = messages[locale] as Record<string, string>;
    return selected[key] ?? (messages.fr as Record<string, string>)[key] ?? key;
  }, [locale]);

  const value = useMemo(() => ({ locale, direction, setLocale, t }), [locale, direction, setLocale, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}
