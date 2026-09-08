import fs from "fs"
import path from "path"
import { describe, expect, test } from "vitest"

/**
 * A user-visible sentence must never be assembled in code.
 *
 * The panel is Persian-first, so an English sentence built with a template
 * literal cannot be translated by anything — not the locale files, not an admin
 * override, not a host-side patch. It simply renders in English to a Persian
 * operator. That is how «{n} available at {m} locations» reached production on
 * the offer detail page of BOTH panels while `products.variant.tableItem` sat
 * translated and unused two directories away.
 *
 * The shape this catches is specific: a template literal that interpolates a
 * value and whose STATIC text — what is left once every `${…}` is removed —
 * reads as English prose. Stripping the expressions first is what makes the
 * check work at all: the string this test was written for ends in a ternary, so
 * a rule that skipped any template containing a `:` skipped the bug itself.
 *
 * Anything inside a `throw` is exempt — a thrown `Error`, or the JSON body of a
 * thrown `Response` that the router turns into a 404 boundary, is a diagnostic
 * for whoever reads the stack trace, not copy for an operator reading a screen.
 */
const pagesDir = path.join(__dirname, "..")

/** Two or more consecutive English words. «available at» is already copy. */
const SENTENCE = /\b[A-Za-z]{2,}\b(?:\s+\b[a-z]{2,}\b){1,}/
/** Static text that is plainly not copy: routes, urls, selectors, operators. */
const NOT_COPY = ["/", "?", "=", ":", "<", ">", "{", "}"]
/** `${…}` — removed before the prose test, never nested in this codebase. */
const INTERPOLATION = /\$\{[^{}]*\}/g
const EXEMPT_CONTEXT = [
  "className",
  "data-testid",
  "import",
  "console",
  "queryKey",
  "href",
]

const tsxFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : tsxFiles(full)
    }
    return entry.name.endsWith(".tsx") ? [full] : []
  })

type Finding = { file: string; line: number; text: string }

/**
 * Is the literal at `index` part of a `throw` statement?
 *
 * Looks back for the nearest `throw` and accepts it only when no `;` closed a
 * statement in between. Bracket-walking is not enough here: the location
 * loaders throw `new Response(JSON.stringify({ message: ... }))`, so the
 * nearest opening brace belongs to the payload object, not to the statement.
 */
const isInsideThrow = (source: string, index: number): boolean => {
  const preceding = source.slice(Math.max(0, index - 300), index)
  const at = preceding.lastIndexOf("throw ")
  return at !== -1 && !preceding.slice(at).includes(";")
}

const findHardcodedSentences = (): Finding[] => {
  const findings: Finding[] = []

  for (const file of tsxFiles(pagesDir)) {
    const source = fs.readFileSync(file, "utf-8")
    const lines = source.split("\n")

    for (const match of source.matchAll(/`([^`]*)`/g)) {
      const body = match[1]
      const index = match.index ?? 0

      if (!body.includes("${")) {
        continue
      }

      const staticText = body.replace(INTERPOLATION, " ")
      if (NOT_COPY.some((token) => staticText.includes(token))) {
        continue
      }
      if (!SENTENCE.test(staticText)) {
        continue
      }
      if (isInsideThrow(source, index)) {
        continue
      }

      const line = source.slice(0, index).split("\n").length
      if (EXEMPT_CONTEXT.some((token) => lines[line - 1]?.includes(token))) {
        continue
      }

      findings.push({
        file: path.relative(pagesDir, file),
        line,
        text: body.replace(/\s+/g, " ").trim().slice(0, 100),
      })
    }
  }

  return findings
}

describe("panel copy", () => {
  test("no user-visible sentence is assembled in a template literal", () => {
    const findings = findHardcodedSentences()

    expect(
      findings,
      findings.length
        ? `Move these into the locale files:\n${findings
            .map((f) => `  ${f.file}:${f.line}  ${f.text}`)
            .join("\n")}`
        : undefined
    ).toEqual([])
  })
})

/**
 * A translated sentence is not localised while its numbers are still Latin.
 *
 * The same inventory count is rendered by two components — `offer-variants-section`
 * (the «متغیرها» table) and `offer-inventory-section` — and both were fixed in the
 * same pass, but only one of them was given the Intl formatter. The result read
 * «100000 موجود در 1 مکان» on a Persian page: the words translated, the digits
 * not, in a script that runs the other way. The test above cannot see this,
 * because by its measure the string is perfectly translated.
 *
 * Scoped deliberately to the interpolations that carry counts. A blanket rule
 * over every `t()` argument would flag ids, currency codes and the `count`
 * plural selector — which i18next reads as a number and must NOT be a string.
 */
describe("panel numbers", () => {
  const COUNT_ARGUMENTS = /^(availableCount|locationCount|itemCount|variantCount)$/

  /** The object literal argument of every `t("…", { … })` call in a file. */
  const interpolationObjects = (source: string): { body: string; offset: number }[] => {
    const objects: { body: string; offset: number }[] = []
    const call = /\bt\(\s*["'`][^"'`]+["'`]\s*,\s*\{/g
    let match: RegExpExecArray | null

    while ((match = call.exec(source))) {
      const open = match.index + match[0].length - 1
      let depth = 0
      let cursor = open
      for (; cursor < source.length; cursor++) {
        if (source[cursor] === "{") depth++
        else if (source[cursor] === "}") {
          depth--
          if (depth === 0) break
        }
      }
      objects.push({ body: source.slice(open, cursor + 1), offset: open })
    }

    return objects
  }

  const countInterpolations = (): Finding[] => {
    const findings: Finding[] = []

    for (const file of tsxFiles(pagesDir)) {
      const source = fs.readFileSync(file, "utf8")

      for (const object of interpolationObjects(source)) {
        for (const property of object.body.matchAll(/(\w+):\s*([^,\n}]+)/g)) {
          const [, key, raw] = property
          if (!COUNT_ARGUMENTS.test(key)) {
            continue
          }
          const value = raw.trim()
          // `number.format(...)` / `formatNumber(...)` are the localised forms;
          // a string literal is already whatever the caller intended.
          if (/\.format\(|^format\w*\(|^["'`]/.test(value)) {
            continue
          }
          findings.push({
            file: path.relative(pagesDir, file),
            line: source.slice(0, object.offset + (property.index ?? 0)).split("\n").length,
            text: `${key}: ${value}`,
          })
        }
      }
    }

    return findings
  }

  test("a count interpolated into a sentence goes through the locale formatter", () => {
    const findings = countInterpolations()

    expect(
      findings,
      findings.length
        ? `Wrap these in the Intl formatter, or Persian pages print Latin digits:\n${findings
            .map((f) => `  ${f.file}:${f.line}  ${f.text}`)
            .join("\n")}`
        : undefined
    ).toEqual([])
  })
})
