import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { prefs } from "@/core/platform/prefs";
import enCore from "@/locales/en/core.json";
import koCore from "@/locales/ko/core.json";
import enFood from "@/modules/food/locales/en.json";
import koFood from "@/modules/food/locales/ko.json";

export const LANGUAGES = ["en", "ko"] as const;
export type Language = (typeof LANGUAGES)[number];
export const isLanguage = (x: unknown): x is Language => LANGUAGES.includes(x as Language);

/** Device language if supported, else English. */
export function deviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  return isLanguage(code) ? code : "en";
}

const PREF_KEY = "language";

i18n.use(initReactI18next).init({
  resources: {
    en: { core: enCore, food: enFood },
    ko: { core: koCore, food: koFood },
  },
  lng: deviceLanguage(),
  fallbackLng: "en",
  ns: ["core", "food"],
  defaultNS: "core",
  interpolation: { escapeValue: false },
});

/** The language the user picked in settings on this device (null = follow the device). */
export async function savedLanguage(): Promise<Language | null> {
  const v = await prefs.get(PREF_KEY);
  return isLanguage(v) ? v : null;
}

export async function applyLanguage(lang: Language | null) {
  if (lang) await prefs.set(PREF_KEY, lang);
  else await prefs.remove(PREF_KEY);
  await i18n.changeLanguage(lang ?? deviceLanguage());
}

savedLanguage().then((lang) => {
  if (lang && lang !== i18n.language) i18n.changeLanguage(lang);
});

export default i18n;
