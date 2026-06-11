import { DirectionProvider as RadixDirectionProvider } from "@radix-ui/react-direction"
import { PropsWithChildren, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { languages } from "../../i18n/languages"

type Dir = "ltr" | "rtl"

const getDir = (code?: string): Dir => {
  if (!code) {
    return "ltr"
  }
  const lang =
    languages.find((l) => l.code === code) ??
    languages.find((l) => code.startsWith(l.code))
  return lang && lang.ltr === false ? "rtl" : "ltr"
}

/**
 * Resolves the panel writing direction from the active i18n language (fa, ar,
 * he, … → rtl) and (a) reflects it on `<html dir/lang>` and (b) feeds it to all
 * Radix primitives through Radix's own DirectionProvider, so Selects,
 * dropdowns, popovers, dialogs and the data-grid render in the correct
 * direction. Replaces the host-side MutationObserver workaround.
 */
export const DirectionProvider = ({ children }: PropsWithChildren) => {
  const { i18n } = useTranslation()
  const [dir, setDir] = useState<Dir>(() => getDir(i18n.language))

  useEffect(() => {
    const update = (lng?: string) => setDir(getDir(lng ?? i18n.language))
    update(i18n.language)
    i18n.on("languageChanged", update)
    return () => {
      i18n.off("languageChanged", update)
    }
  }, [i18n])

  useEffect(() => {
    document.documentElement.dir = dir
    if (i18n.language) {
      document.documentElement.lang = i18n.language
    }
  }, [dir, i18n.language])

  return <RadixDirectionProvider dir={dir}>{children}</RadixDirectionProvider>
}
