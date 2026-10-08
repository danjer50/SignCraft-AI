import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { messages } from '../i18n/messages';
import { productMessages } from '../i18n/productMessages';

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

function translateWith(locale: Locale) {
  return (key: TranslationKey | string): string => {
    const selected = messages[locale] as Record<string, string>;
    return selected[key] ?? (productMessages[locale] as Record<string, string>)[key] ?? (messages.fr as Record<string, string>)[key] ?? (productMessages.fr as Record<string, string>)[key] ?? key;
  };
}

function isLocale(value: unknown): value is Locale {
  return value === 'fr' || value === 'en' || value === 'ar';
}

function storedLocale(): Locale {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (isLocale(value)) return value;
  } catch {
    // Private browsing may disable local storage; French remains the default.
  }
  return 'fr';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(storedLocale);
  const direction: 'ltr' | 'rtl' = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    // Boot-level side effects: this provider sits outside the page error boundary, so a
    // document that refuses to be mutated (frozen node, sandboxed frame, missing body) must
    // degrade silently instead of unmounting the app into the boot crash screen.
    try {
      document.documentElement.lang = locale;
      document.documentElement.dir = direction;
      if (document.body) document.body.dir = direction;
    } catch {
      // The visible language still switches; only the document metadata is skipped.
    }
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Language still switches for the current session.
    }
  }, [locale, direction]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);
  const t = useMemo(() => translateWith(locale), [locale]);

  const value = useMemo(() => ({ locale, direction, setLocale, t }), [locale, direction, setLocale, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}

/**
 * Translation access for crash screens. It never throws: if the provider itself failed, the
 * fallback still renders localized text from the stored locale instead of a blank page.
 */
export function useSafeLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  const locale = context?.locale ?? storedLocale();
  const direction: 'ltr' | 'rtl' = locale === 'ar' ? 'rtl' : 'ltr';
  const setLocale = useCallback((next: Locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Without a provider the next full page load picks the value up.
    }
    try {
      window.location.reload();
    } catch {
      // A frame that blocks reloading simply keeps the current document.
    }
  }, []);
  const t = useMemo(() => translateWith(locale), [locale]);
  return context ?? { locale, direction, setLocale, t };
}
