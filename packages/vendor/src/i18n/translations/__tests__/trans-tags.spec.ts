import { describe, expect, test } from "vitest"

import en from "../en.json"
import fa from "../fa.json"

/**
 * A `<0>…</0>` tag is markup for `<Trans>`, and only means something where the
 * page renders that key through `<Trans>`. The Persian invite page showed
 * «قبلاً حساب کاربری دارید؟ - <0>وارد شوید</0>» literally: the page reads the key
 * with `t()`, the English string has no tag, and the Persian one kept a tag from
 * an older upstream layout. The English source is what the page was written
 * against, so a translation may use exactly its tags — no more, no fewer.
 */
type Json = { [key: string]: Json | string | string[] }

const flatten = (value: Json, prefix = ""): [string, string][] =>
  Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof child === "string") return [[path, child]]
    if (child && typeof child === "object" && !Array.isArray(child)) {
      return flatten(child as Json, path)
    }
    return []
  })

const tags = (value: string) =>
  [...value.matchAll(/<\/?(\d+)>/g)].map((m) => m[0]).sort()

describe("Trans tags", () => {
  test("fa uses exactly the tags en uses, key by key", () => {
    const english = new Map(flatten(en as Json))
    const mismatched = flatten(fa as Json)
      .filter(([key, value]) => {
        const source = english.get(key)
        return source !== undefined && tags(value).join() !== tags(source).join()
      })
      .map(([key]) => key)

    expect(mismatched).toEqual([])
  })
})
