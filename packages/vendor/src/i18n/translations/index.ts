import en from "./en.json"
import fa from "./fa.json"

export type TranslationResource = Record<string, unknown>

/**
 * Bundled with the panel: the fallback language and the one the panel opens in.
 * Every other language is fetched when it is selected — eagerly importing all
 * of them put ~8 MB of JSON into the entry chunk every visitor downloads.
 */
const translations: Record<string, { translation: TranslationResource }> = {
  en: {
    translation: en,
  },
  fa: {
    translation: fa,
  },
}

export const lazyTranslations: Record<
  string,
  () => Promise<{ default: TranslationResource }>
> = {
  bs: () => import("./bs.json"),
  bg: () => import("./bg.json"),
  de: () => import("./de.json"),
  el: () => import("./el.json"),
  es: () => import("./es.json"),
  fr: () => import("./fr.json"),
  he: () => import("./he.json"),
  hu: () => import("./hu.json"),
  it: () => import("./it.json"),
  ja: () => import("./ja.json"),
  pl: () => import("./pl.json"),
  ptBR: () => import("./ptBR.json"),
  ptPT: () => import("./ptPT.json"),
  th: () => import("./th.json"),
  tr: () => import("./tr.json"),
  uk: () => import("./uk.json"),
  ro: () => import("./ro.json"),
  mk: () => import("./mk.json"),
  mn: () => import("./mn.json"),
  ar: () => import("./ar.json"),
  zhCN: () => import("./zhCN.json"),
  cs: () => import("./cs.json"),
  ru: () => import("./ru.json"),
  lt: () => import("./lt.json"),
  vi: () => import("./vi.json"),
  ko: () => import("./ko.json"),
  nl: () => import("./nl.json"),
  id: () => import("./id.json"),
  zhTW: () => import("./zhTW.json"),
}

export default translations;
