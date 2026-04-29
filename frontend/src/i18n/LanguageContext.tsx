import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Language, Translations, TranslationKey } from "./types";
import { nn } from "./nn";
import { en } from "./en";
import { STORAGE_KEYS } from "../constants";
import { setValidationLanguage } from "../utils/validation";

const translations: Record<Language, Translations> = { nn, en };

function getStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.LANGUAGE);
    if (stored === "en" || stored === "nn") return stored;
  } catch {}
  return "nn";
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const lang = getStoredLanguage();
    setValidationLanguage(lang);
    return lang;
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    setValidationLanguage(lang);
    try {
      localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
    } catch {}
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => translations[language][key],
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}
