#!/usr/bin/env bun
/**
 * Regenerates `$schema.json` for each panel from its `en.json`.
 *
 * The schema is what every locale file points at via its own `"$schema"` key,
 * so editors use it to flag a typo'd or invented translation key. It was
 * hand-maintained and drifted badly — at upstream tag v2.2.0 it already omitted
 * 92 keys the vendor panel actually shipped — which turns the editor warning
 * into noise and made `validate-translations.spec.ts` red on a clean checkout.
 * It is derivable from `en.json`, so it is generated rather than edited.
 *
 * No `required` lists: all 31 locale files reference this schema and only `en`
 * and `fa` are complete, so declaring every key required would light up the
 * other 29 with errors for keys they legitimately fall back to `en` for.
 * `additionalProperties: false` still catches the case that matters — a key
 * that exists nowhere in the canonical set.
 *
 * Run: bun run scripts/generate-i18n-schema.ts
 */

const PACKAGES = ["vendor", "admin"] as const

type JsonSchema =
  | { type: "string" }
  | { type: "array"; items: { type: "string" } }
  | {
      type: "object"
      properties: Record<string, JsonSchema>
      additionalProperties: false
    }

const toSchema = (value: unknown): JsonSchema => {
  if (Array.isArray(value)) {
    return { type: "array", items: { type: "string" } }
  }

  if (value && typeof value === "object") {
    const properties: Record<string, JsonSchema> = {}
    for (const [key, child] of Object.entries(value)) {
      properties[key] = toSchema(child)
    }
    return { type: "object", properties, additionalProperties: false }
  }

  return { type: "string" }
}

const countKeys = (value: unknown): number => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 1
  }
  return Object.values(value).reduce<number>(
    (total, child) => total + countKeys(child),
    0
  )
}

let failed = false

for (const pkg of PACKAGES) {
  const dir = `packages/${pkg}/src/i18n/translations`
  const enPath = `${dir}/en.json`
  const schemaPath = `${dir}/$schema.json`

  const en = (await Bun.file(enPath).json()) as Record<string, unknown>

  const { $schema: _canonicalRef, ...translations } = en
  const root = toSchema(translations) as Extract<
    JsonSchema,
    { type: "object" }
  >

  const schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object" as const,
    properties: {
      // Every locale file carries this pointer; declare it so it is not
      // reported as an unknown key.
      $schema: { type: "string" as const },
      ...root.properties,
    },
    additionalProperties: false as const,
  }

  const next = JSON.stringify(schema, null, 2) + "\n"
  const previous = await Bun.file(schemaPath)
    .text()
    .catch(() => "")

  if (previous === next) {
    console.log(`✓ ${pkg}: $schema.json already up to date`)
    continue
  }

  if (process.argv.includes("--check")) {
    console.error(
      `✗ ${pkg}: $schema.json is stale — run bun run scripts/generate-i18n-schema.ts`
    )
    failed = true
    continue
  }

  await Bun.write(schemaPath, next)
  console.log(`✓ ${pkg}: $schema.json regenerated (${countKeys(translations)} keys)`)
}

if (failed) {
  process.exit(1)
}
