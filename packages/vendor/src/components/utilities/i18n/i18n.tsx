import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import { defaultI18nOptions } from "../../../i18n/config";
import { installPersianLocale } from "../../../i18n/persian-locale";
import translations from "../../../i18n/translations";
import customI18nResources from "virtual:mercur/i18n";
import config from "virtual:mercur/config";

// Persian-first panel with a per-app language key, kept independent from the
// admin panel which would otherwise share the `lng` cookie on the same host.
const VENDOR_LNG_KEY = "vendor_lng";
const storedLng =
  typeof localStorage !== "undefined"
    ? localStorage.getItem(VENDOR_LNG_KEY)
    : null;

function deepMerge(
  target: Record<string, any>,
  source: Record<string, any>,
): Record<string, any> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

const mergedTranslations = deepMerge(translations, customI18nResources);

export const I18n = () => {
  if (i18n.isInitialized) {
    return null;
  }

  i18n
    .use(
      new LanguageDetector(null, {
        order: ["localStorage", "navigator"],
        lookupLocalStorage: VENDOR_LNG_KEY,
        caches: ["localStorage"],
      }),
    )
    .use(initReactI18next)
    .init({
      ...defaultI18nOptions,
      detection: {
        order: ["localStorage", "navigator"],
        lookupLocalStorage: VENDOR_LNG_KEY,
        caches: ["localStorage"],
      },
      lng: storedLng || config.i18n?.defaultLanguage || "fa",
      resources: mergedTranslations,
    });

  installPersianLocale();

  return null;
};

export { i18n };
